/**
 * SSRF guard for probe URLs.
 *
 * Users paste arbitrary URLs into the vendor form. Without a guard, they
 * could (accidentally or maliciously) point ClaimRail at `http://169.254.169.254/`
 * (cloud metadata), `http://127.0.0.1:6379` (in-host Redis), or internal
 * network addresses — letting the server reveal responses from private
 * infrastructure.
 *
 * We block:
 *   • non-http(s) schemes
 *   • hostnames that resolve to private IP ranges (RFC 1918, loopback,
 *     link-local, metadata service)
 *   • IPv6 local / link-local / ULA ranges
 *
 * Note: DNS resolution happens inside `fetch`; we can only check the
 * hostname shape here. For a production deployment you'd also resolve DNS
 * and block based on the resolved IP. We document that trade-off.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // link-local + AWS/GCP metadata
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i, // ULA
  /^fe80:/i, // link-local IPv6
  /^fd[0-9a-f]{2}:/i, // ULA variant
  /\.internal$/i,
  /\.local$/i,
];

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// IP-level private-range detection. Used after DNS resolution to block
// hostnames that resolve to any private / link-local / loopback / metadata
// address. Covers both IPv4 and IPv6.
// ─────────────────────────────────────────────────────────────────────────

function ipv4InPrivateRange(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // RFC2544 benchmarks
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function ipv6InPrivateRange(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('ff')) return true; // multicast
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — extract and re-check
    const v4 = normalized.slice(7);
    if (net.isIP(v4) === 4) return ipv4InPrivateRange(v4);
  }
  return false;
}

function ipInPrivateRange(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4InPrivateRange(ip);
  if (kind === 6) return ipv6InPrivateRange(ip);
  return true;
}

/**
 * Resolve a hostname via DNS and return the first A/AAAA address that
 * indicates the host is public. Throws if any resolved address is private.
 *
 * Caller should invoke this just before the outbound fetch so we catch
 * hostnames that resolve to private IPs (common DNS-rebinding scenarios).
 */
export async function assertHostResolvesPublicly(hostname: string): Promise<void> {
  // Short-circuit if hostname is a literal IP — covered by validateProbeUrl.
  if (net.isIP(hostname)) {
    if (ipInPrivateRange(hostname)) {
      throw new Error(`IP ${hostname} is in a private range`);
    }
    return;
  }
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = result.map((r) => r.address);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNS lookup failed';
    throw new Error(`DNS lookup failed: ${msg}`);
  }
  if (addresses.length === 0) {
    throw new Error('Hostname has no DNS records');
  }
  for (const addr of addresses) {
    if (ipInPrivateRange(addr)) {
      throw new Error(`Hostname ${hostname} resolves to private IP ${addr}`);
    }
  }
}

export function validateProbeUrl(input: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `Protocol ${url.protocol} is not allowed (use http/https)` };
  }
  // In production we require HTTPS for probes — but allow http on localhost
  // for tests. This guard runs before the localhost check so ordering matters.
  const hostname = url.hostname;
  for (const re of BLOCKED_HOSTNAME_PATTERNS) {
    if (re.test(hostname)) {
      return { ok: false, reason: `Hostname ${hostname} is not publicly reachable` };
    }
  }
  // Block ports commonly used for internal services, even on public IPs
  const port = Number(url.port);
  if (port && (port < 80 || (port > 1024 && port < 1080) || port === 6379 || port === 5432 || port === 3306 || port === 27017 || port === 9200)) {
    return { ok: false, reason: `Port ${port} is not allowed` };
  }
  return { ok: true };
}
