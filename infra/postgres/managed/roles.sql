-- Create the AcademyBee roles on a managed PostgreSQL (staging/production, OD-03: Supabase).
-- Run ONCE per environment as the provider's admin user, with passwords from the secret store:
--
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v migrator_password="$MIGRATOR_PW" -v app_password="$APP_PW" -v platform_password="$PLATFORM_PW" \
--     -f infra/postgres/managed/roles.sql
--
-- Mirrors infra/postgres/init (local): ab_migrator owns the schema; ab_app has NO BYPASSRLS;
-- ab_platform (BYPASSRLS) is for src/platform/** only (ADR-005). Never reuse local passwords.

CREATE ROLE ab_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEROLE;
CREATE ROLE ab_app      LOGIN PASSWORD :'app_password'      NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
CREATE ROLE ab_platform LOGIN PASSWORD :'platform_password' NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS;

-- The application lives in the default database's public schema, owned by ab_migrator.
GRANT ab_migrator TO CURRENT_USER;
ALTER SCHEMA public OWNER TO ab_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ab_app, ab_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ab_app, ab_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ab_app, ab_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO ab_app, ab_platform;
