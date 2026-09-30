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
