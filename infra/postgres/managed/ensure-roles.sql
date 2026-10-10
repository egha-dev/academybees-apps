-- Ensure the AcademyBee roles exist on a managed PostgreSQL (Railway staging/production, C-75).
-- Idempotent: the deploy workflow runs it before every migration, as the provider's admin user,
-- with passwords from GitHub secrets (never stored in the repo):
--
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v migrator_password="$MIGRATOR_PW" -v app_password="$APP_PW" -v platform_password="$PLATFORM_PW" \
--     -f infra/postgres/managed/ensure-roles.sql
--
-- Same roles and grants as roles.sql / infra/postgres/init (ADR-005): ab_migrator owns the schema,
-- ab_app has NO BYPASSRLS, ab_platform (BYPASSRLS) is for src/platform/** only. Passwords are set
-- on every run, so rotating one is: change the secret (and Railway variable), then redeploy.

SELECT format('CREATE ROLE ab_migrator LOGIN NOSUPERUSER NOCREATEROLE')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ab_migrator') \gexec
SELECT format('CREATE ROLE ab_app LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ab_app') \gexec
SELECT format('CREATE ROLE ab_platform LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ab_platform') \gexec

SELECT format('ALTER ROLE ab_migrator PASSWORD %L', :'migrator_password') \gexec
SELECT format('ALTER ROLE ab_app PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER ROLE ab_platform PASSWORD %L', :'platform_password') \gexec

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

-- Extensions the schema needs, created by the admin user: ab_migrator owns the schema but not the
-- database, so it may not create extensions on a managed PostgreSQL (Phase 4: staging deploy of
-- 42eccc7 failed with "permission denied to create extension pg_trgm"). The migration's own
-- `CREATE EXTENSION IF NOT EXISTS` is then a no-op. pg_trgm: name search (ADR-026, C-105).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- One-off repair for that failed deploy: `20261010090000_people_workspaces` failed on its first
-- statement (CREATE EXTENSION), so nothing of it was applied. Mark the attempt rolled back, as
-- `prisma migrate resolve --rolled-back` would, so `migrate deploy` applies it again. Matches only
-- an unfinished, not yet resolved attempt of that one migration; a no-op everywhere else.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    UPDATE public._prisma_migrations
       SET rolled_back_at = now()
     WHERE migration_name = '20261010090000_people_workspaces'
       AND finished_at IS NULL
       AND rolled_back_at IS NULL;
  END IF;
END $$;
