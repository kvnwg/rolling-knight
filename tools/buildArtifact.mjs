/**
 * Folds the `vite build --mode artifact` output into one HTML page for the claude.ai artifact viewer
 * (which wraps the page in its own doctype/head/body). After Dumpster Legend's. The music and sounds
 * stay files of their own, copied beside the page (the code asks for each next to it:
 * new URL(name, import.meta.url)); `files.json` beside them maps each published name to its file, for
 * the Artifact publish's `files`.
 * Usage: node tools/buildArtifact.mjs [out.html]
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dir = 'dist-artifact';
const out = process.argv[2] ?? 'artifact/rolling-knight.html';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const jsRef = html.match(/<script[^>]*type="module"[^>]*src="\.\/([^"]+\.js)"[^>]*><\/script>/);
const cssRef = html.match(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/);
if (!jsRef || !cssRef) throw new Error('Could not find the built script/stylesheet in dist-artifact/index.html');
const media = readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.mp3'));
const leftovers = readdirSync(join(dir, 'assets')).filter((f) => !f.endsWith('.js') && !f.endsWith('.css') && !f.endsWith('.mp3'));
if (leftovers.length) throw new Error(`Assets were not inlined: ${leftovers.join(', ')}`);
const js = readFileSync(join(dir, jsRef[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dir, cssRef[1]), 'utf8');
if (/<\/style/i.test(css)) throw new Error('Stylesheet contains </style>');
if (/url\((?!["']?(data:|#))/.test(css)) throw new Error('Stylesheet still references external files');
const page = `<meta charset="utf-8">
<title>Rolling Knight</title>
<style>
  /* The game keeps its own look in either viewer theme. */
  :root { color-scheme: dark; --gutter-x: 16px; }
  html, body { height: 100%; background: #0b0d16; color: #fff4e0; }
</style>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
// The audio beside the page (last build's files cleared first), and the map of them to publish.
const base = dirname(out);
for (const f of readdirSync(base)) if (f.endsWith('.mp3')) rmSync(join(base, f));
const files = {};
let audio = 0;
for (const f of media) {
  copyFileSync(join(dir, 'assets', f), join(base, f));
  files[f] = join(base, f);
  audio += readFileSync(join(base, f)).length;
}
writeFileSync(join(base, 'files.json'), JSON.stringify(files, null, 1));
console.log(`Wrote ${out} (${(page.length / 1024 / 1024).toFixed(2)} MB) and ${media.length} audio files beside it (${(audio / 1024 / 1024).toFixed(2)} MB): ${join(base, 'files.json')}`);
