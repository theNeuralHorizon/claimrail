# Security policy

This document is for people who run, deploy, or audit ClaimRail. If you're a
user, nothing here requires action from you.

## Reporting a vulnerability

**Please do not open a public issue.** Use one of:

1. GitHub's private vulnerability reporting on this repo (preferred).
2. Email: `security@claimrail.example` — replace with your maintainer's real
   address before going live.
3. See [`/.well-known/security.txt`](public/.well-known/security.txt) (RFC 9116).

We acknowledge reports within 48 hours and aim to ship a fix within 30 days
for critical issues.

## What we defend against

### Authentication

| Threat | Control |
|--------|---------|
| Credential stuffing / brute force | Per-IP (20/15m) + per-email (8/15m) rate limits on login. Per-IP (5/hr) rate limit on signup. |
| Distributed brute force (rotating IPs) | **Per-account lockout** kicks in after 5 failures; lockout time doubles with each additional failure, capped at 1 hour. Cleared on successful login or password reset. |
| Password cracking if DB leaks | `bcrypt` with cost 12. `AUTH_SECRET` signs JWTs and is required (min 32 chars) in production. |
| Weak passwords | 12-char minimum, 3-of-4 character classes, common-password blocklist, email/name substring check. |
| User enumeration | Same-timing `bcrypt` dummy compare on missing user at login. Generic error on signup if email exists. Password-reset always returns the same success message regardless of whether the email is registered. |
| Unverified email | Signup issues a single-use email-verification token (24h, sha256-hashed in DB). Unverified users can sign in but see a banner and cannot be fully trusted. Resend is rate-limited to 3/hour. |
| Phishing / account takeover | Optional **TOTP 2FA (RFC 6238)** with encrypted seed (AES-256-GCM under a KDF over `AUTH_SECRET`) and 10 single-use backup codes (stored only as sha256 hashes). Enabling or disabling 2FA revokes every other session. |
| Password reset link leakage | 30-minute expiry, sha256-hashed token, single-use, issuing a new one invalidates the previous. All sessions invalidated on successful reset. |
| Forgotten password replay | Reset tokens stored only as sha256, marked used atomically — replay or reuse returns the generic error. |
| Password change abuse | Re-requires the current password. On change, every other session for the user is revoked. |
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
| CSP violations in production | Browser reports POSTed to `/api/security/csp-report` via both legacy `report-uri` and modern `Report-To` group; logged for observability pipelines to consume. |
| Inadvertent HTTP in production | Middleware 308-redirects `http://` → `https://` whenever `x-forwarded-proto: http` is observed in production. Combined with HSTS, future requests skip the redirect. |

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

## Red-team / blue-team hardening (phase 3)

Added after explicitly threat-modelling from an attacker's perspective.
Full matrix lives in [`THREAT_MODEL.md`](THREAT_MODEL.md). Incident-response
runbooks live in [`RED_TEAM.md`](RED_TEAM.md).

| Threat | Defense | File |
|---|---|---|
| JWT algorithm confusion (`alg: none`, `alg: RS256` against HMAC key) | `jwtVerify` pinned to `algorithms: ['HS256']` + protected-header assertion | `lib/auth/session.ts` |
| Prototype pollution via JSON body | `Object.prototype`, `Array.prototype`, `Function.prototype`, and friends frozen at process boot | `lib/security/freeze.ts` |
| ReDoS against the SLA parser | Input capped at 80 KB; regexes kept linear-time | `lib/ai/sla-parser.ts` |
| Log injection via CRLF in user-controlled fields | `safeForLog` + `sanitizeLine` | `lib/security/sanitize.ts`, `lib/security/security-log.ts` |
| Mass assignment | Every mutation schema uses Zod `.strict()` — unknown keys fail fast | `lib/auth/actions.ts` |
| NaN / Infinity / negative money leaking into calculations | `moneyCents`, `percentage`, `uptimeThresholdPct`, `creditPct` validators | `lib/security/strict-types.ts` |
| TOTP replay within the ±30s window | `(user_id, step)` unique index pins accepted step; second use rejected | `lib/auth/totp-nonce.ts` |
| TOTP brute force once the password is known | Dedicated rate limit on the 2FA step (10 attempts / 10 min per user) | `lib/auth/actions.ts:loginAction` |
| Password reuse after change/reset | Last 5 hashes stored; new password rejected if it matches any | `lib/auth/password-history.ts` |
| Signup-bot flood | Hidden honeypot field + minimum form-mount-to-submit delay | `lib/auth/actions.ts`, `app/(auth)/signup/signup-form.tsx` |
| Incident-response needs to pause specific subsystems | `CLAIMRAIL_DISABLE` env var hot-rolls on the next request | `lib/security/kill-switch.ts`, `middleware.ts` |
| Forensics across attacks | Separate `security_events` table alongside the audit log; both visible in UI | `/dashboard/settings/security`, `lib/security/security-log.ts` |
| Account-takeover awareness | Anomaly detector flags impossible-travel and new-device logins | `lib/security/anomaly.ts` |
| Stack trace leaks in prod 500 responses | `scrubError` returns `{correlationId, message}`, real error logged server-side only | `lib/security/error-scrub.ts` |
| Oversized request bodies DoS-ing handlers | Per-route `readJsonBody({ maxBytes })` helper | `lib/security/body-limit.ts` |
| Cross-origin bleed from stray CORS headers | Middleware deletes `Access-Control-Allow-Origin` on every response | `middleware.ts` |

## Configuration requirements

- **`AUTH_SECRET`** — random, ≥32 characters. In production the server refuses to start without it. Generate with `openssl rand -hex 32`.
- **`CRON_SECRET`** — required when exposing `/api/cron/probes` to a scheduler.
- **`NEXT_PUBLIC_APP_URL`** — set to the canonical deployed origin. Used by the CSRF Origin check.
- **`CLAIMRAIL_DISABLE`** — optional incident-response flag: `signup`, `login`, `password_reset`, `probes`, or `all`.
- **HTTPS in production** — HSTS, `__Host-` cookies, and `Secure` flags assume TLS.

## Cryptography choices

- **Password hashing:** `bcrypt`, cost 12. Slow enough for offline attacks (~300 ms/try) while fast enough for login flows.
- **Session tokens:** JWT (HS256) with `iss=claimrail`, `aud=claimrail-web`, `iat`, `exp`. Signed by `AUTH_SECRET`. Server-side session row backs revocation.
- **TOTP seeds:** AES-256-GCM with a SHA-256-derived key over `AUTH_SECRET`. The ciphertext + 96-bit IV + 128-bit tag are stored together. Random IV per encrypt.
- **Verification tokens:** 32-byte `base64url` random; stored only as `sha256(token)` with `expires_at` + single-use guard.
- **Backup codes:** 10-byte random, formatted `xxxx-xxxxxx`; stored only as `sha256(code)`.
- **Audit chain:** SHA-256 of a canonical field-concat including a strictly-monotonic per-org sequence number.
- **Fingerprint:** SHA-256 of `UA + | + IP`, truncated to 24 hex chars.

## CI / supply-chain

- **Dependency audit:** `npm audit --omit=dev --audit-level=high` on every CI run.
- **Secret scanning:** [gitleaks](https://github.com/gitleaks/gitleaks) on every push and PR, with a project-specific allowlist (`.gitleaks.toml`) for the dev-fallback secret and bcrypt dummy hash.
- **Static analysis:** [CodeQL](https://codeql.github.com/) with the `security-and-quality` query suite runs on every push, PR, and weekly at 06:00 UTC Monday.
- **Dependabot:** weekly PRs for npm updates (grouped: prod-patch, dev-minor-patch) and monthly for GitHub Actions pins.

## What we don't defend against (yet)

- **Stolen DB + `AUTH_SECRET`** — if both leak, an attacker can mint sessions and decrypt TOTP seeds. Mitigate with a secret-rotation runbook (not included).
- **Side-channel timing attacks on probes** — probe timing isn't constant-time; an attacker with network proximity could infer vendor latency. Not in our threat model.
- **Sub-resource integrity** — we don't ship any CDN scripts, but if you add one, add SRI attributes.
- **WebAuthn / passkeys** — we support TOTP today; hardware-backed credentials are a future addition.
- **Anomaly detection** — we write an audit chain but don't yet alert on suspicious patterns (e.g. 10 logins from 10 countries in 10 minutes). Wire audit events into your SIEM to cover this.

## Audit trail

Every mutation is appended to `audit_events` with actor, action, and a chained
hash. Settings → "Audit log integrity" shows whether the chain is intact.
Admins should periodically export the log and archive off-site.
