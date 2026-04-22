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

// Auto-run when this module is imported. Skip during tests because some
// test runners (tinypool workers, happy-dom) internally mutate the proto
// chain to set up the DOM shim and would crash with "cannot assign to
// read-only property". In production and dev the freeze is active.
function shouldFreezeNow(): boolean {
  if (process.env.VITEST) return false;
  if (process.env.NODE_ENV === 'test') return false;
  // Next's build phase statically analyses routes and mutates prototypes
  // internally — freezing breaks `next build`. Only freeze at runtime.
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return true;
}

if (shouldFreezeNow()) {
  freezeGlobalPrototypes();
}
