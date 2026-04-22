# Security policy

This document is for people who run, deploy, or audit ClaimRail. If you're a
user, nothing here requires action from you.

## Reporting a vulnerability

**Please do not open a public issue.** Use one of:

1. GitHub's private vulnerability reporting on this repo (preferred).
2. Email: `security@claimrail.example` — replace with your maintainer's real
   address before going live.

We acknowledge reports within 48 hours and aim to ship a fix within 30 days
for critical issues.

## What we defend against

### Authentication

| Threat | Control |
|--------|---------|
| Credential stuffing / brute force | Per-IP (20/15m) + per-email (8/15m) rate limits on login. Per-IP (5/hr) rate limit on signup. |
| Password cracking if DB leaks | `bcrypt` with cost 12. `AUTH_SECRET` signs JWTs and is required (min 32 chars) in production. |
| Weak passwords | 12-char minimum, 3-of-4 character classes, common-password blocklist, email/name substring check. |
| User enumeration | Same-timing `bcrypt` dummy compare on missing user at login. Generic error on signup if email exists. |
| Session hijack via XSS | `HttpOnly` `Secure` `SameSite=Lax` cookie with `__Host-` prefix. |
| Stolen session cookie | UA + IP fingerprint bound into the JWT; mismatched client → session revoked. |
| Eternal sessions | 7-day sliding + 30-day absolute cap. |
| Lost device | "Log out everywhere" in Settings revokes all server-side sessions. |

### Cross-site / network

| Threat | Control |
|--------|---------|
| CSRF | Server Actions use Next's built-in CSRF. JSON API routes require `Content-Type: application/json` **and** matching `Origin`/`Referer`. |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`. |
| XSS | Strict CSP with per-request nonce + `strict-dynamic`. React auto-escapes. No `dangerouslySetInnerHTML` in app code. |
| MIME sniffing | `X-Content-Type-Options: nosniff`. |
| Protocol downgrade | HSTS `max-age=31536000; includeSubDomains; preload` (prod only). |
| Referrer leakage | `Referrer-Policy: strict-origin-when-cross-origin`. |
| Browser feature abuse | `Permissions-Policy` disables camera, mic, geolocation, payment, USB, etc. |
| Cross-origin side-channels | `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`. |
| Version fingerprinting | `X-Powered-By` stripped. |

### SSRF

| Threat | Control |
|--------|---------|
| User submits `http://127.0.0.1/secret` | Hostname regex blocks loopback / RFC1918 / link-local / metadata / ULA. |
| User submits `http://169.254.169.254/…` (cloud metadata) | Blocked explicitly. |
| DNS rebinding (`foo.example.com` → `10.0.0.5`) | DNS resolution performed before fetch; any resolved private IP aborts the probe. |
| Non-HTTP schemes | `file:`, `gopher:`, `javascript:`, etc. rejected up front. |
| Internal-service ports | Common DB / cache ports (22, 5432, 6379, 27017, 9200, …) rejected. |

### API

| Threat | Control |
|--------|---------|
| Unauthenticated access | Every mutation route calls `getAuthContext()` first. |
| Cross-tenant data access | Every query filters by `orgId` from the resolved auth context. Membership role returned for RBAC checks. |
| Mass abuse of expensive endpoints | Rate limits on `/api/vendors/parse-sla` (20/min) and `/api/vendors/[id]/probe` (30/min) per user. |
| Schedulers hitting `/api/cron/probes` | `Authorization: Bearer $CRON_SECRET`. Fails closed when unset in production. |

### Data at rest

| Threat | Control |
|--------|---------|
| Tampering with audit log | Every audit row carries `prev_hash` + `row_hash` forming a per-org hash chain. `verifyAuditChain(orgId)` walks the chain and flags any row that's been edited, re-ordered, or deleted. |
| SQL injection | Drizzle parameterizes every query. Raw SQL appears only in the (static) migration file. |

## Configuration requirements

- **`AUTH_SECRET`** — random, ≥32 characters. In production the server refuses to start without it. Generate with `openssl rand -hex 32`.
- **`CRON_SECRET`** — required when exposing `/api/cron/probes` to a scheduler.
- **`NEXT_PUBLIC_APP_URL`** — set to the canonical deployed origin. Used by the CSRF Origin check.
- **HTTPS in production** — HSTS, `__Host-` cookies, and `Secure` flags assume TLS.

## Cryptography choices

- **Password hashing:** `bcrypt`, cost 12. Slow enough for offline attacks (~300 ms/try) while fast enough for login flows.
- **Session tokens:** JWT (HS256) with `iss=claimrail`, `aud=claimrail-web`, `iat`, `exp`. Signed by `AUTH_SECRET`. Server-side session row backs revocation.
- **Audit chain:** SHA-256 of a canonical field-concat.
- **Fingerprint:** SHA-256 of `UA + | + IP`, truncated to 24 hex chars.

## What we don't defend against (yet)

- **Distributed brute force** — our rate limit is per-IP; a botnet can rotate IPs. Real production would use an IP-reputation service or challenge-response.
- **Stolen DB + `AUTH_SECRET`** — if both leak, an attacker can mint sessions. Mitigate with secret rotation runbook (not included).
- **Side-channel timing attacks on probes** — probe timing isn't constant-time; an attacker with network proximity could infer vendor latency. Not in our threat model.
- **Sub-resource integrity** — we don't ship any CDN scripts, but if you add one, add SRI attributes.
- **Hardware 2FA / TOTP** — planned for the Pro tier.

## Audit trail

Every mutation is appended to `audit_events` with actor, action, and a chained
hash. Settings → "Audit log integrity" shows whether the chain is intact.
Admins should periodically export the log and archive off-site.
