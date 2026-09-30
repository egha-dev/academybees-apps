#!/usr/bin/env bash
# Apply AcademyBee repository governance (ADR-041, IMPLEMENTATION_PLAN task 0.18) with the gh CLI.
#
#   scripts/github/apply-governance.sh [--dry-run] [--repo owner/name]
#
# Idempotent: every call is a PUT/PATCH or "create if missing", so it can be re-run safely.
# Features the current GitHub plan does not support are reported as SKIPPED (not fatal);
# the Phase 0 repository gate stays FAIL until they apply (OD-19, C-43).
# Documentation: docs/runbooks/github-governance.md
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-egha-dev/academybees-apps}"
DRY_RUN=0
PO_LOGIN="${PO_LOGIN:-egha-dev}"

# Required status checks = CI job names (.github/workflows/*.yml). Keep in sync with CI.
REQUIRED_CHECKS=(verify integration build e2e pr-title)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --repo) REPO="$2"; shift ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

APPLIED=()
SKIPPED=()

# api METHOD PATH [JSON_BODY] — prints the call in dry-run, otherwise performs it.
api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ $DRY_RUN -eq 1 ]]; then
    # shellcheck disable=SC2016 # the single quotes are literal output
    echo "DRY-RUN gh api -X $method $path${body:+ --input <<<'$body'}"
    return 0
  fi
  if [[ -n "$body" ]]; then
    gh api -X "$method" "$path" --input - <<<"$body" >/dev/null
  else
    gh api -X "$method" "$path" >/dev/null
  fi
}

# step NAME METHOD PATH [BODY] — records APPLIED or SKIPPED (with the API error) and continues.
step() {
  local name="$1"; shift
  local err
  if err=$(api "$@" 2>&1); then
    [[ $DRY_RUN -eq 1 ]] && echo "$err"
    APPLIED+=("$name")
  elif grep -qi "already exists" <<<"$err"; then
    APPLIED+=("$name (already present)")
  else
    SKIPPED+=("$name — $(tr '\n' ' ' <<<"$err" | cut -c1-160)")
  fi
}

checks_json() {
  local out="" c
  for c in "${REQUIRED_CHECKS[@]}"; do out+="{\"context\":\"$c\"},"; done
  echo "[${out%,}]"
}

echo "Repository: $REPO $([[ $DRY_RUN -eq 1 ]] && echo '(dry run)')"

# 1. Merge settings: squash only, auto-merge on, delete head branches, PR title as commit title.
step "merge settings (squash only, auto-merge, delete branch on merge)" PATCH "repos/$REPO" \
  '{"allow_squash_merge":true,"allow_merge_commit":false,"allow_rebase_merge":false,"allow_auto_merge":true,"delete_branch_on_merge":true,"squash_merge_commit_title":"PR_TITLE","squash_merge_commit_message":"PR_BODY"}'

# 2. Actions: read-only token by default. GitHub's single toggle "create and approve pull requests"
#    must be on for release-please to open its release PR with GITHUB_TOKEN.
step "actions workflow permissions" PUT "repos/$REPO/actions/permissions/workflow" \
  '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}'

# 3. Ruleset on main: PR required, required checks, linear history, no force-push or deletion,
#    conversation resolution. Needs GitHub Pro/Team for a private repo (OD-19).
RULESET_NAME="main protection (ADR-041)"
RULESET_BODY=$(cat <<JSON
{
  "name": "$RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": $(checks_json) } }
  ]
}
JSON
)
if [[ $DRY_RUN -eq 1 ]]; then
  step "ruleset: $RULESET_NAME" POST "repos/$REPO/rulesets" "$(tr -d '\n' <<<"$RULESET_BODY")"
elif existing=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null); then
  if [[ -n "$existing" ]]; then
    step "ruleset: $RULESET_NAME (update)" PUT "repos/$REPO/rulesets/$existing" "$RULESET_BODY"
  else
    step "ruleset: $RULESET_NAME (create)" POST "repos/$REPO/rulesets" "$RULESET_BODY"
  fi
else
  SKIPPED+=("ruleset: $RULESET_NAME — rulesets unavailable on this plan (GitHub Pro/Team needed, OD-19)")
fi

# 4. Security: Dependabot alerts, secret scanning + push protection.
step "Dependabot vulnerability alerts" PUT "repos/$REPO/vulnerability-alerts"
step "Dependabot security updates" PUT "repos/$REPO/automated-security-fixes"
step "secret scanning + push protection" PATCH "repos/$REPO" \
  '{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}'

# 5. Environments: staging (automatic from main) and production (PO approval, v* tags only).
step "environment: staging" PUT "repos/$REPO/environments/staging" \
  '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
step "environment: staging deploys from main only" POST "repos/$REPO/environments/staging/deployment-branch-policies" \
  '{"name":"main","type":"branch"}'

po_id=""
if [[ $DRY_RUN -eq 0 ]]; then
  po_id=$(gh api "users/$PO_LOGIN" --jq .id 2>/dev/null || true)
fi
step "environment: production (PO required reviewer)" PUT "repos/$REPO/environments/production" \
  "{\"reviewers\":[{\"type\":\"User\",\"id\":${po_id:-0}}],\"prevent_self_review\":false,\"deployment_branch_policy\":{\"protected_branches\":false,\"custom_branch_policies\":true}}"
step "environment: production deploys from v* tags only" POST "repos/$REPO/environments/production/deployment-branch-policies" \
  '{"name":"v*","type":"tag"}'

echo
echo "APPLIED (${#APPLIED[@]}):"
for s in "${APPLIED[@]}"; do echo "  ✔ $s"; done
echo "SKIPPED (${#SKIPPED[@]}):"
for s in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do echo "  ✖ $s"; done
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo
  echo "Skipped items need a paid plan or a manual step — see docs/runbooks/github-governance.md."
fi
