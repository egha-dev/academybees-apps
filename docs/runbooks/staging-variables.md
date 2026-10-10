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

`PLATFORM_DATABASE_URL` (Phase 3, C-02) lets the console create and manage academies. Without it the API still starts, but the console's academy pages answer "temporarily unavailable".

```text
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
APP_ENV=${{shared.APP_ENV}}
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgresql://ab_app:${{shared.DB_APP_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
PLATFORM_DATABASE_URL=postgresql://ab_platform:${{shared.DB_PLATFORM_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
REDIS_URL=${{redis.REDIS_URL}}?family=0
TRUSTED_PROXY_SECRET=${{shared.TRUSTED_PROXY_SECRET}}
SECRETS_MASTER_KEY=${{shared.SECRETS_MASTER_KEY}}
ANALYTICS_HASH_SALT=${{shared.ANALYTICS_HASH_SALT}}
PLATFORM_ROOT_DOMAIN=${{shared.PLATFORM_ROOT_DOMAIN}}
COOKIE_MODE=secure
CUSTOM_DOMAINS_ENABLED=false
PAYMENT_PROVIDERS=manual
```

**Media (Phase 3, C-97).** Logos and favicons go to the Cloudflare R2 bucket `academybees-media-staging`, which has the public domain `media.staging.academybees.com` and r2.dev turned off. That bucket holds **public branding only**; private media has its own bucket without a public domain (below). Add these variables on `api` only. Seal the two keys (Railway → variable → ⋯ → Seal).

```text
MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
MEDIA_S3_REGION=auto
MEDIA_S3_ACCESS_KEY_ID=<R2 token Access Key ID>
MEDIA_S3_SECRET_ACCESS_KEY=<R2 token Secret Access Key>
MEDIA_PUBLIC_BUCKET=academybees-media-staging
MEDIA_PUBLIC_BASE_URL=https://media.staging.academybees.com
```

**Private media (Phase 4, C-97, C-101).** Student photos and import files go to a second R2 bucket, `academybees-private-staging`: APAC, **no custom domain, r2.dev off, no CORS**. Give the R2 token access to it, either by adding it to the existing token's buckets or with its own token in the same two variables. Then add on `api`:

```text
MEDIA_PRIVATE_BUCKET=academybees-private-staging
```

Without it, staging answers "importing/photos aren't available yet" instead of failing. The API refuses to start if it equals `MEDIA_PUBLIC_BUCKET`.

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
```

Then add the Resend key as a separate variable:

1. **Variables** tab → **New Variable**.
2. Name: `RESEND_API_KEY`.
3. Value: paste your Resend **sending-only** API key (from Resend → API Keys).
4. Click **Add**.

The worker sends through **Resend's HTTPS API** whenever `RESEND_API_KEY` is set. Railway blocks outbound SMTP ports below the Pro plan (C-79), so don't set `SMTP_URL` on staging; if it exists from an earlier version of this checklist, you can delete it.

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
3. Create the Railway project token (section G). Claude then runs **Actions → Deploy staging** and watches it through the smoke checks.
4. After the first deploy succeeds, delete the local copies:

   ```bash
   scripts/staging/secrets.sh wipe
   ```

   Every value then lives only in Railway and GitHub. To rotate one later, see "Secrets" in [`environments.md`](environments.md).

---

## G. Railway project token for deploys (C-77)

GitHub Actions deploys with `railway up` using a **project token**. A project token only works for **one environment**, so the project must have exactly one: `academybees-staging`.

1. On the project canvas, open the **environment switcher** (top left, next to the project name). Only **`academybees-staging`** should be listed. If another environment exists (for example the default `production`) and has none of your setup, delete it: environment → **Settings** → **Danger** → **Delete environment**.
2. Project → **Settings** → **Tokens** → **Create token**:
   - **Environment:** `academybees-staging`;
   - **Name:** `github-actions`;
   - click **Create** and copy the token; it is shown once.
3. GitHub → repository → **Settings** → **Secrets and variables** → **Actions** → **Secrets**:
   - if `RAILWAY_TOKEN` exists, click its pencil → paste → **Update secret**;
   - otherwise **New repository secret** → name `RAILWAY_TOKEN` → paste → **Add secret**.
4. Clear your clipboard.

**After changing variables in Railway:** click **Deploy / Apply changes** on the project canvas before a redeploy. Deployments use only applied variables.

---

## H. Remove what is no longer used

1. **Railway** → your avatar → **Account Settings** → **Tokens**: delete the account token **`github-actions-staging`**. It can manage every project on your account, and deploys don't use it.
2. **GitHub** → repository → **Settings** → **Secrets and variables** → **Actions**:
   - **Secrets** tab: delete `RAILWAY_API_TOKEN`;
   - **Variables** tab: delete `STAGING_RAILWAY_PROJECT_ID`.
3. Keep `RAILWAY_TOKEN` (the project token from G).

---

## I. Staging bootstrap: academies, users, console admin (C-78)

Run it once after staging is live. It's safe to run again.

### Before the first run

1. **Rotate `AUTH_SIGNING_KEYS`** if the key ever left your machine. Generate it straight into the clipboard:

   ```bash
   node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});process.stdout.write(JSON.stringify({current:'s2',keys:[{...k,kid:'s2',alg:'EdDSA'}]}))" | clip.exe
   ```

   Then: **`api` → Variables → `AUTH_SIGNING_KEYS` → ⋯ → Edit** → paste → **Save** → **Deploy / Apply changes** → redeploy. For the next rotation, use a new key ID (`s3`, …).
2. **Cloudflare:** zone **academybees.com** → **Email** → **Email Routing** → **Settings** → turn on **Subaddressing**. Mail to `hello+anything@academybees.com` then reaches the `hello@` destination.
3. **GitHub secret** `STAGING_SECRETS_MASTER_KEY`: in Railway, **Settings** → **Shared Variables** → copy icon on `SECRETS_MASTER_KEY`. In GitHub, **New repository secret** → paste.

### Run

1. GitHub → **Actions** → **Staging bootstrap** → **Run workflow** (branch `main`; leave **resend** off) → **Run workflow**.
2. The log lists each address with `link-emailed`, `already-set-up` or `link-pending`. It never contains a password or link.
3. Within a few minutes your inbox receives **14 emails** ("Your … account on AcademyBee is ready", plus the console set-up email). Check spam the first time.

### Addresses (all `@academybees.com`)

| | Owner | Admin | Accountant | Receptionist | Parent | Student |
| --- | --- | --- | --- | --- | --- | --- |
| `demo-a` | `hello+a-owner` | `hello+a-admin` | `hello+a-accountant` | `hello+a-reception` | `hello+a-parent` | `hello+a-student` |
| `demo-b` | `hello+b-owner` | `hello+b-admin` | `hello+b-accountant` | `hello+b-reception` | `hello+b-parent` | `hello+b-student` |

- **Teacher in both academies:** `hello+teacher`.
- **Console admin (Super Admin):** `hello+console`.

### Setting each password

1. Open each link in a **separate browser profile or private window**. Sign-in cookies belong to each academy host, but two users on the same host would share one.
2. Choose a password. Each link works **once** and expires after **72 hours**.
3. Sign in at:
   - `https://demo-a.staging.academybees.com/login` or `https://demo-b.staging.academybees.com/login`;
   - **parents and students** are handed to the Family Hub;
   - the **console** is at `https://console.staging.academybees.com/login`, and asks you to set up an authenticator app first.
4. Store the passwords in a password manager. Never share them in chat.

### Links expired or lost

Run **Staging bootstrap** again with **resend** on. Only users who haven't chosen a password get a new link, and their old link stops working.

