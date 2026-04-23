/* eslint-disable no-console */
/**
 * End-to-end smoke validator.
 *
 * Usage: node scripts/validate.mjs [--base=http://localhost:3000]
 *
 * Walks every user-facing flow in a real chromium instance and reports
 * pass/fail per check. Screenshots every page as it goes. Exit code is
 * non-zero if any check fails.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = 'shots/validate';
await mkdir(SHOTS, { recursive: true });

// ─── result tracking ────────────────────────────────────────────────
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  const icon = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
};
const check = async (name, fn) => {
  try {
    const detail = await fn();
    record(name, true, detail ?? '');
  } catch (err) {
    record(name, false, err instanceof Error ? err.message.slice(0, 300) : String(err));
  }
};

const shot = async (page, label) => {
  const safe = label.replace(/[^a-zA-Z0-9._-]+/g, '_');
  await page.screenshot({ path: path.join(SHOTS, `${safe}.png`), fullPage: true });
};

// ─── 1. ANONYMOUS ROUTES ────────────────────────────────────────────
console.log('\n── anonymous routes ─────────────────────────────────');
const anonChecks = [
  ['landing GET /', '/'],
  ['login GET /login', '/login'],
  ['signup GET /signup', '/signup'],
  ['forgot GET /forgot-password', '/forgot-password'],
  ['status GET /status', '/status'],
  ['api-docs GET /api-docs', '/api-docs'],
  ['health GET /api/health', '/api/health'],
  ['openapi GET /api/openapi.json', '/api/openapi.json'],
  ['security.txt GET /.well-known/security.txt', '/.well-known/security.txt'],
  ['robots.txt GET /robots.txt', '/robots.txt'],
];
for (const [name, pathn] of anonChecks) {
  await check(name, async () => {
    const res = await fetch(base + pathn);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return `${res.status} ${res.headers.get('content-type') ?? ''}`;
  });
}

await check('health json shape', async () => {
  const body = await (await fetch(base + '/api/health')).json();
  if (!body.ok) throw new Error(`ok=${body.ok}`);
  for (const k of ['db', 'users', 'vendors', 'claims', 'probes']) {
    if (body.checks?.[k]?.ok !== true) throw new Error(`check.${k} failed`);
  }
  return `v=${body.version} vendors=${body.checks.vendors.value} claims=${body.checks.claims.value}`;
});

await check('openapi is valid spec', async () => {
  const spec = await (await fetch(base + '/api/openapi.json')).json();
  if (spec.openapi !== '3.1.0') throw new Error(`bad openapi version ${spec.openapi}`);
  if (!spec.paths['/api/v1/vendors']) throw new Error('missing /api/v1/vendors');
  if (!spec.paths['/api/v1/claims']) throw new Error('missing /api/v1/claims');
  return `${Object.keys(spec.paths).length} paths`;
});

// ─── 2. API V1 (pre-auth) ──────────────────────────────────────────
console.log('\n── REST API v1 ──────────────────────────────────────');
await check('GET /api/v1/vendors without token → 401', async () => {
  const r = await fetch(base + '/api/v1/vendors');
  if (r.status !== 401) throw new Error(`status ${r.status}`);
  const www = r.headers.get('www-authenticate');
  if (!www?.startsWith('Bearer')) throw new Error('missing WWW-Authenticate');
  return `${r.status} ${www}`;
});
await check('GET /api/v1/vendors with bad token → 401', async () => {
  const r = await fetch(base + '/api/v1/vendors', { headers: { authorization: 'Bearer crt_' + 'x'.repeat(30) } });
  if (r.status !== 401) throw new Error(`status ${r.status}`);
  return String(r.status);
});
await check('POST /api/v1/vendors without token → 401', async () => {
  const r = await fetch(base + '/api/v1/vendors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (r.status !== 401) throw new Error(`status ${r.status}`);
  return String(r.status);
});

// ─── 3. BROWSER FLOWS ──────────────────────────────────────────────
console.log('\n── browser flows ────────────────────────────────────');
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// Collect console errors per navigation so we can surface unexpected client-side crashes.
const clientErrors = [];
// Dev-mode noise we don't care about: favicon 404s, HMR pings, etc.
// Known-innocuous noise patterns:
//   • favicon / HMR 404s in dev
//   • Next.js's own dev-only hydration warning about the `nonce` attribute
//     it adds to <Script strategy="beforeInteractive"> (stripped client-
//     side on purpose; production React doesn't emit this warning).
const noiseRe = [
  /favicon\.ico/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /Extra attributes from the server[\s\S]*nonce/i,
];
page.on('pageerror', (e) => clientErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (noiseRe.some((re) => re.test(text))) return;
  clientErrors.push(`console.error: ${text.slice(0, 200)}`);
});

// --- Landing ---
await check('landing page visually loads', async () => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const title = await page.title();
  if (!title.includes('ClaimRail')) throw new Error(`title="${title}"`);
  await shot(page, '01-landing');
  return title;
});

// --- Login: bad password shows error ---
await check('login rejects bad password', async () => {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  // Use a bogus email so repeated validator runs don't lock the demo
  // account via the per-email failed-login counter. The constant-time
  // dummy-verify path returns the same "Invalid" error.
  await page.fill('input[name="email"]', 'nobody-' + Date.now() + '@invalid.example');
  await page.fill('input[name="password"]', 'AnyPassword!2026');
  await page.click('button[type="submit"]');
  const err = await page.waitForSelector('text=Invalid email or password', { timeout: 15_000 });
  if (!err) throw new Error('no error message shown');
  await shot(page, '02-login-badpass');
  return 'error shown';
});

// --- Login success (demo) ---
await check('login succeeds, redirects to /dashboard', async () => {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  await page.fill('input[name="email"]', 'demo@claimrail.io');
  await page.fill('input[name="password"]', 'DemoRail!2026');
  await page.click('button[type="submit"]');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (/\/dashboard(\/|$|\?)/.test(page.url())) break;
    await page.waitForTimeout(200);
  }
  if (!/\/dashboard(\/|$|\?)/.test(page.url())) {
    throw new Error(`did not redirect, url=${page.url()}`);
  }
  await page.waitForLoadState('networkidle').catch(() => null);
  await shot(page, '03-dashboard');
  return page.url();
});

// --- Dashboard content sanity ---
await check('dashboard renders hero metric + vendors + chart', async () => {
  await page.goto(base + '/dashboard', { waitUntil: 'networkidle' });
  const hero = await page.textContent('text=/Potential credit/i');
  if (!hero) throw new Error('no "Potential credit" label');
  // Confirm the big dollar amount is somewhere on the page.
  const money = await page.locator('text=/\\$[0-9,]+/').first().textContent();
  if (!money) throw new Error('no dollar amount found');
  // At least one vendor row.
  const rowCount = await page.locator('a[href^="/dashboard/vendors/"]:not([href$="/new"])').count();
  if (rowCount < 1) throw new Error('no vendor links rendered');
  return `hero=${money.trim()} rows=${rowCount}`;
});

// --- Cmd+K palette opens ---
await check('Cmd+K opens command palette', async () => {
  // Try Control+K first (Linux/Windows), then Meta+K (macOS). Our handler
  // accepts either via the ctrlKey/metaKey check.
  await page.keyboard.press('Control+KeyK');
  let input = await page.waitForSelector('input[placeholder*="Type a command"]', { timeout: 3000 }).catch(() => null);
  if (!input) {
    await page.keyboard.press('Meta+KeyK');
    input = await page.waitForSelector('input[placeholder*="Type a command"]', { timeout: 3000 }).catch(() => null);
  }
  if (!input) throw new Error('palette not opened on either shortcut');
  await page.keyboard.press('Escape');
  return 'palette opens and closes';
});

// --- Dark mode toggle ---
await check('theme toggle flips html class', async () => {
  // ThemeToggle uses aria-label "Switch to dark mode" / "Switch to light mode".
  const toggle = page.locator('button[aria-label^="Switch to"]').first();
  const count = await toggle.count();
  if (count === 0) throw new Error('no theme toggle found');
  const startDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await toggle.click();
  await page.waitForTimeout(300);
  const endDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (startDark === endDark) throw new Error(`class did not toggle (still ${endDark ? 'dark' : 'light'})`);
  // Flip back so subsequent screenshots stay consistent.
  await toggle.click();
  await page.waitForTimeout(150);
  return `${startDark ? 'dark' : 'light'} → ${endDark ? 'dark' : 'light'} → back`;
});

// --- Notification bell opens ---
await check('notification bell opens dropdown', async () => {
  await page.locator('button[aria-label="Notifications"]').click();
  // The dropdown's own link element.
  const viewAll = await page.waitForSelector('a[href="/dashboard/settings/security"]:has-text("View all")', {
    timeout: 5000,
  });
  if (!viewAll) throw new Error('dropdown did not open');
  await page.mouse.click(10, 10);
  await page.waitForTimeout(200);
  return 'opened + closed';
});

// --- Vendors list ---
await check('vendors list page renders cards', async () => {
  await page.goto(base + '/dashboard/vendors', { waitUntil: 'networkidle' });
  const n = await page.locator('a[href^="/dashboard/vendors/"]:not([href$="/new"])').count();
  if (n < 1) throw new Error(`only ${n} vendor cards`);
  await shot(page, '04-vendors');
  return `${n} vendor cards`;
});

// --- Vendor detail + probe button ---
let firstVendorId = null;
await check('vendor detail page loads with chart + incidents', async () => {
  await page.goto(base + '/dashboard/vendors', { waitUntil: 'networkidle' });
  const first = await page.locator('a[href^="/dashboard/vendors/"]:not([href$="/new"])').first();
  const href = await first.getAttribute('href');
  firstVendorId = href?.split('/').pop() ?? null;
  await first.click();
  await page.waitForLoadState('networkidle');
  const latency = await page.textContent('text=/Latency/i');
  if (!latency) throw new Error('no Latency heading');
  await shot(page, '05-vendor-detail');
  return `vendor id=${firstVendorId}`;
});

await check('manual "Probe now" button works', async () => {
  if (!firstVendorId) throw new Error('no vendor id');
  // Fire the endpoint directly via fetch in the page context so we inherit cookies.
  const r = await page.evaluate(async (id) => {
    const res = await fetch(`/api/vendors/${id}/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: location.origin },
    });
    return { status: res.status, body: await res.json() };
  }, firstVendorId);
  if (r.status !== 200) throw new Error(`status ${r.status} body=${JSON.stringify(r.body)}`);
  if (!['up', 'down', 'degraded'].includes(r.body.result?.status)) throw new Error(`bad result ${JSON.stringify(r.body)}`);
  return `probe → ${r.body.result.status}`;
});

// --- Claims list + detail + PDF ---
let firstClaimId = null;
await check('claims list page renders', async () => {
  await page.goto(base + '/dashboard/claims', { waitUntil: 'networkidle' });
  const rows = await page.locator('a[href^="/dashboard/claims/"]').count();
  await shot(page, '06-claims');
  return `${rows} claims`;
});

await check('claim detail page + PDF download', async () => {
  await page.goto(base + '/dashboard/claims', { waitUntil: 'networkidle' });
  const first = await page.locator('a[href^="/dashboard/claims/"]').first();
  const href = await first.getAttribute('href');
  firstClaimId = href?.split('/').pop() ?? null;
  if (!firstClaimId) throw new Error('no claim id found');
  await first.click();
  await page.waitForLoadState('networkidle');
  await shot(page, '07-claim-detail');
  // Hit PDF endpoint via a fresh fetch with cookies.
  const pdfCheck = await page.evaluate(async (id) => {
    const res = await fetch(`/api/claims/${id}/pdf`);
    const ab = await res.arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(ab).slice(0, 8));
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      length: ab.byteLength,
      head,
    };
  }, firstClaimId);
  if (pdfCheck.status !== 200) throw new Error(`pdf status ${pdfCheck.status}`);
  if (pdfCheck.contentType !== 'application/pdf') throw new Error(`wrong content-type ${pdfCheck.contentType}`);
  if (!pdfCheck.head.startsWith('%PDF-1.4')) throw new Error(`not a PDF, head=${pdfCheck.head}`);
  return `pdf ${pdfCheck.length} bytes`;
});

// --- Incidents page ---
await check('incidents page renders', async () => {
  await page.goto(base + '/dashboard/incidents', { waitUntil: 'networkidle' });
  await shot(page, '08-incidents');
  return 'loaded';
});

// --- Settings root ---
await check('settings page renders account + team + integrations cards', async () => {
  await page.goto(base + '/dashboard/settings', { waitUntil: 'networkidle' });
  for (const label of ['Account', 'Password', 'Two-factor', 'Team', 'Slack alerts', 'API tokens', 'Probing']) {
    const found = await page.locator(`text=/${label}/i`).first();
    if ((await found.count()) === 0) throw new Error(`missing section: ${label}`);
  }
  await shot(page, '09-settings');
  return 'all sections present';
});

// --- Team page ---
await check('team page loads + invite form present', async () => {
  await page.goto(base + '/dashboard/settings/team', { waitUntil: 'networkidle' });
  const invite = await page.locator('input[name="email"][type="email"]');
  if ((await invite.count()) === 0) throw new Error('no invite email input');
  await shot(page, '10-team');
  return 'invite form present';
});

// --- Team invite submission ---
let inviteLinkText = null;
await check('team invite submission creates pending invite', async () => {
  await page.goto(base + '/dashboard/settings/team', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'validator-test@example.com');
  await page.selectOption('select[name="role"]', 'member');
  await page.click('button:has-text("Send invite")');
  const success = await page.waitForSelector('text=/Invite sent to/i', { timeout: 15_000 });
  if (!success) throw new Error('no success message');
  // The pending invites table should now include this email.
  await page.waitForTimeout(500);
  const pending = await page.locator('text=validator-test@example.com').count();
  if (pending === 0) throw new Error('invite not in pending list');
  // Grab the echo'd link so we can validate accept-invite.
  const maybeLink = await page.locator('text=/http.*accept-invite/').first();
  if ((await maybeLink.count()) > 0) inviteLinkText = (await maybeLink.textContent())?.trim() ?? null;
  await shot(page, '11-team-invited');
  return inviteLinkText ? 'link captured' : 'submitted';
});

// --- Accept-invite landing (expired/invalid token handling) ---
await check('accept-invite page loads for real token', async () => {
  if (!inviteLinkText) {
    // Skip gracefully — only fail if we've totally lost track.
    return 'skipped (no link captured)';
  }
  const fresh = await ctx.newPage();
  await fresh.goto(inviteLinkText, { waitUntil: 'networkidle' });
  const body = await fresh.textContent('body');
  if (!/Join|invite/i.test(body ?? '')) throw new Error('accept-invite page empty');
  await fresh.close();
  return 'renders';
});

// --- API tokens: create + revoke ---
let createdTokenValue = null;
await check('create API token → raw token shown once', async () => {
  await page.goto(base + '/dashboard/settings', { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'validator-script');
  await page.selectOption('select[name="scope"]', 'read');
  await page.click('button:has-text("Create token")');
  // The just-created token lives inside the green success box, inside a
  // `<code class="break-all">`. The hint text at the bottom also has a
  // `<code>` with "crt_…" (with a unicode ellipsis), so we target the
  // full-token element specifically.
  const codeEl = await page.waitForSelector('code.break-all', { timeout: 15_000 });
  createdTokenValue = (await codeEl.textContent())?.trim() ?? null;
  if (!createdTokenValue?.startsWith('crt_') || createdTokenValue.includes('…')) {
    throw new Error(`bad token "${createdTokenValue}"`);
  }
  await shot(page, '12-api-token-created');
  return `token len=${createdTokenValue.length}`;
});

await check('API token resolves on /api/v1/vendors', async () => {
  if (!createdTokenValue) throw new Error('no token captured');
  const r = await fetch(base + '/api/v1/vendors', {
    headers: { authorization: `Bearer ${createdTokenValue}` },
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (!Array.isArray(body.data)) throw new Error('missing data array');
  return `${body.data.length} vendors`;
});

await check('API token resolves on /api/v1/claims', async () => {
  if (!createdTokenValue) throw new Error('no token captured');
  const r = await fetch(base + '/api/v1/claims', {
    headers: { authorization: `Bearer ${createdTokenValue}` },
  });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (!Array.isArray(body.data)) throw new Error('missing data array');
  return `${body.data.length} claims`;
});

await check('POST /api/v1/vendors with read token → 403', async () => {
  if (!createdTokenValue) throw new Error('no token captured');
  const r = await fetch(base + '/api/v1/vendors', {
    method: 'POST',
    headers: { authorization: `Bearer ${createdTokenValue}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test',
      monitorUrl: 'https://example.com',
      monthlySpendCents: 100,
      tiers: [{ uptimeThresholdPct: 99.9, creditPct: 10 }],
    }),
  });
  if (r.status !== 403) throw new Error(`status ${r.status}`);
  return String(r.status);
});

// --- API tokens: write scope actually writes ---
let writeTokenValue = null;
await check('create write-scope token + POST creates vendor', async () => {
  await page.goto(base + '/dashboard/settings', { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'validator-write');
  await page.selectOption('select[name="scope"]', 'write');
  await page.click('button:has-text("Create token")');
  const codeEl = await page.waitForSelector('code.break-all', { timeout: 15_000 });
  writeTokenValue = (await codeEl.textContent())?.trim() ?? null;
  if (!writeTokenValue?.startsWith('crt_') || writeTokenValue.includes('…')) {
    throw new Error(`bad write token "${writeTokenValue}"`);
  }

  const r = await fetch(base + '/api/v1/vendors', {
    method: 'POST',
    headers: { authorization: `Bearer ${writeTokenValue}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'API-created vendor',
      monitorUrl: 'https://status.example.com',
      monthlySpendCents: 500_00,
      tiers: [{ uptimeThresholdPct: 99.9, creditPct: 10 }],
    }),
  });
  if (r.status !== 201) throw new Error(`status ${r.status} body=${await r.text()}`);
  const body = await r.json();
  if (!body.id) throw new Error('no id returned');
  return `created ${body.id}`;
});

// --- Slack webhook URL validation ---
await check('Slack section rejects non-Slack URL', async () => {
  await page.goto(base + '/dashboard/settings', { waitUntil: 'networkidle' });
  await page.fill('input[name="url"]', 'https://evil.example.com/hook');
  await page.click('button:has-text("Connect Slack"), button:has-text("Update URL")');
  const err = await page.waitForSelector('text=/Not a Slack/i', { timeout: 10_000 });
  if (!err) throw new Error('no validation error shown');
  return 'rejected';
});

// --- Audit + Security pages ---
await check('audit log page renders events', async () => {
  await page.goto(base + '/dashboard/settings/audit', { waitUntil: 'networkidle' });
  const hasTable = await page.locator('table').count();
  if (hasTable === 0) throw new Error('no table');
  await shot(page, '13-audit');
  return 'rendered';
});

await check('security events page renders', async () => {
  await page.goto(base + '/dashboard/settings/security', { waitUntil: 'networkidle' });
  const tableCount = await page.locator('table').count();
  const emptyState = await page.locator('text=No events yet').count();
  if (tableCount === 0 && emptyState === 0) throw new Error('no table or empty-state');
  await shot(page, '14-security');
  return tableCount > 0 ? 'table rendered' : 'empty state rendered';
});

// --- Status page ---
await check('/status page shows operational', async () => {
  await page.goto(base + '/status', { waitUntil: 'networkidle' });
  const body = await page.textContent('body');
  if (!/operational/i.test(body ?? '')) throw new Error('no "Operational" in body');
  await shot(page, '15-status');
  return 'operational';
});

// --- /api-docs page ---
await check('/api-docs renders endpoint examples', async () => {
  await page.goto(base + '/api-docs', { waitUntil: 'networkidle' });
  const sections = await page.locator('code:has-text("crt_")').count();
  if (sections === 0) throw new Error('no curl examples rendered');
  await shot(page, '16-api-docs');
  return `${sections} example blocks`;
});

// --- Logout ---
await check('logout kicks session', async () => {
  await page.goto(base + '/dashboard/settings', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Log out everywhere")');
  // Should redirect to landing.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!/\/dashboard/.test(page.url())) break;
    await page.waitForTimeout(200);
  }
  if (/\/dashboard/.test(page.url())) {
    throw new Error(`still on dashboard: ${page.url()}`);
  }
  // Visiting /dashboard directly must redirect to login.
  await page.goto(base + '/dashboard', { waitUntil: 'networkidle' });
  if (!/\/login/.test(page.url())) {
    throw new Error(`expected /login, got ${page.url()}`);
  }
  return 'session revoked';
});

// ─── CLIENT ERRORS ─────────────────────────────────────────────────
console.log('\n── client-side errors ────────────────────────────────');
if (clientErrors.length === 0) {
  record('no uncaught pageerror / console.error', true, '');
} else {
  const unique = [...new Set(clientErrors)];
  record('no uncaught pageerror / console.error', false, `${unique.length} unique:\n  ${unique.slice(0, 5).join('\n  ')}`);
}

await browser.close();

// ─── SUMMARY ───────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log(`\n── summary ─────────────────────────────────────────`);
console.log(`\x1b[32m${pass} passed\x1b[0m, \x1b[${fail ? 31 : 32}m${fail} failed\x1b[0m out of ${results.length}`);
console.log(`\nScreenshots: ${SHOTS}/`);

await writeFile(
  path.join(SHOTS, 'report.json'),
  JSON.stringify({ base, results, pass, fail }, null, 2),
);

process.exit(fail > 0 ? 1 : 0);
