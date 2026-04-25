/**
 * Prototype-pollution hardening — surgical, not blunt.
 *
 * Imported once at server boot (via a side-effect import from the db/client
 * module). Locks down the actual attack surface (`__proto__` setter on
 * Object.prototype) without freezing the whole prototype chain.
 *
 * Why surgical
 *   The earlier implementation called `Object.freeze(Object.prototype)`,
 *   which broke any third-party library that legitimately reassigns
 *   inherited methods on its own instances (postgres-js does this for
 *   `toString` on connection / query-builder objects: in strict mode an
 *   assignment to a property whose ancestor descriptor is `writable: false`
 *   throws `TypeError: Cannot assign to read only property '…' of object`).
 *
 * What attackers actually do
 *   The classic prototype-pollution payload is
 *     {"__proto__": {"isAdmin": true}}
 *   smuggled into a deep-merge function. The merge does
 *     target[key] = source[key]
 *   where `key === "__proto__"` — which goes through Object.prototype's
 *   `__proto__` SETTER and reroutes the new fields onto every object's
 *   shared prototype. Replacing that setter with a thrower kills the
 *   attack with no collateral damage.
 *
 *   `Object.assign({}, { __proto__: ... })` and similar all funnel through
 *   the same setter, so the one defence covers them all.
 *
 *   The `constructor` field is a secondary vector (less common but cheap to
 *   block): we mark it non-writable so payloads like
 *     {"constructor": {"prototype": {"isAdmin": true}}}
 *   no-op rather than rebinding constructor references.
 *
 * Safe to call multiple times — every property descriptor change is
 * idempotent (we only act when the descriptor is still configurable /
 * writable).
 */

function hardenObjectPrototype(): void {
  const proto = Object.prototype;

  const protoDesc = Object.getOwnPropertyDescriptor(proto, '__proto__');
  if (protoDesc?.configurable) {
    Object.defineProperty(proto, '__proto__', {
      enumerable: false,
      configurable: false,
      get(): unknown {
        return Object.getPrototypeOf(this);
      },
      set(): never {
        throw new TypeError(
          '__proto__ assignment is disabled by ClaimRail prototype-pollution guard',
        );
      },
    });
  }

  const ctorDesc = Object.getOwnPropertyDescriptor(proto, 'constructor');
  if (ctorDesc?.writable) {
    Object.defineProperty(proto, 'constructor', {
      ...ctorDesc,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * Auto-run policy: harden ONLY in production runtime.
 *
 * Historical pain points:
 *   - Vitest + happy-dom mutate proto chains to install the DOM shim.
 *   - `next build`'s static route analysis mutates prototypes too.
 *   - `next dev`'s HMR / error-overlay patches prototypes on first import.
 *
 * None of those ship to production. The defense we care about is against
 * prototype-pollution via JSON bodies at RUNTIME — which is exactly the
 * environment where the hardening stays on.
 */
function shouldHardenNow(): boolean {
  if (process.env.VITEST) return false;
  if (process.env.NODE_ENV !== 'production') return false;
  // Next build is NODE_ENV=production but still runs the static analyser.
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return true;
}

/**
 * @deprecated Kept as a public name in case external scripts import it.
 * Call `hardenObjectPrototype` instead — see file-header rationale for
 * why the old "freeze everything" approach was abandoned.
 */
export const freezeGlobalPrototypes = hardenObjectPrototype;

if (shouldHardenNow()) {
  hardenObjectPrototype();
}
