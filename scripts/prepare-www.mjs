// Collects the web app into www/ for Capacitor.
// Keeping this explicit (rather than pointing webDir at the repo root) means
// .git, workflows and node_modules never end up inside the APK.
import { mkdir, rm, copyFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'www');

// sw.js is deliberately NOT copied: inside the APK every asset is already
// local, so a service worker adds nothing and its network-first HTML fetch
// would only introduce a failure path.
const FILES = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = join(ROOT, f);
  if (!(await exists(src))) {
    console.warn(`  skip (missing): ${f}`);
    continue;
  }
  const dest = join(OUT, f);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`  + ${f}`);
  copied++;
}

if (!(await exists(join(OUT, 'index.html')))) {
  console.error('FATAL: index.html missing — refusing to build an empty APK.');
  process.exit(1);
}
console.log(`\nwww/ ready (${copied} files)`);
