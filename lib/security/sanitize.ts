/**
 * Input sanitizers. Apply at the server boundary before storage or logging.
 *
 * These are NOT a replacement for output escaping (React does that) or
 * parameterized queries (Drizzle does that). They're defense in depth:
 *   - scrub control chars and CRLF so values can't inject log lines
 *   - trim and cap to sane lengths
 *   - reject unprintable payloads early
 */

// Regex-free scrubber — matching on control chars with regex is fine, but
// a hand-rolled loop sidesteps regex-engine quirks entirely.
export function stripControlChars(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    // Keep printable ASCII + common unicode; drop C0 control chars (0-31)
    // except TAB (9). Drop DEL (127) and C1 control chars (128-159).
    if (c === 9) {
      out += '\t';
      continue;
    }
    if (c < 32 || (c >= 127 && c <= 159)) continue;
    out += input[i];
  }
  return out;
}

export function stripCrlf(input: string): string {
  return input.replace(/[\r\n]+/g, ' ');
}

/**
 * Sanitize a user-provided single-line string (names, emails, URLs…)
 * before it's stored or echoed back.
 */
export function sanitizeLine(input: string, maxLen = 500): string {
  // Order matters: CRLF → space first, THEN strip remaining control chars.
  // Doing it the other way would drop newlines entirely instead of turning
  // them into spaces.
  const stripped = stripControlChars(stripCrlf(input.trim()));
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

/**
 * Sanitize a multi-line string (notes, SLA text). Preserves newlines but
 * drops other control chars.
 */
export function sanitizeBlock(input: string, maxLen = 50_000): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) {
      out += input[i];
      continue;
    }
    if (c < 32 || (c >= 127 && c <= 159)) continue;
    out += input[i];
  }
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

/**
 * Safe-for-log: sanitize a value for emission to stdout / a log aggregator.
 * Collapses everything down to printable ASCII-ish text so a CRLF in an
 * email or a name can't inject fake log entries.
 */
export function safeForLog(input: unknown): string {
  if (input == null) return '';
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  return s.replace(/[\r\n\t\x00-\x1f\x7f-\x9f]/g, (c) => {
    if (c === '\t') return ' ';
    return `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}
