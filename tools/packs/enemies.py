"""
The undead of the dark biomes and the slime, from two supplied packs, as sheets in the PixelForge
format the game already plays (src/render/pf/sheet.ts), so they recolor, flash, cast their light
range and play by the sim exactly like the PixelForge monsters:

  Enemy Animations Set   skeleton1 (sword), skeleton2 (scythe) and the robed vampire: idle,
                         movement, attack (with their own slash smears), take_damage, death
  DungeonAssets/Pack     Slime-Sheet.png: the green slime with a face (idle, hit, death)

    python3 -I tools/packs/enemies.py <Enemy_Animations_Set dir> <DungeonAssets/Pack dir> [out dir]

writes, for each monster, out/<name>.png (each distinct frame once, cells in a grid) and
out/<name>.json (animations per facing, the pivot, every palette color with its material and
shade). The default out dir is src/assets/packs.

Pixels are copied 1:1, never scaled. The packs draw side views facing one way; the other facing is
the mirror image, made here (mirrored about the feet, so both facings share one pivot). Frames sit
in 48 px cells with the feet on the pivot (24, 40). A soft ground shadow is added under the
skeletons and the vampire (PixelForge style: the outline color at alpha 70); the slime keeps its
own. The slime has no move or attack: its hop and lunge are its idle frames lifted and shifted (the
shadow stays on the ground). Only PNG files are read from the packs, as data; nothing in them runs.
"""
import json
import os
import sys

from PIL import Image

CELL = 48
PIVOT = (24, 40)
COLS = 16
SHADOW = ('#3a263a', 70)


def hexs(p):
    return '#%02x%02x%02x' % tuple(p[:3])


def strip(path, size=32):
    """The frames of a horizontal strip (size x size each) as RGBA images."""
    im = Image.open(path).convert('RGBA')
    n = im.size[0] // size
    return [im.crop((i * size, 0, i * size + size, size)) for i in range(n)]


def grid(path, size, row, cols):
    im = Image.open(path).convert('RGBA')
    return [im.crop((c * size, row * size, c * size + size, row * size + size)) for c in cols]


class Monster:
    """One monster: its palette (hex -> material, shade, role), its frames and its animations."""

    def __init__(self, name, faces, colors, shadow_rx=0, alias=None):
        self.name = name
        self.faces = faces  # 'e' or 'w': the way the pack draws it
        self.colors = colors  # hex -> (material, shade, role or None)
        self.alias = alias or {}  # stray hex -> palette hex
        self.shadow_rx = shadow_rx
        self.pivot = None  # (x, y) in the pack's frames
        self.cells = []  # distinct 48 x 48 frames (RGBA)
        self.keys = {}  # frame bytes -> index
        self.anims = {}

    def set_pivot(self, frame):
        """The feet: the middle of the solid pixels in the frame's bottom two rows, on its bottom row."""
        px = frame.load()
        w, h = frame.size
        rows = [y for y in range(h) if any(px[x, y][3] >= 128 and px[x, y][3] == 255 for x in range(w))]
        bottom = max(rows)
        xs = [x for y in (bottom - 1, bottom) for x in range(w) if px[x, y][3] == 255]
        self.pivot = (round(sum(xs) / len(xs)), bottom)

    def cell(self, frame, facing, dx=0, dy=0, keep_shadow=True):
        """The frame placed in a cell facing `facing`, its pixels moved by (dx, dy) (shadow pixels stay put)."""
        src = frame.load()
        w, h = frame.size
        out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        dst = out.load()
        px0, py0 = self.pivot
        mirror = facing != self.faces
        # dx is toward where the monster faces in this cell.
        fwd = 1 if facing == 'e' else -1
        sh = []
        for y in range(h):
            for x in range(w):
                p = src[x, y]
                if p[3] == 0:
                    continue
                shadow = p[3] < 250
                if shadow and not keep_shadow:
                    continue
                if not shadow:
                    hx = hexs(p)
                    hx = self.alias.get(hx, hx)
                    if hx not in self.colors:
                        hx = self.nearest(hx)
                mx = (px0 - x) if mirror else (x - px0)
                ox = 0 if shadow else dx * fwd
                oy = 0 if shadow else dy
                cx = mx + ox + PIVOT[0]
                cy = y - py0 + oy + PIVOT[1]
                if not (0 <= cx < CELL and 0 <= cy < CELL):
                    raise SystemExit(f'{self.name}: a pixel falls outside the cell')
                if shadow:
                    sh.append((cx, cy))
                else:
                    r, g, b = int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)
                    dst[cx, cy] = (r, g, b, 255)
        for cx, cy in sh:
            if dst[cx, cy][3] == 0:
                dst[cx, cy] = (0x3a, 0x26, 0x3a, SHADOW[1])
        if self.shadow_rx:
            # A soft oval on the ground under the feet, behind the body.
            rx = self.shadow_rx
            for oy in (-1, 0, 1):
                half = rx if oy == 0 else rx - 2
                for ox in range(-half, half + 1):
                    x, y = PIVOT[0] + ox, PIVOT[1] + oy
                    if dst[x, y][3] == 0:
                        dst[x, y] = (0x3a, 0x26, 0x3a, SHADOW[1])
        return out

    def nearest(self, hx):
        """A stray color (a few anti-aliased pixels in some frames) becomes its nearest palette color."""
        rgb = [int(hx[i:i + 2], 16) for i in (1, 3, 5)]
        best = min(self.colors, key=lambda c: sum((int(c[i:i + 2], 16) - v) ** 2 for i, v in zip((1, 3, 5), rgb)))
        if hx not in self.alias:
            print(f'  {self.name}: stray {hx} -> {best}')
        self.alias[hx] = best
        return best

    def add(self, img):
        key = img.tobytes()
        if key not in self.keys:
            self.keys[key] = len(self.cells)
            self.cells.append(img)
        return self.keys[key]

    def anim(self, name, frames, ms, loop, strike=None, phases=None):
        """`frames`: a list of (image, dx, dy) in the pack's facing; `ms`: one duration or one per frame."""
        if isinstance(ms, int):
            ms = [ms] * len(frames)
        dirs = {}
        for d in ('e', 'w'):
            dirs[d] = [[self.add(self.cell(f, d, dx, dy)), t] for (f, dx, dy), t in zip(frames, ms)]
        a = {'loop': loop, 'dirs': dirs}
        if strike is not None:
            a['events'] = [[0, 'windup'], [strike, 'hit'], [min(strike + 1, len(frames) - 1), 'recover']]
            a['phases'] = phases or ('w' * strike + 'a' + 'r' * (len(frames) - strike - 1))
        self.anims[name] = a

    def write(self, out_dir):
        order = sorted(self.colors.items(), key=lambda kv: (kv[1][0] != 'outline', kv[1][0], kv[1][1]))
        palette = []
        for hx, (mat, shade, role) in order:
            e = [hx, 255, mat, shade]
            if role:
                e.append(role)
            palette.append(e)
        palette.insert(1, [SHADOW[0], SHADOW[1], 'shadow', 0])
        n = len(self.cells)
        rows = (n + COLS - 1) // COLS
        sheet = Image.new('RGBA', (COLS * CELL, rows * CELL), (0, 0, 0, 0))
        tops = []
        for i, c in enumerate(self.cells):
            sheet.paste(c, ((i % COLS) * CELL, (i // COLS) * CELL))
            px = c.load()
            solid = [(x, y) for y in range(CELL) for x in range(CELL) if px[x, y][3] == 255]
            if solid:
                top = min(y for _, y in solid)
                xs = [x for x, y in solid if y == top]
                tops.append([top, round(sum(xs) / len(xs))])
            else:
                tops.append([-1, -1])
        meta = {
            'name': self.name,
            'source': 'tools/packs/enemies.py',
            'cell': CELL,
            'pivot': list(PIVOT),
            'cols': COLS,
            'count': n,
            'dirs': ['e', 'w'],
            'colors': palette,
            'tops': tops,
            'anims': self.anims,
        }
        os.makedirs(out_dir, exist_ok=True)
        sheet.save(os.path.join(out_dir, f'{self.name}.png'), optimize=True)
        with open(os.path.join(out_dir, f'{self.name}.json'), 'w') as f:
            json.dump(meta, f, separators=(',', ':'))
        print(f'{self.name}: {n} frames, pivot in the pack {self.pivot}, anims {", ".join(f"{k} {len(v["dirs"]["e"])}" for k, v in self.anims.items())}')


def frames(fs, sel=None):
    return [(fs[i], 0, 0) for i in (sel if sel is not None else range(len(fs)))]


def skeleton(name, base, files, colors, attack_sel, strike, death_hold=520):
    m = Monster(name, 'e', colors, shadow_rx=5)
    idle = strip(os.path.join(base, files['idle']))
    m.set_pivot(idle[0])
    m.anim('idle', frames(idle), 140, True)
    m.anim('walk', frames(strip(os.path.join(base, files['move']))), 90, True)
    att = strip(os.path.join(base, files['attack']))
    sel = attack_sel or list(range(len(att)))
    ms = [60] * strike + [90] + [90] * (len(sel) - strike - 2) + [130]
    m.anim('attack', frames(att, sel), ms, False, strike=strike)
    m.anim('hurt', frames(strip(os.path.join(base, files['hurt']))), [60, 70, 70, 70, 60], False)
    death = strip(os.path.join(base, files['death']))
    m.anim('death', frames(death), [70] * (len(death) - 1) + [death_hold], False)
    return m


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    enemies, pack2 = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else 'src/assets/packs'
    bone = {'#25131a': ('outline', 0, 'line'), '#676057': ('bone', 0, None), '#b3b2a1': ('bone', 1, None), '#e6e6e6': ('bone', 2, None),
            '#6d758d': ('metal', 0, None), '#b3b9d1': ('metal', 1, None), '#dae0ea': ('metal', 2, None), '#9b534a': ('cloth', 0, None)}
    files1 = {'idle': 'enemies-skeleton1_idle.png', 'move': 'enemies-skeleton1_movement.png', 'attack': 'enemies-skeleton1_attack.png',
              'hurt': 'enemies-skeleton1_take_damage.png', 'death': 'enemies-skeleton1_death.png'}
    # The sword: six frames of windup, the crescent lands on the seventh, then the follow-through.
    skeleton('pk_skeleton', enemies, files1, bone, None, 6).write(out)
    files2 = {'idle': 'enemies-skeleton2_idle.png', 'move': 'enemies-skeleton2_movemen.png', 'attack': 'enemies-skeleton2_attack.png',
              'hurt': 'enemies-skeleton2_take_damage.png', 'death': 'enemies-skeleton2_death.png'}
    scythe = dict(bone, **{'#4b3726': ('wood', 0, None), '#79593f': ('wood', 1, None), '#b19d83': ('wood', 2, None)})
    # The scythe: one sweep per attack (the pack's second sweep, frames 8 to 13, is left out): five
    # frames of windup, the sweep lands on the sixth, its tail and sparks, then the recovery pose.
    skeleton('pk_reaper', enemies, files2, scythe, [0, 1, 2, 3, 4, 5, 6, 7, 14], 5).write(out)

    # The vampire: its long cloak-spreading windup thinned to six frames (the game's telegraph is
    # a third of a second), the claw smear lands on the seventh, then the lunge and the recovery.
    vamp = Monster('pk_vampire', 'e', {
        '#25131a': ('outline', 0, 'line'), '#3e4652': ('skin', 0, None), '#6d758d': ('skin', 1, None), '#989eb3': ('skin', 2, None),
        '#5e4e3a': ('robe', 0, None), '#827860': ('robe', 1, None), '#79191d': ('eyes', 0, None), '#be2b25': ('eyes', 1, None),
        '#d9701a': ('gold', 0, None), '#ffed56': ('gold', 1, None), '#e6e6e6': ('fang', 1, None), '#b3b2a1': ('fang', 0, None),
    }, shadow_rx=6, alias={'#7f755d': '#827860', '#7c7159': '#827860', '#6c7183': '#6d758d'})
    idle = strip(os.path.join(enemies, 'enemies-vampire_idle.png'))
    vamp.set_pivot(idle[0])
    vamp.anim('idle', frames(idle), 150, True)
    vamp.anim('walk', frames(strip(os.path.join(enemies, 'enemies-vampire_movement.png'))), 100, True)
    att = strip(os.path.join(enemies, 'enemies-vampire_attack.png'))
    sel = [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 15]
    vamp.anim('attack', frames(att, sel), [60] * 6 + [90, 90, 90, 90, 130], False, strike=6)
    vamp.anim('hurt', frames(strip(os.path.join(enemies, 'enemies-vampire_take_damage.png'))), [60, 70, 70, 70, 60], False)
    death = strip(os.path.join(enemies, 'enemies-vampire_death.png'))
    vamp.anim('death', frames(death), [70] * (len(death) - 1) + [420], False)
    vamp.write(out)

    # The slime: idle (four frames), a hit (a white flash), and a death that melts it away. Its hop
    # and its lunge are made from the idle frames: the body lifts (and leans forward) while the
    # shadow stays on the ground.
    sheet = os.path.join(pack2, 'Slime-Sheet.png')
    idle = grid(sheet, 32, 0, range(4))
    hit = grid(sheet, 32, 1, range(9))
    gel = Monster('pk_slime', 'w', {
        '#313638': ('outline', 0, 'line'), '#374e4a': ('slime', 0, None), '#456657': ('slime', 1, None), '#547e64': ('slime', 2, None),
        '#92a984': ('slime', 3, None), '#b7c9be': ('slime_highlight', 0, None), '#d1dbcb': ('slime_highlight', 1, None),
        '#a9abac': ('gel_white', 0, None), '#abb5b3': ('gel_white', 1, None), '#b1bfb9': ('gel_white', 2, None),
    })
    gel.set_pivot(idle[0])
    gel.anim('idle', [(f, 0, 0) for f in idle], [200, 160, 200, 160], True)
    hop = [(idle[3], 0, 0), (idle[0], 0, -1), (idle[0], 1, -3), (idle[1], 1, -4), (idle[2], 0, -2), (idle[3], 0, 0)]
    gel.anim('move', hop, [90, 80, 80, 80, 80, 90], True)
    # Windup: it squats and leans back; the lunge (the hit); it slides back.
    lunge = [(idle[3], -1, 0), (idle[3], -2, 0), (idle[0], 4, -2), (idle[1], 2, -1), (idle[2], 0, 0)]
    gel.anim('attack', lunge, [120, 120, 90, 100, 130], False, strike=2)
    gel.anim('hurt', [(hit[1], 0, 0), (hit[0], 0, 0)], [90, 150], False)
    gel.anim('death', [(f, 0, 0) for f in hit[2:9]], [90, 90, 90, 90, 90, 90, 200], False)
    gel.write(out)


if __name__ == '__main__':
    main()
