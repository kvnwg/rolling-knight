/**
 * Films the trailer's cut (shots.cjs CUT) and joins it into the two videos CrazyGames asks for:
 *
 *   node tools/trailer/cut.cjs [--base http://localhost:5173/] [--frames shots/trailer] [--out crazygames/video]
 *                              [--only landscape|portrait] [--crf 18]
 *
 *   crazygames/video/trailer-landscape-1920x1080.mp4
 *   crazygames/video/trailer-portrait-1080x1620.mp4
 *
 * Each opens on its cover (crazygames/covers/) for half a second, dissolving into the first shot: on
 * the portal the video starts under the thumbnail, so the picture seems to come alive. Then the
 * shots, cut hard one to the next. No sound, 60 frames a second, at most 20 seconds and 50 MB
 * (docs.crazygames.com/requirements/game-covers).
 *
 * A shot already filmed (a folder under --frames whose meta.json covers its seconds) is used as it
 * is; the rest are filmed first (capture.cjs: about a second a frame on a machine with no graphics card).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CUT } = require('./shots.cjs');

const FPS = 60;
const COVER_SECONDS = 0.5;
const DISSOLVE = 0.2;
const MAX_SECONDS = 20;
const MAX_BYTES = 50 * 1024 * 1024;

const a = process.argv.slice(2);
const opt = { base: 'http://localhost:5173/', frames: 'shots/trailer', out: 'crazygames/video', crf: '18' };
for (let i = 0; i < a.length; i += 2) opt[a[i].slice(2)] = a[i + 1];

const FORMATS = [
  { id: 'landscape', portrait: false, size: '1920x1080', cover: 'crazygames/covers/cover-landscape-1920x1080.png' },
  { id: 'portrait', portrait: true, size: '1080x1620', cover: 'crazygames/covers/cover-portrait-1080x1620.png' },
].filter((f) => !opt.only || opt.only === f.id);

/** The folder holding this shot's seconds in this format (filmed now if there isn't one), and the frame it starts at there. */
function framesFor(take, from, to, portrait) {
  const covers = (dir) => {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      const ok = m.shot === take && !!m.portrait === portrait && !m.scout && m.fps === FPS && m.from <= from + 1e-6 && m.to >= to - 1e-6 && m.frames >= Math.round((m.to - m.from) * FPS);
      return ok ? Math.round((from - m.from) * FPS) : -1;
    } catch {
      return -1;
    }
  };
  if (fs.existsSync(opt.frames)) {
    for (const name of fs.readdirSync(opt.frames)) {
      const first = covers(path.join(opt.frames, name));
      if (first >= 0) return { dir: path.join(opt.frames, name), first };
    }
  }
  const name = `${take}_${from}_${to}${portrait ? '-portrait' : ''}`;
  console.log(`Filming ${name}...`);
  execFileSync('node', [path.join(__dirname, 'capture.cjs'), take, '--from', String(from), '--to', String(to), '--out', opt.frames, '--name', name, '--base', opt.base, ...(portrait ? ['--portrait'] : [])], { stdio: 'inherit' });
  return { dir: path.join(opt.frames, name), first: 0 };
}

fs.mkdirSync(opt.out, { recursive: true });
const shots = CUT.reduce((n, [, from, to]) => n + (to - from), 0);
const total = COVER_SECONDS + shots - DISSOLVE;
console.log(`The cut: ${CUT.length} shots, ${shots.toFixed(2)}s of play, ${total.toFixed(2)}s with the cover`);
if (total > MAX_SECONDS + 1e-6) throw new Error(`The cut is ${total.toFixed(2)}s: CrazyGames takes ${MAX_SECONDS}s at most`);

for (const f of FORMATS) {
  if (!fs.existsSync(f.cover)) throw new Error(`No cover at ${f.cover} (tools/crazygames/covers.py makes it)`);
  // Every frame of the cut, in order, for ffmpeg's concat reader.
  const lines = [];
  for (const [take, from, to] of CUT) {
    const { dir, first } = framesFor(take, from, to, f.portrait);
    const n = Math.round((to - from) * FPS);
    for (let i = 0; i < n; i++) {
      const file = path.resolve(dir, `${String(first + i).padStart(5, '0')}.png`);
      if (!fs.existsSync(file)) throw new Error(`Missing frame ${file}`);
      lines.push(`file '${file}'`, `duration ${1 / FPS}`);
    }
  }
  const list = path.join(opt.frames, `cut-${f.id}.txt`);
  fs.writeFileSync(list, lines.join('\n') + '\n');
  const out = path.join(opt.out, `trailer-${f.id}-${f.size}.mp4`);
  const [w, h] = f.size.split('x');
  const fit = `scale=${w}:${h}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`;
  execFileSync(
    'ffmpeg',
    [
      '-v', 'error', '-y',
      '-loop', '1', '-framerate', String(FPS), '-t', String(COVER_SECONDS), '-i', f.cover,
      '-f', 'concat', '-safe', '0', '-i', list,
      '-filter_complex', `[0:v]${fit}[c];[1:v]${fit}[m];[c][m]xfade=transition=fade:duration=${DISSOLVE}:offset=${COVER_SECONDS - DISSOLVE}[v]`,
      '-map', '[v]', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-r', String(FPS), '-movflags', '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  );
  const bytes = fs.statSync(out).size;
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  console.log(`${out}: ${seconds.toFixed(2)}s, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  if (bytes > MAX_BYTES) throw new Error(`${out} is over CrazyGames' 50 MB: raise --crf`);
  if (seconds > MAX_SECONDS + 0.05) throw new Error(`${out} is over ${MAX_SECONDS}s`);
}
