"""
PixelForge characters and monsters for the game. Reads finished PixelForge exports (out/<name>/ in a
pixelforge checkout, after `pf build --all`) and writes, for each sheet the game uses:

  src/assets/pf/<name>.png   the frames the game plays, each distinct frame once, as an indexed PNG
  src/assets/pf/<name>.json  the animations (frames and durations per direction s/e/n/w, loops,
                             phases, events), the pivot, and every palette color with the material
                             and shade it belongs to, so the game can recolor (rarity, mutation,
                             biome) by swapping material ramps

    python3 -I tools/packs/pixelforge.py <pixelforge repo> [out dir]

Pixels are copied 1:1: nothing is scaled, rotated or flipped. West frames are PixelForge's own
(mirrored at its build time), never made here. Color ownership comes from style/style.json and each
recipe's `colors`; a hex two materials share goes to the one listed first in OWNER_ORDER that the
recipe sets (the Guardian's helmet hides the eyes that share its cloth color, say). Humanoid
knights also get the rig's anchors (head, chin, back, hip) per frame, for the game's capes.
Only PNG, JSON and YAML files are read from the checkout, as data; nothing in it is executed.
"""
import json
import os
import sys

import yaml
from PIL import Image

# Sheet -> the animations the game plays (aliases the game never asks for are left out).
SHEETS = {
    'rk_guardian': ['idle', 'blink', 'walk', 'combat_idle', 'attack_slash', 'attack_heavy', 'block_enter', 'block_hold', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_blade': ['idle', 'blink', 'walk', 'combat_idle', 'attack_slash', 'attack_heavy', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_ranger': ['idle', 'blink', 'walk', 'combat_idle', 'shoot_bow', 'backflip', 'hurt', 'stun', 'death', 'victory'],
    'rk_cleric': ['idle', 'blink', 'walk', 'combat_idle', 'cast', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_arcanist': ['idle', 'blink', 'walk', 'combat_idle', 'cast', 'dodge', 'hurt', 'stun', 'death', 'victory'],
    'rk_lancer': ['idle', 'blink', 'walk', 'combat_idle', 'attack_slash', 'vault', 'hurt', 'stun', 'death', 'victory'],
    'slime': ['idle', 'move', 'attack_slam', 'attack_spit', 'hurt', 'death'],
    'bat': ['idle', 'attack_swoop', 'hurt', 'death'],
    'wolf': ['idle', 'walk', 'run', 'attack_bite', 'hurt', 'death'],
    'goblin': ['idle', 'walk', 'attack_slash', 'hurt', 'death'],
    'goblin_archer': ['idle', 'walk', 'shoot_bow', 'hurt', 'death'],
    'goblin_chief': ['idle', 'walk', 'attack_slash', 'hurt', 'death'],
    'orc': ['idle', 'walk', 'combat_idle', 'attack_slash', 'attack_heavy', 'hurt', 'stun', 'death'],
    'skeleton': ['idle', 'walk', 'combat_idle', 'attack_slash', 'hurt', 'stun', 'death_crumble'],
    'ogre': ['idle', 'walk', 'attack_heavy', 'hurt', 'death'],
    'stone_warden': ['idle', 'walk', 'attack_slam', 'cast_ring', 'attack_fan', 'charge', 'summon', 'stomp', 'enrage', 'hurt', 'death'],
}

# Recipes that are pure palette swaps of a sheet above are made in the game (frost_wolf from wolf,
# stone_warden_enraged from stone_warden), so they ship no pixels of their own.

# FX (out/fx/<name>/, after `pf fx build --all`), written as fx_<name>: the mobs' death poofs, the
# skeleton's crumble, the stun stars, the Stone Warden's thrown shards.
FX = {
    'poof_smoke': ['play'],
    'bone_crumble': ['play'],
    'status_stun': ['loop'],
    'rock_shard': ['travel'],
}

KNIGHT_ANCHORS = ('chin', 'back', 'hip')
OWNER_ORDER = ['metal', 'cloth', 'leather', 'accent', 'skin', 'hair', 'hide', 'fur', 'slime', 'slime_highlight', 'stone', 'bone',
               'membrane', 'horn', 'scales', 'chitin', 'eyes']
DIRS = ('s', 'e', 'n', 'w')
COLS = 16


def hexs(px):
    return '#%02x%02x%02x' % px[:3]


def pixels(img):
    """The image's pixels, row by row (Pillow 12 renamed getdata)."""
    return list(img.get_flattened_data() if hasattr(img, 'get_flattened_data') else img.getdata())


def recipe_path(repo, name):
    for root, _dirs, files in os.walk(os.path.join(repo, 'characters')):
        if f'{name}.yaml' in files:
            return os.path.join(root, f'{name}.yaml')
    raise SystemExit(f'no recipe for {name}')


def owners_for(style, recipe):
    """hex -> (material, shade) for the colors this recipe can paint."""
    colors = recipe.get('colors', {}) or {}
    found = {}
    for mat, spec in style['materials'].items():
        if not isinstance(spec, dict) or 'base' not in spec:
            continue
        preset = colors.get(mat)
        ramp = spec['presets'][preset] if preset else spec['base']
        for shade, h in enumerate(ramp):
            found.setdefault(h.lower(), []).append((mat, shade, preset is not None))
    out = {}
    rank = {m: i for i, m in enumerate(OWNER_ORDER)}
    for h, cands in found.items():
        cands.sort(key=lambda c: (not c[2], rank.get(c[0], 99)))
        out[h] = (cands[0][0], cands[0][1])
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    repo = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'src/assets/pf'
    os.makedirs(out_dir, exist_ok=True)
    style = json.load(open(os.path.join(repo, 'style', 'style.json')))
    outline = style['outline']['color'].lower()
    rig_anchors = json.load(open(os.path.join(repo, 'parts', 'body', 'humanoid', 'anchors.json')))
    total = 0
    jobs = [(n, a, os.path.join(repo, 'out', n), n, False) for n, a in SHEETS.items()]
    jobs += [(n, a, os.path.join(repo, 'out', 'fx', n), f'fx_{n}', True) for n, a in FX.items()]
    for name, anims, src, out_name, is_fx in jobs:
        meta = json.load(open(os.path.join(src, f'{name}.json')))
        sheet = Image.open(os.path.join(src, f'{name}.png')).convert('RGBA')
        owner = {} if is_fx else owners_for(style, yaml.safe_load(open(recipe_path(repo, name))))
        pf = meta['meta']['pixelforge']
        tags = {t['name']: t for t in meta['meta']['frameTags']}
        cell = meta['frames'][0]['sourceSize']['w']

        cells = []  # distinct frames, as RGBA images
        seen = {}
        colors = {}  # (hex, alpha) -> index

        def cell_index(img):
            key = img.tobytes()
            if key not in seen:
                seen[key] = len(cells)
                cells.append(img)
                for px in pixels(img):
                    if px[3] and (hexs(px), px[3]) not in colors:
                        colors[(hexs(px), px[3])] = None
            return seen[key]

        out_anims = {}
        anchors = {}  # distinct frame -> [chin x, y, back x, y, hip x, y] (knights)
        is_knight = name.startswith('rk_')
        for anim in anims:
            entry = {'loop': bool(pf['loop'].get(anim, False)), 'dirs': {}}
            if is_fx:
                # An FX's pivot is per tag (the point it plays on).
                entry['pivots'] = {d: pf['pivot'][f'{anim}_{d}'] for d in DIRS if f'{anim}_{d}' in pf['pivot']}
            for d in DIRS:
                tag = tags.get(f'{anim}_{d}')
                if not tag:
                    continue
                frames = []
                for i in range(tag['from'], tag['to'] + 1):
                    f = meta['frames'][i]
                    r = f['frame']
                    img = sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
                    frames.append([cell_index(img), f['duration']])
                entry['dirs'][d] = frames
                if is_knight:
                    rig = rig_anchors.get('idle' if anim == 'blink' else anim, {})
                    pts = rig.get('e' if d == 'w' else d) or []
                    for (k, _ms), p in zip(frames, pts):
                        flat = []
                        for a in KNIGHT_ANCHORS:
                            flat += [30 - p[a][0] if d == 'w' else p[a][0], p[a][1]]
                        anchors.setdefault(k, flat)
            if not entry['dirs']:
                raise SystemExit(f'{name}: no {anim}')
            e_tag = f'{anim}_e' if f'{anim}_e' in tags else next(f'{anim}_{d}' for d in DIRS if f'{anim}_{d}' in tags)
            phases = pf.get('phases', {}).get(e_tag)
            if phases and any(phases):
                entry['phases'] = ''.join((p or '-')[0] for p in phases)
            events = []
            for ev in pf.get('events', {}).get(e_tag, []):
                if ev['type'] in ('windup', 'hit', 'spawn', 'vfx', 'recover', 'summon', 'footstep'):
                    item = [ev['frame'], ev['type']]
                    if ev.get('fx'):
                        item.append(ev['fx'])
                    events.append(item)
            if events:
                entry['events'] = events
            lf = pf.get('loop_frames', {}).get(e_tag)
            if lf:
                entry['loopFrames'] = lf
            stride = pf.get('stride_px', {}).get(e_tag)
            if stride:
                entry['stride'] = stride
            out_anims[anim] = entry

        # The palette: transparent first, then each color with its material and shade.
        table = []
        for (h, a) in colors:
            if is_fx:
                mat, shade = 'fx', 0
            elif a < 255:
                mat, shade = 'shadow', 0
            elif h == outline:
                mat, shade = 'outline', 0
            elif h in owner:
                mat, shade = owner[h]
            else:
                mat, shade = 'flash', 0
            table.append([h, a, mat, shade])
        rank = {m: i for i, m in enumerate(['outline', 'shadow', 'flash'] + OWNER_ORDER)}
        table.sort(key=lambda c: (rank.get(c[2], 99), c[2], c[3]))
        index = {(c[0], c[1]): i + 1 for i, c in enumerate(table)}
        if len(table) > 255:
            raise SystemExit(f'{name}: {len(table)} colors')

        rows = (len(cells) + COLS - 1) // COLS
        packed = Image.new('P', (COLS * cell, rows * cell), 0)
        flat = [0, 0, 0]
        for h, _a, _m, _s in table:
            flat += [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
        packed.putpalette(flat)
        tops = []
        for k, img in enumerate(cells):
            data = pixels(img)
            idx = Image.new('P', img.size, 0)
            idx.putdata([index[(hexs(px), px[3])] if px[3] else 0 for px in data])
            packed.paste(idx, ((k % COLS) * cell, (k // COLS) * cell))
            # The topmost solid row and the middle of it (halos sit above this).
            top, xs = None, []
            for y in range(img.size[1]):
                xs = [x for x in range(img.size[0]) if data[y * img.size[0] + x][3] == 255]
                if xs:
                    top = y
                    break
            tops.append([top if top is not None else -1, (min(xs) + max(xs)) // 2 if xs else -1])
        alpha = bytes([0] + [a for _h, a, _m, _s in table])
        png_path = os.path.join(out_dir, f'{out_name}.png')
        packed.save(png_path, optimize=True, transparency=alpha)

        doc = {
            'name': out_name,
            'cell': cell,
            'pivot': next(iter(pf['pivot'].values())) if is_fx else pf['pivot'],
            'cols': COLS,
            'count': len(cells),
            'colors': table,
            'tops': tops,
            'anims': out_anims,
        }
        if anchors:
            doc['anchors'] = [anchors.get(k) for k in range(len(cells))]
        with open(os.path.join(out_dir, f'{out_name}.json'), 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        size = os.path.getsize(png_path)
        total += size
        print(f'{out_name}: {len(cells)} frames, {len(table)} colors, {size // 1024} KB')
    print(f'total {total // 1024} KB of PNG')


if __name__ == '__main__':
    main()
