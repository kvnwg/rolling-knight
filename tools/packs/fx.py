"""
Turns battle effects from the Super Pixel Effects Gigapack (free version) into AnimSheets
(src/render/pixel/indexed.ts).

    python3 -I tools/packs/fx.py <pack PNG dir> src/render/packs/fx.ts

<pack PNG dir> is the pack's PNG folder (Explosions/, Impacts/, Magic Bursts/, ...). Every effect uses
its `_small_` variant, copied 1:1 (one pack pixel = one art pixel, never scaled):
  - alpha is quantized to 0/255 (pixels under ALPHA_MIN are dropped, the rest become opaque),
  - frames are cropped to the union of their opaque pixels,
  - each sheet keeps its own palette (near-identical colors merged, at most 62),
  - the anchor is the center of the pack's frame (the effect's origin), in cropped-frame pixels.
Only PNG files are read from the pack, as data; nothing in it is executed.

The art is "Pixel Art Assets - Will Tice / unTied Games": credit it in the game. It may ship inside
the game but must not be redistributed on its own.
"""
import re
import sys
import textwrap
from pathlib import Path

from PIL import Image

# Palette keys, as in src/render/pixel/indexed.ts.
KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# Alpha at or above this is opaque; below it the pixel is dropped.
ALPHA_MIN = 128
# Colors closer than this (RGB distance) are merged into the more common one.
MERGE_DIST = 12


class Fx:
    def __init__(self, name, folder, fps, loop=False, step=1, note=''):
        self.name = name
        self.folder = folder  # <category>/<effect> under the PNG dir
        self.fps = fps
        self.loop = loop
        self.step = step  # keep every step-th frame (1 = all)
        self.note = note


# The pack's heal (48 x 48), fire (38 x 54), coin burst (64 x 56) and dust ring are left out: too big
# next to 15 to 30 px characters at 1:1.
# The picks; the generator prints each one's cropped size. Targets were ~16 px for hit, ~28 for crit,
# ~24 for slash and ~32 for boom. Apart from the muzzle flash (hit), the free pack has no impact or
# swipe smaller than 29 x 32, so crit and slash use the smallest effects that fit their roles, whole.
EFFECTS = [
    Fx('hit', 'Sci-fi/scifi_muzzle_flash_001', 24,
       note='A quick spark that sprays forward (to the right): ordinary hits.'),
    Fx('crit', 'Explosions/symmetrical_explosion_001', 20,
       note='A white flash that bursts into a yellow ring and a red crescent: critical hits.'),
    Fx('slash', 'Impacts/directional_impact_001', 24,
       note='Spikes and an arc that burst to the right: big melee hits (Whirlwind, Dragon Lunge).'),
    Fx('boom', 'Explosions/symmetrical_explosion_002', 20,
       note='A small fireball that turns into smoke: meteors, bombs, blasts.'),
    Fx('smoke', 'Smoke Bursts/symmetrical_smoke_burst_001', 20,
       note='A puff of smoke: mobs vanishing.'),
    Fx('splat', 'Splatters/burst_splatter_001', 20,
       note='A splatter burst: slimes popping.'),
    Fx('sparkle', 'Magic Bursts/round_sparkle_burst_001', 18,
       note='A pale blue flash that scatters into twinkling sparkles: revives, knights joining.'),
    Fx('levelUp', 'Magic Bursts/round_firework_burst_002', 15,
       note='A gold firework: bosses falling.'),
    Fx('lightning', 'Lightning/lightning_burst_002', 20,
       note='A burst of pink and violet zigzag lightning: the Guardian\'s taunt.'),
    Fx('heal', 'Fantasy Spells/spell_heal_001', 16,
       note='Rising crosses and light: the Cleric\'s Sanctuary.'),
    Fx('death', 'Fantasy Spells/spell_death_001', 24, step=2,
       note='A dark wisp rising: a knight going down.'),
    Fx('shock', 'mini:fx2_impact_shock_large_brown', 20,
       note='A shockwave of dust along the ground (Mini Pack 1): slams and the Guardian\'s taunt.'),
    Fx('electric', 'mini:fx2_electric_burst_large_violet', 20, step=2,
       note='A big violet electric burst (Mini Pack 1): meteors landing, bosses enraging.'),
    Fx('explosion', 'mini:fx1_explosion_small_orange', 20,
       note='A small orange explosion (Mini Pack 1): bombs.'),
]


def natural(p):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', p.name)]


def small_variant(root, folder):
    if folder.startswith('mini:'):
        # Super Pixel Effects Mini Pack 1: one folder of frames per effect.
        d = root.mini / folder[5:]
        if not d.is_dir():
            raise SystemExit(f'{folder}: not found under {root.mini}')
        return d
    d = root / folder
    if not d.is_dir():
        raise SystemExit(f'{folder}: not found under {root}')
    vs = sorted(p for p in d.iterdir() if p.is_dir() and not p.is_symlink() and '_small' in p.name)
    if len(vs) != 1:
        raise SystemExit(f'{folder}: expected one _small_ variant, found {[p.name for p in vs]}')
    return vs[0]


def load_frames(var):
    files = sorted((p for p in var.iterdir() if p.suffix.lower() == '.png' and p.is_file() and not p.is_symlink()), key=natural)
    if not files:
        raise SystemExit(f'{var}: no PNG frames')
    frames = []
    for p in files:
        with Image.open(p, formats=['PNG']) as im:
            frames.append(im.convert('RGBA'))
    if len({f.size for f in frames}) != 1:
        raise SystemExit(f'{var}: frames differ in size')
    return frames


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def merge_colors(counts, limit):
    """Maps every color to a representative: a color joins the most common color already kept
    within `dist` of it. The distance grows until at most `limit` colors remain."""
    dist = MERGE_DIST
    order = sorted(counts, key=lambda c: (-counts[c], c))
    while True:
        reps = []
        to = {}
        for c in order:
            for r in reps:
                if sum((a - b) ** 2 for a, b in zip(c, r)) < dist * dist:
                    to[c] = r
                    break
            else:
                reps.append(c)
                to[c] = c
        if len(reps) <= limit:
            return reps, to
        dist *= 1.25


def build(fx, root):
    var = small_variant(root, fx.folder)
    frames = load_frames(var)
    total = len(frames)
    frames = frames[:: fx.step]
    W, H = frames[0].size
    # Quantized pixels: (r, g, b) or None for transparent.
    grids = []
    for f in frames:
        data = f.tobytes()
        grids.append([tuple(data[i:i + 3]) if data[i + 3] >= ALPHA_MIN else None for i in range(0, W * H * 4, 4)])
    x0, y0, x1, y1 = W, H, -1, -1
    counts = {}
    for g in grids:
        for i, c in enumerate(g):
            if c is None:
                continue
            x, y = i % W, i // W
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            counts[c] = counts.get(c, 0) + 1
    if x1 < 0:
        raise SystemExit(f'{fx.folder}: no opaque pixels')
    x1 += 1
    y1 += 1
    reps, to = merge_colors(counts, len(KEYS))
    pal = sorted(reps, key=lambda c: (lum(c), c))
    key = {c: KEYS[pal.index(r)] for c, r in to.items()}
    unique = {}
    frames_out = []
    order = []
    for g in grids:
        rows = tuple(
            ''.join('.' if g[y * W + x] is None else key[g[y * W + x]] for x in range(x0, x1))
            for y in range(y0, y1)
        )
        if rows not in unique:
            unique[rows] = len(frames_out)
            frames_out.append(rows)
        order.append(unique[rows])
    w, h = x1 - x0, y1 - y0
    anchor = (min(max(W // 2 - x0, 0), w - 1), min(max(H // 2 - y0, 0), h - 1))
    return {
        'fx': fx,
        'variant': var.name,
        'native': (W, H),
        'total': total,
        'w': w,
        'h': h,
        'anchor': anchor,
        'pal': ['#%02x%02x%02x' % c for c in pal],
        'colors_in': len(counts),
        'frames': frames_out,
        'order': order,
    }


def emit(sheets):
    names = [s['fx'].name for s in sheets]
    out = [
        '// Generated by tools/packs/fx.py from the Super Pixel Effects Gigapack (free version). Do not edit by hand.',
        '// Art: "Pixel Art Assets - Will Tice / unTied Games" (credit it in the game; do not redistribute it on its own).',
        "import type { SheetEntry } from '../pixel/buf';",
        "import { frameBuf, type AnimSheet, type IndexedRows } from '../pixel/indexed';",
        '',
        'export type FxName = ' + ' | '.join(f"'{n}'" for n in names) + ';',
        '',
        '/**',
        ' * Frames are stored as one template string each, a row per line, without the transparent pixels at',
        ' * the end of each row (plain row arrays would make this file 2.6 times bigger). This restores the',
        ' * full rows.',
        ' */',
        'function rows(w: number, h: number, frame: string): IndexedRows {',
        "  const r = frame.split('\\n').slice(1, -1);",
        '  if (r.length !== h) throw new Error(`fx frame has ${r.length} rows, expected ${h}`);',
        "  return r.map((row) => row.padEnd(w, '.'));",
        '}',
        '',
        "function fx(s: Omit<AnimSheet, 'frames'> & { frames: readonly string[] }): AnimSheet {",
        '  return { ...s, frames: s.frames.map((f) => rows(s.w, s.h, f)) };',
        '}',
        '',
        '/**',
        ' * Battle effects, drawn 1:1 in art pixels. Each sheet has one animation, `play`; the anchor is the',
        " * effect's center (where it starts). Directional effects (hit, slash) burst to the right.",
        ' */',
        'export const FX_SHEETS: Readonly<Record<FxName, AnimSheet>> = {',
    ]
    for s in sheets:
        fx = s['fx']
        cat, eff = fx.folder.split('/', 1) if '/' in fx.folder else ('Mini Pack 1', fx.folder[5:])
        kept = len(s['order'])
        frames_note = f'{kept} frames' if kept == s['total'] else f'{kept} of {s["total"]} frames (every {fx.step})'
        out.append('  /**')
        out.append(f'   * {cat}/{eff} ({s["variant"]}): {frames_note}, {s["w"]} x {s["h"]}.')
        out.extend(f'   * {line}' for line in textwrap.wrap(fx.note, 100))
        out.append('   */')
        out.append(f'  {fx.name}: fx({{')
        out.append(f'    w: {s["w"]},')
        out.append(f'    h: {s["h"]},')
        out.append(f'    anchor: {{ x: {s["anchor"][0]}, y: {s["anchor"][1]} }},')
        out.append("    faces: 'right',")
        out.append('    pal: [' + ', '.join(f"'{c}'" for c in s['pal']) + '],')
        out.append(
            f"    anims: {{ play: {{ fps: {fx.fps}, loop: {'true' if fx.loop else 'false'}, frames: [{', '.join(map(str, s['order']))}] }} }},"
        )
        out.append('    frames: [')
        for rows in s['frames']:
            out.append('`')
            out.extend(r.rstrip('.') for r in rows)
            out.append('`,')
        out.append('    ],')
        out.append('  }),')
    out += [
        '};',
        '',
        '/** The first frame of every effect, for tools/pixelSheet.ts. */',
        'export function sheet(): SheetEntry[] {',
        '  return (Object.keys(FX_SHEETS) as FxName[]).map((name) => ({ name, buf: frameBuf(FX_SHEETS[name], FX_SHEETS[name].anims.play.frames[0]) }));',
        '}',
        '',
    ]
    return '\n'.join(out)


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    root, mini, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])

    class Root(type(root)):
        pass

    root = Root(root)
    root.mini = mini
    sheets = [build(fx, root) for fx in EFFECTS]
    src = emit(sheets)
    out.write_text(src)
    for s in sheets:
        fx = s['fx']
        print(
            f"{fx.name:10s} {fx.folder:42s} {len(s['order']):2d}/{s['total']:2d} frames  {s['w']:2d} x {s['h']:2d}"
            f"  {len(s['pal']):2d} colors (from {s['colors_in']})  {fx.fps} fps{' loop' if fx.loop else ''}"
        )
    print(f'{out}: {len(src.encode())} bytes')


if __name__ == '__main__':
    main()
