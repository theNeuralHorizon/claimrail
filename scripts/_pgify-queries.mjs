/* eslint-disable no-console */
// One-shot helper for the libsql → postgres-js dialect swap.
//
//   .all()            → ``                       (await alone returns array)
//   .get()            → `.then((r) => r[0])`     (typed inline pick)
//   .then(_pgFirst)   → `.then((r) => r[0])`     (clean up earlier swap)
//   .run()            → ``                       (pg-core insert/update/delete
//                                                 returns on await)
//
// `.all()`, `.get()`, `.run()` are unambiguous in this codebase — no other
// API uses those exact bare-parens forms (cookies().get(name),
// headers().get(name), Promise.all([...]) all have non-empty arg lists).
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'lib', 'scripts', 'tests'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_FILES = new Set([
  // The migrate runner itself doesn't use sqlite-only terminators.
  path.join('lib', 'db', 'migrate.ts'),
  // The client adapter doesn't talk to itself.
  path.join('lib', 'db', 'client.ts'),
  // Helper script must keep its own literal regexes.
  path.join('scripts', '_pgify-queries.mjs'),
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function shouldSkip(file) {
  return [...SKIP_FILES].some((suffix) => file.endsWith(suffix));
}

let changed = 0;
const tally = { all: 0, get: 0, run: 0, pgFirst: 0 };

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    if (shouldSkip(file)) continue;
    const original = fs.readFileSync(file, 'utf8');

    const counts = {
      all: (original.match(/\.all\(\)/g) ?? []).length,
      get: (original.match(/\.get\(\)/g) ?? []).length,
      run: (original.match(/\.run\(\)/g) ?? []).length,
      pgFirst: (original.match(/\.then\(_pgFirst\)/g) ?? []).length,
    };
    if (!counts.all && !counts.get && !counts.run && !counts.pgFirst) continue;

    let updated = original;
    updated = updated.replace(/\.all\(\)/g, '');
    updated = updated.replace(/\.get\(\)/g, '.then((r) => r[0])');
    updated = updated.replace(/\.run\(\)/g, '');
    updated = updated.replace(
      /\.then\(_pgFirst\)/g,
      '.then((r) => r[0])',
    );

    if (updated === original) continue;
    fs.writeFileSync(file, updated);
    changed += 1;
    tally.all += counts.all;
    tally.get += counts.get;
    tally.run += counts.run;
    tally.pgFirst += counts.pgFirst;
    console.log(
      `${file.padEnd(72)}  -${counts.all} .all() / -${counts.get} .get() / -${counts.run} .run() / -${counts.pgFirst} ._pgFirst`,
    );
  }
}

console.log(`\nFiles changed: ${changed}`);
console.log(`.all() replaced: ${tally.all}`);
console.log(`.get() replaced: ${tally.get}`);
console.log(`.run() replaced: ${tally.run}`);
console.log(`._pgFirst replaced: ${tally.pgFirst}`);
