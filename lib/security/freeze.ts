/**
 * Prototype-pollution hard-freeze.
 *
 * Imported once at server boot (via a side-effect import from the db/client
 * module). Freezes Object.prototype, Array.prototype, Function.prototype,
 * and Number.prototype so an attacker can't smuggle `__proto__` in a JSON
 * body and mutate the global prototype chain.
 *
 * Worked examples:
 *   - Legacy Express/body-parser CVEs turned `{"__proto__": {"isAdmin": true}}`
 *     into a global "every object has isAdmin: true" once deep-merged.
 *   - Object.freeze on the prototypes makes every mutating assignment throw
 *     in strict mode (which is implicit in ES modules).
 *
 * Safe to call multiple times; Object.freeze is idempotent.
 */

export function freezeGlobalPrototypes(): void {
  const targets: Array<Record<string, unknown>> = [
    Object.prototype as unknown as Record<string, unknown>,
    Array.prototype as unknown as Record<string, unknown>,
    Function.prototype as unknown as Record<string, unknown>,
    Number.prototype as unknown as Record<string, unknown>,
    String.prototype as unknown as Record<string, unknown>,
    Boolean.prototype as unknown as Record<string, unknown>,
  ];
  for (const proto of targets) {
    if (!Object.isFrozen(proto)) {
      Object.freeze(proto);
    }
  }
}

/**
 * Auto-run policy: freeze ONLY in production runtime.
 *
 * Historical pain points:
 *   - Vitest + happy-dom mutate proto chains to install the DOM shim.
 *   - `next build`'s static route analysis mutates prototypes too.
 *   - `next dev`'s HMR / error-overlay patches prototypes on first import
 *     — freeze → overlay crashes → every route 500s in dev.
 *
 * None of those ship to production. The defense we care about is against
 * prototype-pollution via JSON bodies at RUNTIME — which is exactly the
 * environment where the freeze stays on.
 */
function shouldFreezeNow(): boolean {
  if (process.env.VITEST) return false;
  if (process.env.NODE_ENV !== 'production') return false;
  // Next build is NODE_ENV=production but still runs the static analyser.
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return true;
}

if (shouldFreezeNow()) {
  freezeGlobalPrototypes();
}
