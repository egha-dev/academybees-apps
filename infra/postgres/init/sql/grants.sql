-- Per-database grants. Tables are created by ab_migrator; default privileges give the
-- runtime roles DML only. Audit log UPDATE/DELETE is revoked in the migration that creates it.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO ab_migrator;
GRANT USAGE ON SCHEMA public TO ab_app, ab_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ab_app, ab_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ab_app, ab_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE ab_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO ab_app, ab_platform;
