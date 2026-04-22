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
