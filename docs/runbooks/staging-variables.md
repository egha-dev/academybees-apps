# Staging variables checklist (S7b, C-75)

Step-by-step setup of the Railway variables and GitHub secrets for `academybee-staging`. **This file contains no secret values.** Every secret is generated on your machine and pasted straight into Railway or GitHub. Never paste one into a chat, issue or PR.

Background and the reasons behind each choice: [`environments.md`](environments.md) ("Railway staging project").

---

## A. Generate the secrets (WSL terminal, in the repo)

```bash
cd ~/academybees-apps
git fetch origin
git checkout p2/staging          # until the S7b PR is merged; afterwards use main
scripts/staging/secrets.sh generate
```

This creates 7 values in `~/.academybee-staging-secrets` (readable only by you):

```text
DB_MIGRATOR_PASSWORD
DB_APP_PASSWORD
DB_PLATFORM_PASSWORD
TRUSTED_PROXY_SECRET
SECRETS_MASTER_KEY
ANALYTICS_HASH_SALT
AUTH_SIGNING_KEYS
```

Running `generate` again keeps existing values.

**How to paste a value:** wherever this checklist says **copy NAME**, run

```bash
scripts/staging/secrets.sh copy NAME
```

The value goes to your Windows clipboard and is not shown. Paste with **Ctrl+V**. Afterwards, copy something else to clear the clipboard.

---

## B. Railway shared variables

1. Open [railway.com/dashboard](https://railway.com/dashboard), then the project **`academybee-staging`**.
2. Click **Settings** (top right of the project), then **Shared Variables**.
3. For each row below: click **New Variable**, enter the **Name**, enter the **Value**, then click **Add**.

| Name | Value |
| --- | --- |
| `APP_ENV` | type `staging` |
| `PLATFORM_ROOT_DOMAIN` | type `staging.academybees.com` |
| `TRUSTED_PROXY_SECRET` | copy TRUSTED_PROXY_SECRET |
| `SECRETS_MASTER_KEY` | copy SECRETS_MASTER_KEY |
| `ANALYTICS_HASH_SALT` | copy ANALYTICS_HASH_SALT |
| `DB_APP_PASSWORD` | copy DB_APP_PASSWORD |
| `DB_PLATFORM_PASSWORD` | copy DB_PLATFORM_PASSWORD |

`DB_MIGRATOR_PASSWORD` is **not** added to Railway; it goes only to GitHub (step E).

---

## C. Per-service variables

For each service (`api`, `worker`, `web`):

1. On the project canvas, click the service.
2. Open the **Variables** tab.
3. Click **Raw Editor**.
4. Select everything already in the editor and **replace it** with the block below. The blocks keep `RAILWAY_DOCKERFILE_PATH`, which you set earlier.
5. Click **Update Variables**.

The blocks contain no secrets. They only reference the shared variables (`${{shared.…}}`) and the other services (`${{postgres.…}}`, `${{redis.…}}`, `${{api.…}}`). They assume your services are named exactly `postgres`, `redis` and `api`. If Railway shows a name with different capitals (for example `Postgres`), change that word in the block to match.

### C1. `api`

```text
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
APP_ENV=${{shared.APP_ENV}}
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgresql://ab_app:${{shared.DB_APP_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}?family=0
TRUSTED_PROXY_SECRET=${{shared.TRUSTED_PROXY_SECRET}}
SECRETS_MASTER_KEY=${{shared.SECRETS_MASTER_KEY}}
ANALYTICS_HASH_SALT=${{shared.ANALYTICS_HASH_SALT}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
COOKIE_MODE=secure
CUSTOM_DOMAINS_ENABLED=false
PAYMENT_PROVIDERS=manual
```

Then add the signing keys as a separate variable (not in the Raw Editor):

1. **Variables** tab → **New Variable**.
2. Name: `AUTH_SIGNING_KEYS`.
3. Value: copy AUTH_SIGNING_KEYS. It is JSON starting with `{"current":"s1"`. Paste it exactly as is, **without quotes** around it.
4. Click **Add**.

Leave `CONSOLE_IP_ALLOWLIST` unset on staging. Console sign-in still needs password + TOTP.

### C2. `worker`

```text
RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile
APP_ENV=${{shared.APP_ENV}}
LOG_LEVEL=info
DATABASE_URL=postgresql://ab_app:${{shared.DB_APP_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
PLATFORM_DATABASE_URL=postgresql://ab_platform:${{shared.DB_PLATFORM_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}?family=0
SECRETS_MASTER_KEY=${{shared.SECRETS_MASTER_KEY}}
ANALYTICS_HASH_SALT=${{shared.ANALYTICS_HASH_SALT}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
WEB_PUBLIC_PROTOCOL=https
EMAIL_FROM=AcademyBee <no-reply@mail.staging.academybees.com>
SMTP_URL=smtps://resend:${{RESEND_API_KEY}}@smtp.resend.com:465
```

Then add the Resend key as a separate variable:

1. **Variables** tab → **New Variable**.
2. Name: `RESEND_API_KEY`.
3. Value: paste your Resend **sending-only** API key (from Resend → API Keys).
4. Click **Add**.

`SMTP_URL` above references `RESEND_API_KEY`, so the key is stored in one place only.

### C3. `web`

```text
RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
APP_ENV=${{shared.APP_ENV}}
PORT=3000
API_ORIGIN=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
TRUSTED_PROXY_SECRET=${{shared.TRUSTED_PROXY_SECRET}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
CUSTOM_DOMAINS_ENABLED=false
TRUSTED_CLIENT_IP_HEADER=x-real-ip
NEXT_PUBLIC_APP_ENV=staging
```

**If Railway shows a "changes to apply" / "Deploy" banner:** apply it. The services can't run until the first deploy from GitHub, so failed or empty deployments before then are expected.

---

## D. Health checks and the database's public endpoint

1. **`api`** → **Settings** → **Deploy** → **Healthcheck Path**: enter `/api/v1/health/live`.
2. **`web`** → **Settings** → **Deploy** → **Healthcheck Path**: enter `/offline`.
3. **`worker`**: no health check (it has no HTTP port).
4. **`postgres`** → **Settings** → **Networking** → **Public Networking**:
   - It should show a TCP proxy address like `<something>.proxy.rlwy.net:<port>`.
   - If it doesn't, click **TCP Proxy**, enter port `5432`, and confirm.
   - GitHub Actions uses this endpoint to create the database roles and run migrations.

---

## E. GitHub secrets and variables

Repository: [egha-dev/academybees-apps](https://github.com/egha-dev/academybees-apps) → **Settings** → **Secrets and variables** → **Actions**.

### E1. Admin database URL (from Railway, via the UI)

1. In Railway, open **`postgres`** → **Variables**, find **`DATABASE_PUBLIC_URL`**, and click its **copy icon**. You don't need to reveal it.
2. In GitHub, open the **Secrets** tab → **New repository secret**.
3. Name: `STAGING_ADMIN_DATABASE_URL`.
4. Paste into **Secret**, then click **Add secret**.

### E2. Database passwords (from the terminal, via `gh`)

First check you are signed in as `egha-dev`:

```bash
gh auth status
```

Then:

```bash
scripts/staging/secrets.sh gh DB_MIGRATOR_PASSWORD STAGING_DB_MIGRATOR_PASSWORD
scripts/staging/secrets.sh gh DB_APP_PASSWORD STAGING_DB_APP_PASSWORD
scripts/staging/secrets.sh gh DB_PLATFORM_PASSWORD STAGING_DB_PLATFORM_PASSWORD
```

*Alternative without `gh`:* for each one, click **New repository secret**, enter the name, run `scripts/staging/secrets.sh copy DB_…_PASSWORD`, paste, and click **Add secret**.

### E3. Check the secrets list

The **Secrets** tab should now show exactly these staging secrets (values hidden):

```text
RAILWAY_TOKEN
STAGING_ADMIN_DATABASE_URL
STAGING_DB_MIGRATOR_PASSWORD
STAGING_DB_APP_PASSWORD
STAGING_DB_PLATFORM_PASSWORD
```

### E4. Repository variables

1. Open the **Variables** tab → **New repository variable**.
2. Name: `STAGING_WEB_URL`. Value: `https://staging.academybees.com`. Click **Add variable**.
3. **Do not add `STAGING_ENABLED` yet.** Claude will tell you when; from then on, every merge to `main` deploys to staging.

---

## F. Afterwards

1. Tell Claude "A–E done". Don't send any values.
2. When asked, add the repository variable `STAGING_ENABLED` = `true` (**Variables** tab → **New repository variable**).
3. Claude runs **Actions → Deploy staging** and watches it through the smoke checks.
4. After the first deploy succeeds, delete the local copies:

   ```bash
   scripts/staging/secrets.sh wipe
   ```

   Every value then lives only in Railway and GitHub. To rotate one later, see "Secrets" in [`environments.md`](environments.md).
