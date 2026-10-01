-- Idempotent grants applied after every migration run (pnpm db:migrate / db:deploy), as ab_migrator.
-- Default privileges (infra/postgres/init/sql/grants.sql) already give ab_app/ab_platform DML on new
-- tables; this file tightens what must never be allowed (ADR-005, ADR-027).

-- Audit log is append-only for the application roles.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ab_app, ab_platform;
GRANT SELECT, INSERT ON audit_log TO ab_app, ab_platform;

-- Flag definitions are written by the migrator/seed only; the app reads them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON feature_flag FROM ab_app;
GRANT SELECT ON feature_flag TO ab_app;

-- Flag overrides are changed by platform staff (console, Phase 14) or the migrator, never by tenant code.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON feature_flag_override FROM ab_app;
GRANT SELECT ON feature_flag_override TO ab_app;

-- Tenants and their domains are created and re-pointed only by platform staff (provisioning,
-- domain changes — audited, PRD v3.1 §B, §F). Tenant code may read them and update the academy row.
REVOKE INSERT, DELETE, TRUNCATE ON tenant FROM ab_app;
GRANT SELECT, UPDATE ON tenant TO ab_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenant_domain FROM ab_app;
GRANT SELECT ON tenant_domain TO ab_app;

-- Configuration rows are never deleted by tenant code (one per tenant).
REVOKE DELETE, TRUNCATE ON tenant_branding, tenant_settings FROM ab_app;
REVOKE TRUNCATE ON branch FROM ab_app;
