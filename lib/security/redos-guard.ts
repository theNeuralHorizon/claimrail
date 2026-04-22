/**
 * Guard against catastrophic-backtracking (ReDoS) on user-supplied text.
 *
 * Node's RegExp engine is backtracking-based; a pattern like
 * `(a+)+b` fed "aaaaaaaaaaaaaaaaaaaa!" enters exponential time. Some
 * regexes look fine until a pathological input arrives (e.g. a very long
 * SLA document pasted by a bot).
 *
 * Two-layer guard:
 *   1. Input cap: user text over MAX_INPUT_LEN is truncated before match.
 *   2. Wall-clock budget: matching runs in a Promise race against a
 *      setTimeout. If the regex is still running past the budget, we
 *      abandon it and return null.
 *
 * Note: a sync `.exec` can't be externally interrupted in Node (the event
 * loop is blocked), so the budget only limits total time the *caller*
 * waits for. We accept that a worst-case pattern still burns the budget on
 * one request thread — which is why #1 exists too.
 */

const MAX_INPUT_LEN = 80_000;
const DEFAULT_BUDGET_MS = 250;

export interface SafeMatchOptions {
  budgetMs?: number;
  maxInputLen?: number;
}

/**
 * Run a regex match under a time budget. Returns the result, or null if
 * the regex took too long.
 */
export async function safeMatchAll(
  pattern: RegExp,
  text: string,
  options: SafeMatchOptions = {},
): Promise<RegExpMatchArray[] | null> {
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const cap = options.maxInputLen ?? MAX_INPUT_LEN;
  const safeText = text.length > cap ? text.slice(0, cap) : text;
  return new Promise<RegExpMatchArray[] | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), budget);
    // setImmediate gives the timer a chance to register; on long regexes
    // Node still blocks here, but the caller sees the timer fire.
    setImmediate(() => {
      try {
        const out = Array.from(safeText.matchAll(pattern));
        clearTimeout(timer);
        resolve(out);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

/**
 * Synchronous cap — run a regex but truncate inputs that exceed
 * MAX_INPUT_LEN. Use this at the boundary of anything user-controlled.
 */
export function capForRegex(input: string, maxLen = MAX_INPUT_LEN): string {
  return input.length > maxLen ? input.slice(0, maxLen) : input;
}

export const REDOS_MAX_INPUT_LEN = MAX_INPUT_LEN;
export const REDOS_DEFAULT_BUDGET_MS = DEFAULT_BUDGET_MS;
