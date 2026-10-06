# Self-hosted CI runner (C-81)

CI and deploy workflows run on the PO's own machine, a GitHub Actions self-hosted runner in the WSL2
Ubuntu distro where the repo lives (OD-20). GitHub-hosted runners are unavailable while the
account has no Actions budget. The repository stays **private**: never make it public while this
runner is attached, because a fork's pull request could then run code on the PO's PC.

## Which runner a job uses

Every workflow reads `runs-on` from the repository variable **`CI_RUNS_ON`** (JSON):

| Value | Runner |
| --- | --- |
| `["self-hosted","academybee"]` | the WSL runner `wsl-dev` (current) |
| unset | GitHub-hosted `ubuntu-latest` |

```bash
gh variable set CI_RUNS_ON --body '["self-hosted","academybee"]'   # use the WSL runner
gh variable delete CI_RUNS_ON                                       # back to GitHub-hosted
```

## Isolation from development

- One runner runs **one job at a time**: a pull request's checks run one after another (~30–40 min).
- `verify`, `build` and `integration` need no fixed ports (Testcontainers picks free ones).
- `e2e` starts its **own Compose project `academybee-ci`** on ports 55432 (Postgres), 56379 (Redis),
  51025/58025 (Mailpit), with the API on 4300, web on 3300–3302 and Lighthouse on 3310. It starts
  from a fresh database (`down -v` before and after). The dev containers (`academybee-*`) and their
  data, and `pnpm dev` on 3000/4000, are never touched.
- Each job checks out into `~/actions-runner/_work`; the pnpm store and Playwright browsers in the
  home directory are shared with development (read-mostly caches).

## One-time setup (done 2026-10-06, no `sudo` needed)

1. Tools the jobs expect that GitHub images have: static `shellcheck` and `jq` binaries in
   `~/.local/bin` (first on the runner's PATH, `~/actions-runner/.path`). The Playwright system
   libraries were already installed for local E2E (`pnpm --filter @academybee/e2e exec playwright install-deps`
   needs `sudo` on a fresh machine). The runner has no `sudo`; on it the `e2e` job only downloads
   the browsers.
2. Runner in `~/actions-runner` (outside the repo), registered with name `wsl-dev`, label
   `academybee`:
   ```bash
   ./config.sh --unattended --url https://github.com/egha-dev/academybees-apps \
     --token "$(gh api -X POST repos/egha-dev/academybees-apps/actions/runners/registration-token -q .token)" \
     --name wsl-dev --labels academybee --work _work
   ```
3. **User service** (systemd is on in `/etc/wsl.conf`): `~/.config/systemd/user/actions-runner.service`
   runs `~/actions-runner/run.sh` with `Restart=always`; enabled with
   `systemctl --user enable --now actions-runner` and `loginctl enable-linger "$USER"`, so it
   starts with WSL and doesn't need a terminal session. (`sudo ./svc.sh install` would do the
   same as a system service; it isn't used.)
4. Keep WSL running: keep a WSL terminal open, or add a Windows Task Scheduler task at log-on that
   runs `wsl.exe -d Ubuntu --exec sleep infinity`. Docker Desktop must be running, and Windows must
   not sleep while plugged in.

## Day to day

- Status: `systemctl --user status actions-runner` (logs: `journalctl --user -u actions-runner -f`), or
  `gh api repos/egha-dev/academybees-apps/actions/runners -q '.runners[] | "\(.name) \(.status) \(.busy)"'`.
- A check waits as **Queued** while the PC is off or asleep, and starts when it is back.
- It starts by itself with WSL (user service + linger). Restart: `systemctl --user restart actions-runner`.
- Runner updates: the runner updates itself. To remove it:
  `systemctl --user disable --now actions-runner && ./config.sh remove --token <removal token from the Runners page>`.
- Leftover CI containers after a crash: `docker compose -p academybee-ci -f infra/docker-compose.yml down -v`.
