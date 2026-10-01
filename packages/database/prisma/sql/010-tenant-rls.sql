-- Tenant isolation in the database (ADR-005, ARCHITECTURE §8.2). Idempotent; applied as ab_migrator
-- after every `pnpm db:migrate` / `db:deploy`, so a new table with a tenant_id column gets RLS on the
-- next run without anyone remembering to add it. `rls-coverage.int.spec.ts` fails if one ever doesn't.
--
-- Context comes from transaction-local GUCs set by the tenant-bound client (`set_config(…, true)`):
--   app.tenant_id   the tenant of the current request/job
--   app.lookup_host the one hostname being resolved before a tenant is known (C-51)
-- Unset → policies match nothing (fail closed). NULLIF: once a session has set a GUC it reads ''
-- after the transaction ends, and ''::uuid would raise.

CREATE OR REPLACE FUNCTION ab_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION ab_lookup_host() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.lookup_host', true), '') $$;

-- Standard policy: rows of the current tenant only, for reads and writes.
CREATE OR REPLACE FUNCTION ab_enable_tenant_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = ab_current_tenant()) WITH CHECK (tenant_id = ab_current_tenant())',
    tbl);
END $$;

-- Core tables that also hold platform/system rows (tenant_id NULL) — C-53: tenant rows for the
-- current tenant; NULL rows only when no tenant context is set.
CREATE OR REPLACE FUNCTION ab_enable_platform_row_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (tenant_id = ab_current_tenant() OR (tenant_id IS NULL AND ab_current_tenant() IS NULL))
       WITH CHECK (tenant_id = ab_current_tenant() OR (tenant_id IS NULL AND ab_current_tenant() IS NULL))',
    tbl);
END $$;

SELECT ab_enable_platform_row_rls('audit_log');
SELECT ab_enable_platform_row_rls('outbox_event');
SELECT ab_enable_platform_row_rls('idempotency_record');

-- Release-flag overrides: global rows plus the current tenant's (C-53). ab_app is read-only here
-- (000-grants.sql); the migrator writes overrides with the matching context.
ALTER TABLE feature_flag_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_override FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON feature_flag_override;
CREATE POLICY tenant_isolation ON feature_flag_override
  USING (tenant_id IS NULL OR tenant_id = ab_current_tenant())
  WITH CHECK (tenant_id IS NULL OR tenant_id = ab_current_tenant());

-- Every other table with a tenant_id column gets the standard policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenant_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('audit_log', 'outbox_event', 'idempotency_record', 'feature_flag_override')
  LOOP
    PERFORM ab_enable_tenant_rls(format('%I', r.table_name)::regclass);
  END LOOP;
END $$;

-- The tenant row itself is keyed on id.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING (id = ab_current_tenant())
  WITH CHECK (id = ab_current_tenant());

-- Host lookup (C-51): before a tenant is known, the resolver may read only the domain row whose
-- hostname it was given, and the tenant that row points to. SELECT only.
DROP POLICY IF EXISTS host_lookup ON tenant_domain;
CREATE POLICY host_lookup ON tenant_domain FOR SELECT
  USING (hostname = ab_lookup_host());

DROP POLICY IF EXISTS host_lookup ON tenant;
CREATE POLICY host_lookup ON tenant FOR SELECT
  USING (id IN (SELECT d.tenant_id FROM tenant_domain d WHERE d.hostname = ab_lookup_host()));

-- Hostname shape (C-52): lower-case; SUBDOMAIN rows hold a label (no dot), CUSTOM rows a full host.
ALTER TABLE tenant_domain DROP CONSTRAINT IF EXISTS tenant_domain_hostname_shape;
ALTER TABLE tenant_domain ADD CONSTRAINT tenant_domain_hostname_shape CHECK (
  hostname = lower(hostname)
  AND ((kind = 'SUBDOMAIN' AND position('.' IN hostname) = 0)
    OR (kind = 'CUSTOM' AND position('.' IN hostname) > 0))
);
