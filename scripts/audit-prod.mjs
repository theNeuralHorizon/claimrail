/* eslint-disable no-console */
// Multi-page prod audit. Logs in, walks every dashboard page, captures
// console errors, page errors, slow responses, and 4xx/5xx network calls.
// Output: shots/prod/* + a summary table to stdout.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://claimrail-tj98.onrender.com';
const EMAIL = 'demo@claimrail.io';
const PASSWORD = 'DemoRail!2026';

const SHOTS_DIR = 'shots/prod';
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const PAGES = [
  { path: '/', name: 'landing', needsAuth: false },
  { path: '/login', name: 'login', needsAuth: false },
  { path: '/signup', name: 'signup', needsAuth: false },
  { path: '/forgot-password', name: 'forgot', needsAuth: false },
  { path: '/status', name: 'status', needsAuth: false },
  { path: '/api-docs', name: 'apidocs', needsAuth: false },
  { path: '/dashboard', name: 'overview', needsAuth: true },
  { path: '/dashboard/vendors', name: 'vendors', needsAuth: true },
  { path: '/dashboard/incidents', name: 'incidents', needsAuth: true },
  { path: '/dashboard/claims', name: 'claims', needsAuth: true },
  { path: '/dashboard/settings', name: 'settings', needsAuth: true },
  { path: '/dashboard/settings/audit', name: 'audit', needsAuth: true },
  { path: '/dashboard/settings/security', name: 'security', needsAuth: true },
  { path: '/dashboard/settings/team', name: 'team', needsAuth: true },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

const issues = [];
let currentRow = null;

page.on('console', (msg) => {
  if (!currentRow) return;
  if (msg.type() === 'error') currentRow.consoleErrors.push(msg.text().slice(0, 240));
});
page.on('pageerror', (err) => {
  if (!currentRow) return;
  currentRow.pageErrors.push((err.message ?? String(err)).slice(0, 240));
});
page.on('response', (resp) => {
  if (!currentRow) return;
  const status = resp.status();
  const url = resp.url();
  if (status >= 500) currentRow.http5xx.push(`${status} ${url}`);
  else if (status >= 400 && !url.includes('/_next/') && status !== 404) {
    currentRow.http4xx.push(`${status} ${url}`);
  }
});

console.log('→ logging in');
currentRow = { page: '_login', status: 'ok', consoleErrors: [], pageErrors: [], http5xx: [], http4xx: [], loadMs: 0 };
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
console.log(`  ✓ logged in: ${page.url()}`);

for (const p of PAGES) {
  currentRow = {
    page: p.name,
    status: 'ok',
    consoleErrors: [],
    pageErrors: [],
    http5xx: [],
    http4xx: [],
    loadMs: 0,
  };
  const t0 = Date.now();
  let goErr = null;
  try {
    // `networkidle` is flaky with Next.js streaming RSC responses — the
    // streaming chunks register as ongoing network even after the user-
    // visible HTML is fully parsed. `domcontentloaded` fires deterministically
    // and we still catch console errors / pageerrors / 5xx — those events
    // arrive whether or not networkidle fires.
    const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (resp && resp.status() >= 500) currentRow.status = 'fail';
  } catch (e) {
    goErr = e;
    currentRow.status = 'fail';
  }
  currentRow.loadMs = Date.now() - t0;
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${p.name}.png`), fullPage: true }).catch(() => null);
  if (currentRow.consoleErrors.length || currentRow.pageErrors.length || currentRow.http5xx.length) {
    currentRow.status = 'fail';
  }
  issues.push(currentRow);
  console.log(`  ${currentRow.status === 'ok' ? '✓' : '✗'} ${p.name.padEnd(12)} ${String(currentRow.loadMs).padStart(5)}ms ${goErr ? `goto-err=${goErr.message.slice(0, 80)}` : ''}`);
}

await browser.close();

console.log('\n=== Issue summary ===');
const failed = issues.filter((i) => i.status === 'fail');
if (failed.length === 0) {
  console.log('All pages clean — 0 issues across', issues.length, 'pages.');
} else {
  for (const i of failed) {
    console.log(`\n${i.page} (${i.loadMs}ms)`);
    for (const e of i.pageErrors) console.log(`  pageerror: ${e}`);
    for (const e of i.consoleErrors) console.log(`  console.error: ${e}`);
    for (const e of i.http5xx) console.log(`  5xx: ${e}`);
    for (const e of i.http4xx) console.log(`  4xx: ${e}`);
  }
}
console.log('\n=== Slowest pages ===');
[...issues]
  .sort((a, b) => b.loadMs - a.loadMs)
  .slice(0, 5)
  .forEach((i) => console.log(`  ${i.loadMs.toString().padStart(5)}ms  ${i.page}`));

console.log(`\nScreenshots: ${SHOTS_DIR}/`);
process.exit(failed.length === 0 ? 0 : 1);
