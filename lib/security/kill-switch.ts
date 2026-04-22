/**
 * Incident-response kill switch.
 *
 * Set `CLAIMRAIL_DISABLE` to a comma-separated list of subsystems to take
 * them offline without a redeploy. The middleware + server actions respect
 * it. Use during:
 *   - active credential-stuffing storm (disable `login`)
 *   - spam-signup wave (disable `signup`)
 *   - total lockdown (disable `all`)
 *
 * Setting an env var on a serverless platform (Vercel env, Fly, Railway)
 * hot-rolls on the next request — no redeploy required.
 */

export type DisableKey = 'login' | 'signup' | 'password_reset' | 'probes' | 'all';

const ALL: DisableKey[] = ['login', 'signup', 'password_reset', 'probes'];

function parsed(): Set<DisableKey> {
  const raw = (process.env.CLAIMRAIL_DISABLE ?? '').trim();
  if (!raw) return new Set();
  const parts = raw.split(',').map((s) => s.trim().toLowerCase()) as DisableKey[];
  const set = new Set<DisableKey>();
  for (const p of parts) {
    if (p === 'all') ALL.forEach((x) => set.add(x));
    else if ((ALL as string[]).includes(p)) set.add(p);
  }
  return set;
}

export function isDisabled(key: DisableKey): boolean {
  return parsed().has(key);
}

export function disabledKeys(): DisableKey[] {
  return Array.from(parsed());
}

/**
 * Canonical 503 response for a killed subsystem. Middleware and server
 * actions share this so the UX is consistent.
 */
export function killSwitchMessage(key: DisableKey): string {
  return `This action is temporarily disabled (${key}). Check /status or contact your administrator.`;
}
