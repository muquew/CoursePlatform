import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Route = { file: string; method: string; path: string };

const routesDir = join(import.meta.dir, '..', 'src', 'routes', 'v1');
const files = readdirSync(routesDir)
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => !['index.ts', 'index.legacy.ts', '_constants.ts', '_uploads.ts'].includes(f));

const routeRe = /\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gms;

const all: Route[] = [];
for (const f of files) {
  const full = join(routesDir, f);
  const txt = readFileSync(full, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = routeRe.exec(txt))) {
    all.push({ file: f, method: m[1].toUpperCase(), path: m[2] });
  }
}

const key = (r: Route) => `${r.method} ${r.path}`;
const byKey = new Map<string, Route[]>();
for (const r of all) {
  const k = key(r);
  const arr = byKey.get(k) ?? [];
  arr.push(r);
  byKey.set(k, arr);
}

const duplicates = [...byKey.entries()].filter(([, arr]) => arr.length > 1);
const badParam = all.filter((r) => /\/:id(\/|$)/.test(r.path) || /\/:rid(\/|$)/.test(r.path));

let ok = true;

if (duplicates.length) {
  ok = false;
  console.error('\n[check-routes] Duplicate registrations found:');
  for (const [k, arr] of duplicates) {
    console.error(`- ${k}`);
    for (const r of arr) console.error(`  - ${r.file}`);
  }
}

if (badParam.length) {
  ok = false;
  console.error('\n[check-routes] Non-semantic param names found (use :userId/:teamId/:projectId/...):');
  for (const r of badParam) {
    console.error(`- ${r.method} ${r.path}  (${r.file})`);
  }
}

if (ok) {
  console.log(`[check-routes] OK: ${all.length} routes scanned across ${files.length} files.`);
} else {
  process.exit(1);
}
