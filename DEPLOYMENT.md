# Deployment Guide

Production topology:

```
              ┌────────────────┐
   browsers → │  Vercel (Next) │ ← GitHub → Vercel Git integration (auto-deploy)
              └──────┬─────────┘
                     │ libsql/https
                     ▼
              ┌────────────────┐
              │  Turso (libsql)│  ← migrations applied by GitHub Actions
              └────────────────┘
                     ▲
                     │ POST /api/cron/probes (Bearer token)
              ┌──────┴─────────┐
              │ Render Cron    │  ← every 5 minutes
              └────────────────┘
```

Three managed services, one repo. None of them hold secrets for the
others. First-time setup takes ~20 minutes.

---

## 1. Create the database (Turso)

```bash
# Install the Turso CLI (macOS / Linux / WSL)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup          # or: turso auth login
turso db create claimrail  # choose a region close to your Vercel region (iad1 → lax/ord)
turso db show claimrail --url
#   => libsql://claimrail-<your-org>.turso.io

turso db tokens create claimrail
#   => eyJhbGciOi…
```

Keep both strings — they become `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

## 2. Deploy the app (Vercel)

1. Go to https://vercel.com/new, pick this repo, accept the framework
   detection (Next.js).
2. Set the following **Environment Variables** on the Production
   environment (do not also set them on Preview unless you want
   preview deployments writing to production data):

   | Name | Value | Notes |
   |------|-------|-------|
   | `AUTH_SECRET` | `openssl rand -hex 32` | Mandatory. Server won't start without it. |
   | `CRON_SECRET` | `openssl rand -hex 32` | Must match Render's value (step 3). |
   | `DATABASE_URL` | `libsql://claimrail-<org>.turso.io` | From Turso step 1. |
   | `DATABASE_AUTH_TOKEN` | `eyJhbGciOi…` | From Turso step 1. |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-deployment>.vercel.app` | Or your custom domain. |
   | `ANTHROPIC_API_KEY` | *optional* | Enables real AI SLA parsing. |

3. Click **Deploy**. Vercel picks up `vercel.json` automatically.
4. After first deploy: in **Settings → Domains**, add your custom domain
   if you have one, and update `NEXT_PUBLIC_APP_URL` to match.

## 3. Schedule probes (Render)

1. Go to https://dashboard.render.com/blueprints → **New Blueprint
   Instance** → connect this repo.
2. Render reads `render.yaml` and creates one service:
   `claimrail-probe-cron`.
3. In the service's **Environment** tab set:

   | Name | Value |
   |------|-------|
   | `APP_URL` | Same as `NEXT_PUBLIC_APP_URL` from step 2. |
   | `CRON_SECRET` | Same secret as `CRON_SECRET` in Vercel. |

4. Apply the blueprint. Render will run the first probe within 5 min.
   Watch it under the service's **Jobs** tab — a green run means your
   Vercel URL + shared secret are wired correctly.

## 4. Wire up CI (GitHub Actions)

Under **Repo Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | Same as Vercel step 2. |
| `DATABASE_AUTH_TOKEN` | Same as Vercel step 2. |
| `DEPLOY_URL` | Same as `NEXT_PUBLIC_APP_URL`. |

Now every push to `main` triggers the `Deploy` workflow, which:

1. Runs database migrations against Turso (idempotent — safe to re-run).
2. Waits for Vercel's deployment to go live.
3. Smoke-tests `/api/health` and fails the run if it doesn't return
   `{"service":"claimrail",…}` within 3 minutes.

Without these secrets the workflow still runs; it just logs warnings
and skips the deploy-gated steps, so fresh forks stay green.

---

## Security checklist

The app ships with these hardened by default — verify they survived
your environment:

- [x] **TLS-only cookies** — `secure: true` in production (`lib/auth/session.ts`).
- [x] **HSTS preload + CSP + frame-ancestors none** — set in `middleware.ts` and `vercel.json`.
- [x] **Cron endpoint requires Bearer token** — `/api/cron/probes` returns 403 without `CRON_SECRET`.
- [x] **No secrets in the image** — `Dockerfile` and `.env.local` are both in `.gitignore`; `gitleaks` runs on every PR.
- [x] **Rotate after any leak** — `AUTH_SECRET`, `CRON_SECRET`, `DATABASE_AUTH_TOKEN` can each be rotated without downtime (tokens are JWT-signed, not encrypted).

After first deploy, manually verify:

```bash
# Should return 200 with a CSP header.
curl -I https://<your-domain>/

# Should return 403 — the cron endpoint rejects calls without the secret.
curl -i https://<your-domain>/api/cron/probes

# Should return 200 + a small JSON health doc.
curl https://<your-domain>/api/health
```

## Rollback

Vercel → **Deployments** → pick a prior green deploy → **Promote to
Production**. Rollback is instant. If the rollback target predates a
schema migration, re-apply the forward migration manually — schema
changes are additive in this codebase (all `CREATE TABLE IF NOT
EXISTS`), so forward migrations never break older app versions.

## Alternative: all-Render, no Turso

If you'd rather use Render Postgres instead of Turso:

1. Swap Drizzle's libsql dialect for `drizzle-orm/postgres-js`.
2. Rewrite `lib/db/migrate.ts` (Postgres doesn't have `unixepoch()`).
3. Point `DATABASE_URL` at Render's internal Postgres URL.

That's a 3-4 hour refactor. Turso is the lower-risk path for the
initial launch and can be migrated later if needed.
