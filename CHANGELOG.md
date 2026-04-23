# Changelog

Reverse-chronological; each entry maps to a merged PR.

## Unreleased — product-v3

**Added**

- **Dark mode.** System-preference-aware theme with instant toggle, persisted
  per-browser, zero flash on load (inline boot script).
- **Command palette (`⌘K` / `Ctrl+K`).** Fuzzy search across vendors, claims,
  and pages. Dynamic items lazy-loaded from `/api/palette` on first open.
- **Dashboard top bar.** Sticky header with `⌘K` hint, notification bell,
  theme toggle.
- **Notification bell.** Last 20 security events for the current user / org
  with severity-weighted unread indicator.
- **7-day uptime sparklines** on every vendor card. Pure SVG, no chart dep.
- **Claim PDF export.** Zero-dependency PDF 1.4 generator writes a valid
  Courier-font letter. Download button on the claim detail page.
- **Slack outbound webhooks.** Customers paste an Incoming Webhook URL in
  Settings → Slack alerts; we encrypt it at rest (AES-256-GCM) and fire a
  test message on save. Claim drafts trigger fire-and-forget Slack posts.
- **API tokens.** `crt_…` prefix, 256-bit random, stored as HMAC digests,
  scoped `read | write`, revokable. First public REST endpoint:
  `GET /api/v1/vendors` with per-token 60-req/min rate limit.
- **Richer `/api/health`.** DB ping + per-table sanity + last-probe age.
  Returns 503 when probe cron has been silent for > 1 h.
- **Public `/status` page.** Auto-refreshes every 30 s; runs the same
  checks as the JSON endpoint.
- **Docker Compose deploy.** `Dockerfile` (multi-stage, non-root user,
  built-in healthcheck) + `docker-compose.yml` with a probe sidecar that
  hits `/api/cron/probes` every 5 min.

**Tests (+17, 190 total)**

- `pdf.test.ts` — valid PDF-1.4 signature, multi-page wrapping, non-ASCII
  fallback, path-traversal-safe filenames.
- `slack.test.ts` — URL validator zoo, encrypted save/read round-trip,
  delivery never throws on network failure.
- `api-tokens.test.ts` — issue → resolve, revoke, idempotency,
  cross-tenant revoke is a no-op.

## 2026-04-22 — PR #12 — red-team hardening

JWT HS256 pin, prototype freeze, ReDoS cap, log sanitizer, strict money
types, TOTP replay nonce, dedicated 2FA rate limit, password history,
signup honeypot, kill switch, security events table + admin UI, anomaly
detection, error scrubber, CORS deny, `THREAT_MODEL.md`, `RED_TEAM.md`.
156 tests (+49).

## 2026-04-22 — PR #11 — security phase 2

Email verification, TOTP 2FA with backup codes, password change + reset,
account lockout, CSP report endpoint, HTTPS redirect, security.txt +
robots.txt, CodeQL + gitleaks in CI. 107 tests (+22).

## 2026-04-22 — PR #10 — security phase 1

Middleware CSP/HSTS/COOP/CORP, CSRF via Origin + Content-Type, bcrypt 12,
constant-time login, session `__Host-` cookie + fingerprint, DNS-aware
SSRF, audit hash chain. 85 tests (+17).

## 2026-04-22 — PR #9 — docs

CONTRIBUTING.md, CODEOWNERS, issue forms.

## 2026-04-22 — PR #1 — initial release

Full-stack ClaimRail: Next.js 14 App Router, Drizzle + libsql, landing
page, auth, dashboard, vendors, incidents, claims, settings, CI.
