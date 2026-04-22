# ClaimRail Red-Team Runbook

The other side of [`THREAT_MODEL.md`](THREAT_MODEL.md). That file enumerates
the attacks. This file tells a defender what to do when one of them is
happening right now.

## Operating assumptions

- You have `gh`, repo write access, and access to the hosting platform's
  environment variables.
- You can't always hotfix the code. You can almost always flip an env var
  and redeploy (serverless) or restart (self-hosted).

## Detection signals

| Signal | Source | Means |
|---|---|---|
| Spike in `login.failed` events in `security_events` | `/dashboard/settings/security` | Credential stuffing or brute force |
| `login.locked` events for the same user | `/dashboard/settings/security` | Targeted attack on one account |
| `totp.replay` events | security events | Someone has a valid 6-digit code and is trying to reuse it |
| `csrf.rejected` or `ssrf.blocked` events | security events | Active reconnaissance |
| `anomaly.impossible_travel` | security events | Likely ATO — legitimate user in country A, "also" signing in from country B within minutes |
| Audit chain broken (`/dashboard/settings/audit`) | audit badge | Someone has direct DB access and edited rows |
| CSP report spike at `/api/security/csp-report` | server logs | Could be a legit integration change, could be XSS attempt |

## Kill-switch playbook

`CLAIMRAIL_DISABLE` is a comma-list env var read on every request. Allowed
subsystems:

- `signup` — pause new account creation
- `login` — pause logins (users already signed in stay signed in)
- `password_reset` — pause forgot-password emails
- `probes` — pause the cron probe sweep
- `all` — every subsystem at once

### Active credential-stuffing wave

```
CLAIMRAIL_DISABLE=login
```

Effect:
- Login form returns 503-style message.
- Existing sessions stay valid — don't punish legitimate users.
- Middleware emits `X-ClaimRail-Disabled: login` so your status page can pick it up.

Meanwhile you:
1. Pull the attacker's IP range from `security_events.ip` for `login.failed`.
2. Add a firewall rule (Cloudflare / Vercel WAF) to block the prefix.
3. Un-kill login.

### Spam-signup wave

```
CLAIMRAIL_DISABLE=signup
```

The honeypot + time-to-submit catch naive bots, but a sophisticated wave
(real browsers or Selenium grids) can sneak through. Pause signups and
investigate.

### Incident in progress — lock everything

```
CLAIMRAIL_DISABLE=all
```

Whole app is read-only for existing users. Use sparingly.

## "An account got phished" — recovery

1. In `/dashboard/settings`, the affected user clicks **Log out everywhere**.
2. They change their password. This revokes every other session automatically
   and pushes the compromised hash onto the password-history blocklist so
   the attacker can't re-use it later.
3. If 2FA wasn't on, turn it on now. Save backup codes somewhere offline.

## "Audit chain shows `Broken at #42`"

1. Someone with DB write access modified or deleted a row.
2. Dump `audit_events` to cold storage immediately.
3. Inspect the row at `seq=42` and the ones around it.
4. If this was a legit maintenance DELETE that nobody documented, capture
   the root cause and tighten DB access.
5. If it wasn't, treat as a data-integrity incident.

## "We got flagged by a vulnerability scanner"

1. Run the CI security suite locally to reproduce: `npm run test`.
2. CodeQL and gitleaks should surface anything sensitive on the next PR.
3. For dependency CVEs, bump the package and re-run
   `npm audit --omit=dev --audit-level=high`.

## "Someone is trying to hit internal IPs via our probe"

SSRF defenses (`validateProbeUrl` + DNS resolution) should have stopped
them; the rejection is logged as `ssrf.blocked` in security_events. If you
see a pattern:

1. Identify the attacker's user and revoke their session.
2. Examine their vendor inserts — a creative attacker might try many
   rebinding hostnames.
3. Consider adding a domain allowlist per tenant.

## Rotation runbook — `AUTH_SECRET`

If `AUTH_SECRET` leaks:

1. Generate a new one: `openssl rand -hex 32`.
2. Set it on the platform.
3. Deploy. Every existing JWT becomes invalid on the next request →
   everyone has to log in again. This is expected.
4. TOTP seeds were encrypted under the old secret — they need to be
   re-encrypted or users must re-enrol 2FA. For MVP we require re-enrol.
   Document this explicitly for customers.

## Regular drills (quarterly)

- `npm run test` — confirms every defense described here still fires.
- Manual: try to log in with a used TOTP code (should be rejected as replay).
- Manual: try to read another tenant's vendor URL directly (404).
- Manual: set `CLAIMRAIL_DISABLE=login`, confirm the dashboard banner.
- Paste an 800 KB blob into the SLA parser. Confirm it returns quickly.

## Contact

- Private vulnerability reports: GitHub's private reporting on this repo.
- RFC 9116: `/.well-known/security.txt`.
