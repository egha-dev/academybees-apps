-- AcademyBee database roles (ADR-005, ARCHITECTURE §8.2). Runs once when the local
-- Postgres volume is created; Testcontainers helpers run the same file.
-- Passwords are for local development and CI only. Staging/production roles are created
-- by the runbook with secrets from the secret store.
--
--   ab_migrator  owns the schema; runs migrations only.
--   ab_app       the application role: NO BYPASSRLS, cannot UPDATE/DELETE the audit log.
--   ab_platform  cross-tenant platform role, used only by src/platform/** (audited).

CREATE ROLE ab_migrator LOGIN PASSWORD 'ab_migrator_local' NOSUPERUSER NOCREATEROLE CREATEDB;
CREATE ROLE ab_app      LOGIN PASSWORD 'ab_app_local'      NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
CREATE ROLE ab_platform LOGIN PASSWORD 'ab_platform_local' NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS;

CREATE DATABASE academybee      OWNER ab_migrator;
CREATE DATABASE academybee_test OWNER ab_migrator;
-- Prisma shadow database for `prisma migrate dev` / drift checks.
CREATE DATABASE academybee_shadow OWNER ab_migrator;
