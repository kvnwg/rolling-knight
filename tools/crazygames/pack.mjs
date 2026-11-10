/**
 * After `vite build --mode crazygames`: checks dist-crazygames/ against what CrazyGames asks of an
 * upload and zips it (index.html at the zip's root), ready for the Developer Portal.
 *
 *   node tools/crazygames/pack.mjs [out.zip]      (default crazygames/build/roll-a-knight-crazygames.zip)
 *
 * The checks (docs.crazygames.com/requirements/technical): the SDK's script on the page before the
 * game's own; only relative paths to the bundle's files (absolute ones fail to load there); at most
 * 1500 files and 250 MB in all; the download before play at most 50 MB (20 MB for the mobile
 * homepage). The whole bundle is counted as that download, which is more than a player fetches (the
 * music comes in track by track as scenes want it), so passing here is passing there.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const dir = 'dist-crazygames';
const out = process.argv[2] ?? 'crazygames/build/roll-a-knight-crazygames.zip';
const MB = 1024 * 1024;

function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
}

const files = walk(dir).sort();
const total = files.reduce((n, f) => n + statSync(f).size, 0);
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const problems = [];

const sdk = html.indexOf('https://sdk.crazygames.com/crazygames-sdk-v3.js');
const game = html.search(/<script[^>]*type="module"/);
if (sdk < 0) problems.push("index.html doesn't load the CrazyGames SDK");
else if (game >= 0 && sdk > game) problems.push('the CrazyGames SDK loads after the game: it must come first');
// Paths to the bundle's own files, in the page and in what it loads: relative, never from the site's root.
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (m[1].startsWith('/') && !m[1].startsWith('//')) problems.push(`index.html uses an absolute path: ${m[1]}`);
}
for (const f of files.filter((x) => x.endsWith('.css'))) {
  if (/url\(\s*["']?\/(?!\/)/.test(readFileSync(f, 'utf8'))) problems.push(`${relative(dir, f)} has a url() from the site's root`);
}
if (files.length > 1500) problems.push(`${files.length} files: CrazyGames allows 1500`);
if (total > 250 * MB) problems.push(`${(total / MB).toFixed(1)} MB in all: CrazyGames allows 250 MB`);
if (total > 50 * MB) problems.push(`${(total / MB).toFixed(1)} MB to download: CrazyGames allows 50 MB before play`);

// The zip: every file deflated, paths with forward slashes, index.html at the root.
const stamp = (() => {
  const d = new Date();
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
})();
const parts = [];
const central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(relative(dir, f).split('\\').join('/'), 'utf8');
  const raw = readFileSync(f);
  const packed = deflateRawSync(raw, { level: 9 });
  const store = packed.length >= raw.length;
  const body = store ? raw : packed;
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(store ? 0 : 8, 8);
  head.writeUInt16LE(stamp.time, 10);
  head.writeUInt16LE(stamp.date, 12);
  head.writeUInt32LE(crc32(raw), 14);
  head.writeUInt32LE(body.length, 18);
  head.writeUInt32LE(raw.length, 22);
  head.writeUInt16LE(name.length, 26);
  parts.push(head, name, body);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  head.copy(entry, 8, 6, 30);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += 30 + name.length + body.length;
}
const dirSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dirSize, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, ...central, end]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip);

const audio = files.filter((f) => f.endsWith('.mp3')).reduce((n, f) => n + statSync(f).size, 0);
console.log(`dist-crazygames: ${files.length} files, ${(total / MB).toFixed(2)} MB (${(audio / MB).toFixed(2)} MB of it music and sounds, fetched as they're needed)`);
console.log(`  mobile homepage (20 MB before play): ${total <= 20 * MB ? 'fits' : 'too big'}`);
console.log(`Wrote ${out} (${(zip.length / MB).toFixed(2)} MB)`);
if (problems.length) {
  console.error(`\nNot ready for CrazyGames:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
