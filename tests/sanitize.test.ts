import { describe, it, expect } from 'vitest';
import {
  stripControlChars,
  stripCrlf,
  sanitizeLine,
  sanitizeBlock,
  safeForLog,
} from '@/lib/security/sanitize';

describe('sanitize', () => {
  it('stripControlChars removes C0/C1 but keeps tab', () => {
    expect(stripControlChars('ab\u0001\u0002c')).toBe('abc');
    expect(stripControlChars('a\tb')).toBe('a\tb');
    expect(stripControlChars('a\x7fb\u0090c')).toBe('abc');
  });

  it('stripCrlf collapses newlines', () => {
    expect(stripCrlf('a\r\nb\nc')).toBe('a b c');
  });

  it('sanitizeLine trims, caps, and flattens', () => {
    expect(sanitizeLine('  hello  ')).toBe('hello');
    expect(sanitizeLine('a\nb', 3)).toBe('a b');
    expect(sanitizeLine('x'.repeat(1000), 10).length).toBe(10);
  });

  it('sanitizeBlock preserves newlines but drops bad control chars', () => {
    expect(sanitizeBlock('line 1\nline 2\tindent')).toBe('line 1\nline 2\tindent');
    expect(sanitizeBlock('hi\u0000\u0001there')).toBe('hithere');
  });

  it('safeForLog escapes CRLF so attackers cannot inject log lines', () => {
    const malicious = "user: alice\n[sec critical] login.failed ip=EVIL";
    const logged = safeForLog(malicious);
    expect(logged).not.toContain('\n');
    expect(logged).toContain('\\x0a');
  });

  it('safeForLog handles non-string inputs', () => {
    expect(safeForLog({ a: 1 })).toContain('"a":1');
    expect(safeForLog(null)).toBe('');
    expect(safeForLog(undefined)).toBe('');
  });
});
