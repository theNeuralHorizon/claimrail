# ClaimRail Threat Model

Written from the perspective of an attacker deciding how to break ClaimRail.
Every attack below has a concrete mitigation in-tree.

## Assumptions

- ClaimRail is a SaaS that sits between a customer's finance team and their
  vendors. It probes vendor URLs from the server, stores the customer's
  contracts (SLA text), and generates claim emails.
- Attackers in scope: anonymous internet, registered users trying to
  escalate, tenant-A users trying to read tenant-B data, ex-employees
  with stale sessions, and dependency supply-chain compromise.
- Out of scope: nation-state with kernel 0-day; physical access to the
  server; malicious ClaimRail employees (we write audit chains so they
  can't cover tracks, but we don't prevent a root ops engineer from
  running `DELETE FROM users`).

## High-value assets

| Asset | Why it matters | Failure mode |
|---|---|---|
| User password hashes | Offline brute force → account takeover | Credential stuffing / ATO |
| Audit log | Reconstructs what happened during incidents | Tampering hides abuse |
| `AUTH_SECRET` | Signs JWTs, keys TOTP encryption, pepper for tokens | Session forgery, TOTP unwrap |
| Claim emails | Contain vendor terms, outage evidence | Disclosure of contract data |
| SLA text | Customer's confidential contracts | Disclosure |
| Tenant separation | The whole premise of multi-tenancy | Cross-tenant leak |

---

## Attack → defense matrix

### 1. Authentication

| Attack | Defense | File |
|---|---|---|
| Credential stuffing with breached-password lists | Per-IP + per-email rate limit, per-account lockout with exponential backoff | `lib/auth/{lockout,actions}.ts`, `lib/rate-limit.ts` |
| Offline brute force after DB leak | `bcrypt` cost 12 + `AUTH_SECRET` pepper for token digests | `lib/auth/password.ts`, `lib/security/crypto.ts` |
| Timing-based user enumeration at login | Dummy `bcrypt.compare` on missing user | `lib/auth/password.ts:runDummyVerify` |
| Enumeration via signup duplicate-email error | Generic "could not create account" response | `lib/auth/actions.ts:signupAction` |
| Enumeration via password-reset response difference | Same message regardless of whether email exists | `lib/auth/actions.ts:forgotPasswordAction` |
| TOTP code replay (same 6-digit code twice within step window) | Per-user nonce tracking of last accepted TOTP step | `lib/auth/totp-nonce.ts` |
| TOTP brute force (1 in 10⁶ chance per try — 5 per IP/15m is still 1 in 200k with a botnet) | Dedicated per-user rate limit on the 2FA step + lockout applies | `lib/auth/actions.ts:loginAction` |
| Backup code enumeration | Stored as HMAC digests, single-use, 10-code pool | `lib/auth/totp-actions.ts`, `lib/security/crypto.ts` |
| Weak password reuse after reset | Password history checks last 5 hashes | `lib/auth/password-history.ts` |
| Signup-bot flood | Honeypot field + minimum time-to-submit check | `lib/auth/actions.ts:signupAction` |
| Session fixation | `__Host-` cookie, session rotated on every login, fingerprint-bound | `lib/auth/session.ts` |
| JWT algorithm confusion ("alg: none", "alg: RS256" with HMAC key) | `jwtVerify` pinned to HS256 and asserted via algorithms list | `lib/auth/session.ts` |
| Stolen JWT on another device | UA+IP fingerprint bound into payload | `lib/auth/session.ts:fingerprint` |
| Compromised session after password change | Every other session revoked on password change | `lib/auth/actions.ts:changePasswordAction` |
| Compromised password: all sessions need to die | Password reset revokes *all* sessions | `lib/auth/actions.ts:resetPasswordAction` |

### 2. Authorization (tenancy)

| Attack | Defense | File |
|---|---|---|
| IDOR: access vendor from another org by guessing ID | Every query filters by `orgId` from the resolved auth context | `lib/queries.ts`, `app/api/**` |
| IDOR on claim detail | `getVendorDetail`/claim join checks `vendors.orgId = ctx.org.id` | `lib/queries.ts:getVendorDetail` |
| Privilege escalation by tampering membership role in requests | Server never reads role from request payloads; only from DB | `lib/auth/session.ts:getAuthContext` |
| Mass assignment: attacker sends extra fields to auto-assign | All Zod schemas use strict — unknown keys rejected | `app/api/**` |
| Tenant-boundary regression test suite | `tests/tenant-isolation.test.ts`, `tests/idor.test.ts` | |

### 3. Injection

| Attack | Defense | File |
|---|---|---|
| SQL injection | Drizzle parameterizes everything; no raw user-string interpolation in queries | `lib/**` |
| Prototype pollution via JSON body (`__proto__`) | `Object.prototype` + `Array.prototype` frozen at boot | `lib/security/freeze.ts` |
| ReDoS on the SLA parser (catastrophic backtracking) | Regex match wrapped in a 250ms CPU budget | `lib/security/redos-guard.ts` |
| HTML/JS injection via vendor name or notes | React auto-escapes. CSP with nonce + strict-dynamic blocks inline scripts. Input sanitizer strips control chars | `lib/security/sanitize.ts`, `middleware.ts` |
| Log injection (CRLF in user input → fake log lines) | Logger sanitizes control characters before emitting | `lib/security/security-log.ts` |
| Command injection | No subprocess calls in server-side code. | — |
| Path traversal | No user-controlled file paths. | — |
| Parameter tampering on money/percentages | Zod `.min(0).max()` + integer constraints + finite-number guards | `lib/security/strict-types.ts` |

### 4. Network / transport

| Attack | Defense | File |
|---|---|---|
| HTTP downgrade in prod | HSTS + middleware HTTP→HTTPS redirect on `x-forwarded-proto: http` | `middleware.ts` |
| CSRF | Origin header + JSON content-type enforced on all mutation routes. No CORS headers emitted. | `lib/security/request-guard.ts` |
| Cross-origin GET (CORB) | `Cross-Origin-Resource-Policy: same-origin` + `Cross-Origin-Opener-Policy: same-origin` | `middleware.ts` |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` | `middleware.ts` |
| SSRF via probe URLs | Hostname blocklist + DNS-resolve → reject private IPs + port blocklist | `lib/probes/ssrf.ts` |
| DNS rebinding | Hostname resolved *inside* the probe call; any private address aborts | `lib/probes/ssrf.ts:assertHostResolvesPublicly` |
| Request smuggling / protocol confusion | Not exposed directly; behind Next.js. Middleware rejects non-standard methods on API routes. | `middleware.ts`, `lib/security/request-guard.ts` |
| Slowloris / body-DoS | Next's built-in limits + per-route size cap | `lib/security/body-limit.ts` |
| Reflection / referrer leakage | `Referrer-Policy: strict-origin-when-cross-origin` | `middleware.ts` |

### 5. Data integrity

| Attack | Defense | File |
|---|---|---|
| Audit log tampering | Per-org hash chain with monotonic `seq` | `lib/audit/chain.ts` |
| Claim status forged to "recovered" to skim money | Status transitions are PATCH-gated by Zod, authed, audited | `app/api/claims/[claimId]/route.ts` |
| Race: parallel claim generation creates duplicates | Unique index `claims_vendor_period_idx` | `lib/db/schema.ts` |
| TOCTOU on token consume | Atomic "set usedAt only if NULL" update, 0-row result aborts | `lib/auth/tokens.ts:consumeToken` |

### 6. Cryptography

| Attack | Defense | File |
|---|---|---|
| JWT "alg: none" / algorithm confusion | Verification pins `{ algorithms: ['HS256'] }` + typ check | `lib/auth/session.ts` |
| TOTP seed leak via DB dump | Seed encrypted AES-256-GCM under KDF-derived key from AUTH_SECRET | `lib/security/crypto.ts` |
| Token digest rainbow tables | HMAC-SHA-256 keyed on AUTH_SECRET pepper | `lib/security/crypto.ts:digestToken` |
| Weak random for tokens | `crypto.randomBytes` only; no `Math.random()` anywhere in auth | grep -r `Math.random` excludes auth |

### 7. Operational / incident response

| Attack / scenario | Defense | File |
|---|---|---|
| Active incident: need to pause signup/login | Kill switch env var `CLAIMRAIL_DISABLE=signup,login` checked by middleware | `lib/security/kill-switch.ts`, `middleware.ts` |
| Anomalous login from new country | Security-event logger + anomaly detector flags impossible travel | `lib/security/security-log.ts`, `lib/security/anomaly.ts` |
| Noisy attacker fills logs | Log injection sanitizer + rate limits | `lib/security/security-log.ts` |
| Forensic needs after breach | Append-only hash-chained audit log + security-event log | `lib/audit/chain.ts`, `lib/security/security-log.ts` |
| Production stack trace leaks internals in 500 response | Stack traces scrubbed in prod, correlation ID returned | `app/error.tsx`, `lib/security/error-scrub.ts` |

---

## What remains explicitly out of scope

- **Passkeys / WebAuthn** — TOTP covers 2FA for MVP.
- **Hardware-backed KMS rotation for AUTH_SECRET** — documented runbook only.
- **SIEM integration** — we emit structured events; wire them to Datadog/Splunk.
- **Chaos engineering in prod** — the test suite ships chaos cases (`tests/chaos.test.ts`), but we don't inject faults at runtime.
