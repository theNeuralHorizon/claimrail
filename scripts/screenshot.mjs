/* eslint-disable no-console */
// Usage: node scripts/screenshot.mjs <url> <outfile.png> [--dark] [--viewport=WxH]
// Logs into the demo account if the URL requires auth (hits /login first).
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1] ?? `shots/${Date.now()}.png`;
const dark = args.includes('--dark');
const vpArg = args.find((a) => a.startsWith('--viewport='));
const [w, h] = vpArg ? vpArg.replace('--viewport=', '').split('x').map(Number) : [1440, 900];

if (!url) {
  console.error('Usage: node scripts/screenshot.mjs <url> <outfile.png> [--dark] [--viewport=1440x900]');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  colorScheme: dark ? 'dark' : 'light',
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// If the target isn't /login or /, authenticate first.
const targetPath = new URL(url).pathname;
const needsAuth = !/^\/(login|signup|forgot-password|status|api-docs)?\/?$/.test(targetPath) && targetPath !== '/';
if (needsAuth) {
  await page.goto(new URL('/login', url).toString(), { waitUntil: 'domcontentloaded' });
  // Server actions + RSC sometimes need a beat before the client bundle
  // is ready to intercept the submit — wait for the known-hydrated form.
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  await page.fill('input[name="email"]', 'demo@claimrail.io');
  await page.fill('input[name="password"]', 'DemoRail!2026');
  await page.click('button[type="submit"]');
  // Wait until we're definitely on a dashboard route.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const now = page.url();
    if (/\/dashboard(\/|$|\?)/.test(now)) break;
    await page.waitForTimeout(250);
  }
  if (!/\/dashboard(\/|$|\?)/.test(page.url())) {
    console.error('Login did not redirect. Current URL:', page.url());
    const body = await page.content();
    console.error('HTML excerpt:', body.slice(0, 500));
  }
  await page.waitForLoadState('networkidle').catch(() => null);
}

await page.goto(url, { waitUntil: 'networkidle' });
console.log('final page URL:', page.url());
const title = await page.title();
console.log('final page title:', title);
// Give charts a moment to animate.
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
console.log(`✓ ${out}`);
await browser.close();
