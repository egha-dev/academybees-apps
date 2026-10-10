-- Family Hub linking (Phase 4, G-31, ADR-039, C-107). Idempotent; applied after 010–040.

-- Link attempts are the parent's own rows: never readable by an academy (no tenant policy, so a
-- tenant context alone sees nothing). The hub works with them as the user (app.user_id), inside
-- the academy's context for the parent lookup itself. Rows are only created and updated.
ALTER TABLE academy_link_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_link_attempt FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON academy_link_attempt;
CREATE POLICY user_isolation ON academy_link_attempt
  USING (user_id = ab_current_user())
  WITH CHECK (user_id = ab_current_user());
REVOKE DELETE, TRUNCATE ON academy_link_attempt FROM ab_app;

-- Join requests are kept with their decision (history): not deleted by the app role.
REVOKE DELETE, TRUNCATE ON join_request FROM ab_app;
