# ClaimRail

> **Your SaaS vendors owe you money. ClaimRail gets it back.**

ClaimRail is a full-stack B2B SaaS platform that **monitors every vendor your company depends on, measures their real uptime against their contractual SLA, and automatically drafts claim letters when they fall short.**

[![CI](https://github.com/theNeuralHorizon/claimrail/actions/workflows/ci.yml/badge.svg)](https://github.com/theNeuralHorizon/claimrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Made with Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)

---

## The problem

The average mid-market company spends **$2M–$10M/year on SaaS** across 30–100+ vendors. Every one of those contracts promises service credits when uptime drops below a threshold. In practice:

- **87% of eligible SLA credits are never claimed** — nobody has time to track it.
- Status pages are run by the *vendor* — their incentive is to under-report outages.
- Claim windows close in 14–30 days.
- Each vendor's SLA is worded differently, making it impossible to compare at scale.

The result: companies leave **$60K–$400K a year on the table** in recoverable credits. ClaimRail recovers that money.

## How it works

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Paste SLA    │ →  │ AI extracts  │ →  │ We probe     │ →  │ We draft the │
│ text         │    │ tier table   │    │ 24/7         │    │ claim email  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
    2 minutes          Claude API         5-min interval        evidence
                       + heuristic        independent probes    attached
                       fallback
```

1. **Paste the SLA.** Drop in the "Service Credits" clause from any vendor contract. Our AI parser extracts every tier (e.g. `99.9% → 10%`, `99.0% → 25%`, `95% → 50%`). The heuristic fallback handles most real-world SLAs with no API key needed.
2. **We monitor 24/7.** Independent HTTP probes hit each vendor's endpoint on a schedule. No reliance on vendor status pages.
3. **We do the math.** On the first of the month, we calculate measured uptime against every SLA tier. Breaches are flagged. Credits are estimated.
4. **You send the claim.** Review the auto-drafted email with a full evidence attachment (incident timestamps, durations, HTTP codes), hit send. Track each claim `drafted → filed → acknowledged → recovered`.

## Screenshots

<details>
<summary>Landing page · Dashboard · Vendor detail · Claim letter</summary>

- `/` — marketing site with live mock dashboard hero
- `/dashboard` — overview with credit-owed summary, uptime bars, recent incidents
- `/dashboard/vendors/[id]` — latency chart, incidents, SLA tiers, claim history
- `/dashboard/claims/[id]` — the full draft letter with one-click `mailto:` export
- `/dashboard/vendors/new` — paste SLA → AI-parsed tier table

</details>

## Features

- ✅ **AI SLA parser** · Claude API with a zero-dependency regex fallback
- ✅ **Independent HTTP probing** · classify up / degraded / down based on status + latency
- ✅ **Straddle-safe uptime math** · incidents that cross month boundaries are correctly split
- ✅ **Tier-aware credit calculator** · always picks the *most generous* tier breached
- ✅ **Auto-drafted claim letters** · professional templates with evidence attachment
- ✅ **Recovery tracking** · `drafted → filed → acknowledged → recovered / rejected`
- ✅ **Multi-tenant** · orgs, memberships, RBAC roles, strict row-level isolation
- ✅ **Audit log** · every mutation recorded, per-org
- ✅ **Scheduler-friendly** · one endpoint, shared-secret auth, wire it into GitHub Actions / Vercel Cron / any scheduler

## Tech stack

| Layer              | Choice                                              |
|--------------------|-----------------------------------------------------|
| Framework          | **Next.js 14** (App Router, Server Components)      |
| Language           | **TypeScript** strict mode                          |
| Database           | **SQLite** via [@libsql/client](https://turso.tech) |
| ORM                | **Drizzle ORM**                                     |
| Auth               | Custom JWT sessions (jose) + bcrypt                 |
| Styling            | **Tailwind CSS** + CVA for variants                 |
| Icons              | **lucide-react**                                    |
| Charts             | **Recharts**                                        |
| Testing            | **Vitest** (41 tests, ~85% lib coverage)            |
| AI                 | Anthropic Claude API (optional)                     |

## Quick start

Requires Node 20+.

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Configure (edit .env.local, AUTH_SECRET is required)
cp .env.example .env.local

# 3. Create DB + seed demo data (6 vendors, 45 days of probe history, live claims)
npm run prepare-data

# 4. Run
npm run dev

# → http://localhost:3000
# Demo login: demo@claimrail.io / DemoRail!2026
```

## Scripts

| Command                 | Purpose                                       |
|-------------------------|-----------------------------------------------|
| `npm run dev`           | Start Next.js dev server                      |
| `npm run build`         | Production build                              |
| `npm run start`         | Start production server                       |
| `npm run test`          | Run unit tests                                |
| `npm run test:coverage` | Tests + V8 coverage report                    |
| `npm run typecheck`     | TypeScript check without emit                 |
| `npm run lint`          | Next.js / ESLint                              |
| `npm run db:migrate`    | Apply schema (idempotent)                     |
| `npm run db:seed`       | Wipe demo tenant and re-seed                  |
| `npm run prepare-data`  | Migrate + seed in one go                      |

## Architecture

```
app/
├── (auth)/              Login + signup (shared layout)
├── (dashboard)/         Authenticated app shell
│   └── dashboard/
│       ├── vendors/     List + detail + new
│       ├── incidents/   Global incident log
│       ├── claims/      List + detail + status transitions
│       └── settings/    Org + account + cron URL
├── api/
│   ├── auth/            —
│   ├── vendors/         CRUD + parse-sla + probe + claim
│   ├── claims/          Status PATCH
│   ├── cron/probes/     Shared-secret-auth scheduled probing
│   └── health/          Liveness
└── page.tsx             Marketing landing

lib/
├── sla/engine.ts        Uptime, breach detection, consolidation (100% unit tested)
├── probes/engine.ts     HTTP probe + incident reconciliation
├── ai/sla-parser.ts     Claude + heuristic parser
├── claims/generator.ts  Evidence-backed email generator
├── auth/                Password, JWT session, server actions
├── db/                  Drizzle schema, client, migrate, seed
└── queries.ts           Pre-aggregated read models

components/
├── ui/                  Button, Card, Badge, Input, Stat, StatusDot (primitives)
└── features/            UptimeChart, etc.

tests/                   Vitest suite — SLA engine, parser, generator, probe, password
```

### Design decisions

- **SQLite via libsql** over `better-sqlite3` — zero native compilation pain on Node 24, same SQL dialect, ships prebuilt for every platform.
- **Raw SQL migrations** over drizzle-kit — dev machines are small, idempotent `CREATE IF NOT EXISTS` DDL is easier to reason about at this scope.
- **JWT + DB session row** — JWT alone can't be revoked; a DB row lets us kill sessions.
- **Many small files, one purpose each** — the SLA engine, probe engine, parser, and generator are independent pure modules. Tested in isolation.
- **Pick the highest applicable credit tier** — real SLAs award the *most generous* tier hit, not the sum. This is a common mistake in toy implementations.

## Setting up automated probing

ClaimRail doesn't run its own cron — you wire it into any scheduler you trust.

**GitHub Actions** (recommended, free)

```yaml
# .github/workflows/probes.yml
name: Probes
on:
  schedule:
    - cron: '*/5 * * * *'  # every 5 minutes
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - name: Hit probe endpoint
        run: |
          curl -fsSL -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-claimrail.example.com/api/cron/probes
```

**Vercel Cron** (in `vercel.json`):

```json
{ "crons": [{ "path": "/api/cron/probes", "schedule": "*/5 * * * *" }] }
```

## Roadmap

- [ ] Slack + email alerts when a breach crosses a tier boundary
- [ ] PDF export of the full evidence packet
- [ ] SAML SSO + SCIM for Enterprise tier
- [ ] Webhook ingestion — let vendors' status pages notify us directly
- [ ] Multi-probe locations (North America + Europe + APAC)
- [ ] Slack bot integration for claim approvals

## License

MIT — see [LICENSE](LICENSE). Contributions welcome.

---

<sub>Built with Next.js, Drizzle, Tailwind, and a lot of studying of AWS, Stripe, Cloudflare, Twilio, and Datadog public SLAs.</sub>
