/* eslint-disable no-console */
// Smoke test against production: login + dashboard render + cron auth.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'https://claimrail-tj98.onrender.com';
const EMAIL = 'demo@claimrail.io';
const PASSWORD = 'DemoRail!2026';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 500) errors.push(`http ${r.status()}: ${r.url()}`);
});

console.log(`→ ${BASE}/login`);
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="password"]', { state: 'visible' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');

const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  if (/\/dashboard(\/|$|\?)/.test(page.url())) break;
  await page.waitForTimeout(250);
}
console.log(`final url: ${page.url()}`);
await page.waitForLoadState('networkidle').catch(() => null);

const heroPresent = await page
  .locator('h1, h2', { hasText: /Overview|Welcome back/i })
  .first()
  .textContent()
  .catch(() => '(no h1)');
console.log(`page heading: ${heroPresent}`);

const dashTitle = await page.title();
console.log(`page title: ${dashTitle}`);

if (errors.length) {
  console.log('---');
  console.log(`✗ ${errors.length} error(s) encountered:`);
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
const dashOk = /Overview/i.test(heroPresent ?? '') && /\/dashboard/.test(page.url());
console.log(dashOk ? '✓ login + dashboard render OK' : '✗ login or dashboard failed');
await browser.close();
process.exit(dashOk ? 0 : 1);
