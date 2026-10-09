-- Finishing the guided setup opens the academy (C-87). Tenant code may not change `tenant.status`
-- (000-grants.sql), so this one transition is a narrow SECURITY DEFINER function: only the
-- academy of the current context, only SETUP → ACTIVE. It runs as the schema owner, which is
-- still subject to FORCE RLS, so `app.tenant_id` must be set (the tenant-bound client sets it).
CREATE OR REPLACE FUNCTION ab_activate_current_tenant() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
DECLARE changed integer;
BEGIN
  UPDATE tenant
     SET status = 'ACTIVE', status_changed_at = now(), updated_at = now()
   WHERE id = ab_current_tenant() AND status = 'SETUP';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END $$;

REVOKE ALL ON FUNCTION ab_activate_current_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ab_activate_current_tenant() TO ab_app;
