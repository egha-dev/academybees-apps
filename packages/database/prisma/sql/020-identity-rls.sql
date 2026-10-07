-- Identity tables: user-bound RLS (C-59, ADR-005/006). Idempotent; applied after 010-tenant-rls.sql.
--
-- GUCs (transaction-local, set by the tenant-bound client):
--   app.user_id            the signed-in user (or the user a flow has just resolved)
--   app.lookup_identifier  one normalised email/phone being looked up (login, invite, forgot)
--   app.lookup_token       one secret's SHA-256 (refresh token, reset/invite token, OTP identifier)
-- Every lookup exposes at most the row matching a value the caller already holds (as C-51).

CREATE OR REPLACE FUNCTION ab_current_user() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION ab_lookup_identifier() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.lookup_identifier', true), '') $$;

CREATE OR REPLACE FUNCTION ab_lookup_token() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.lookup_token', true), '') $$;

-- Owned by a user: the row's user_id must be the current user (all commands).
CREATE OR REPLACE FUNCTION ab_enable_user_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS user_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY user_isolation ON %s USING (user_id = ab_current_user()) WITH CHECK (user_id = ab_current_user())',
    tbl);
END $$;

-- user: own row; members of the current academy; or the one row being looked up.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_select ON "user";
DROP POLICY IF EXISTS user_insert ON "user";
DROP POLICY IF EXISTS user_update ON "user";
CREATE POLICY user_select ON "user" FOR SELECT USING (
  id = ab_current_user()
  OR email = ab_lookup_identifier()
  OR phone = ab_lookup_identifier()
  OR EXISTS (SELECT 1 FROM membership m
              WHERE m.user_id = "user".id AND m.tenant_id = ab_current_tenant())
);
-- A new user can be created only for the identifier the flow looked up (invite accept, Phase 3+).
CREATE POLICY user_insert ON "user" FOR INSERT WITH CHECK (
  email = ab_lookup_identifier() OR phone = ab_lookup_identifier()
);
CREATE POLICY user_update ON "user" FOR UPDATE
  USING (id = ab_current_user()) WITH CHECK (id = ab_current_user());

-- Owned by one user.
SELECT ab_enable_user_rls('user_credential');
SELECT ab_enable_user_rls('mfa_factor');
SELECT ab_enable_user_rls('mfa_recovery_code');
SELECT ab_enable_user_rls('known_device');
SELECT ab_enable_user_rls('platform_staff');
SELECT ab_enable_user_rls('password_reset_token');
SELECT ab_enable_user_rls('auth_session');

-- Refresh: find the one session whose refresh-token hash the caller presents.
DROP POLICY IF EXISTS token_lookup ON auth_session;
CREATE POLICY token_lookup ON auth_session FOR SELECT
  USING (refresh_token_hash = ab_lookup_token());

-- Password reset: find the one token whose hash the caller presents.
DROP POLICY IF EXISTS token_lookup ON password_reset_token;
CREATE POLICY token_lookup ON password_reset_token FOR SELECT
  USING (token_hash = ab_lookup_token());

-- Invitation (tenant-owned via 010): also the one invitation whose token the caller presents,
-- for accepting on the Family Hub where no academy context exists yet (ADR-039).
DROP POLICY IF EXISTS token_lookup ON invitation;
CREATE POLICY token_lookup ON invitation FOR SELECT
  USING (token_hash = ab_lookup_token());

-- Membership (tenant-owned via 010): a user may list their own memberships only when no academy
-- context is set — the Family Hub fan-out (ADR-039). Inside an academy only that academy's rows.
DROP POLICY IF EXISTS own_memberships ON membership;
CREATE POLICY own_memberships ON membership FOR SELECT
  USING (user_id = ab_current_user() AND ab_current_tenant() IS NULL);

-- OTP challenges (C-65, used from Phase 10): only the one identifier being verified.
ALTER TABLE otp_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenge FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identifier_lookup ON otp_challenge;
CREATE POLICY identifier_lookup ON otp_challenge
  USING (identifier_hash = ab_lookup_token()) WITH CHECK (identifier_hash = ab_lookup_token());

-- Shape checks.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_identifier_shape;
ALTER TABLE "user" ADD CONSTRAINT user_identifier_shape CHECK (
  (email IS NOT NULL OR phone IS NOT NULL)
  AND (email IS NULL OR (email = lower(email) AND email LIKE '%_@_%'))
  AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
);
ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_target_shape;
ALTER TABLE invitation ADD CONSTRAINT invitation_target_shape CHECK (
  (email IS NOT NULL OR phone IS NOT NULL)
  AND (email IS NULL OR email = lower(email))
  AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- Legal acceptance (ADR-034): a user's own rows only; the academy recorded with it must be the
-- current one (or none, on the hub/console). Append-only through grants (000-grants.sql).
ALTER TABLE legal_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON legal_acceptance;
CREATE POLICY user_isolation ON legal_acceptance
  USING (user_id = ab_current_user())
  WITH CHECK (user_id = ab_current_user()
              AND (tenant_id IS NULL OR tenant_id = ab_current_tenant()));
