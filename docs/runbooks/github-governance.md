# Runbook — GitHub repository governance (ADR-041)

Repository: `egha-dev/academybees-apps` (OD-19). Automation: `scripts/github/apply-governance.sh`.

## What is in the repository (always)

| File | Purpose |
| --- | --- |
| `.github/CODEOWNERS` | PO (`@egha-dev`) owns `docs/`, `infra/`, `packages/database/`, `.github/`, `CLAUDE.md` |
| `.github/pull_request_template.md` | Definition of Done checklist (CLAUDE.md §13) |
| `.github/ISSUE_TEMPLATE/` | Bug, pilot feedback, decision needed |
| `.github/workflows/ci.yml` | Required checks (`verify`, later `integration`, `build`, `e2e`) |
| `.github/workflows/pr-title.yml` | `pr-title` check: commitlint on the PR title (the squash commit message) |
| `.github/workflows/release-please.yml` + `release-please-config.json` | One product version, `CHANGELOG.md`, release PR → `v*` tag |
| `renovate.json` | Weekly grouped updates; patch updates auto-merge when green; majors need approval |

## What the script configures

Run `scripts/github/apply-governance.sh --dry-run` to print every API call, then run it without the flag. It is idempotent.

| Setting | Needs a paid plan for a private repo? |
| --- | --- |
| Squash-only merges, PR title as commit title, auto-merge allowed, delete head branch after merge | No |
| Actions token read-only by default; Actions may create PRs (release-please) | No |
| `main` ruleset: PR required, required checks `verify, integration, build, e2e, pr-title`, linear history, no force-push/deletion, conversations resolved | **Yes** (GitHub Pro / Team) |
| Dependabot alerts + security updates | No |
| Secret scanning + push protection | **Yes** (GitHub Secret Protection on private repos) |
| Environments `staging` (deploys from `main`) and `production` (`v*` tags, PO as required reviewer) | Environments on private repos and required reviewers need Pro/Team |

The script reports each item as **APPLIED** or **SKIPPED** with the API's reason. Skipped items keep the Phase 0 repository gate items FAIL.

## Until the paid plan is active (C-43)

- Every slice still goes branch → PR → CI.
- Claude merges only after every check is green (`gh pr checks --watch`, then `gh pr merge --squash --delete-branch`). Nobody pushes to `main`.
- Production deploys use the PO-only `workflow_dispatch` fallback (ADR-041).

## Manual steps (once)

1. Upgrade the account to **GitHub Pro** (or move the repo to an organisation on **Team**), then run the script.
2. Install the **Renovate** GitHub App for this repository (https://github.com/apps/renovate). It opens an onboarding PR; merge it.
3. When the required-checks list changes (new CI job), update `REQUIRED_CHECKS` in the script and re-run it.

## Verify (Phase 0 exit gate)

- `git push origin main` from a local clone is rejected.
- A PR with a failing check shows "Merging is blocked".
- A green PR with auto-merge enabled merges by itself and triggers the staging deploy.
