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
-- domain changes — audited, PRD v3.1 §B, §F). Tenant code may read the academy row and update
-- only its descriptive columns: never status, slug, id or created_by (review M2).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenant FROM ab_app;
GRANT SELECT ON tenant TO ab_app;
GRANT UPDATE (name, academy_type, timezone, locale, currency, updated_at) ON tenant TO ab_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenant_domain FROM ab_app;
GRANT SELECT ON tenant_domain TO ab_app;

-- Configuration rows are never deleted by tenant code (one per tenant).
REVOKE DELETE, TRUNCATE ON tenant_branding, tenant_settings FROM ab_app;
REVOKE TRUNCATE ON branch FROM ab_app;

-- Identity (Phase 2, C-59). History is never deleted by the app role: sessions and tokens are
-- revoked/used, users disabled. Platform staff are managed by the platform role / CLI only.
REVOKE DELETE, TRUNCATE ON "user", user_credential, auth_session, password_reset_token,
  invitation, membership FROM ab_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON platform_staff FROM ab_app;
GRANT SELECT ON platform_staff TO ab_app;
REVOKE TRUNCATE ON role, role_permission, membership_role, mfa_factor, mfa_recovery_code,
  known_device, otp_challenge FROM ab_app;
