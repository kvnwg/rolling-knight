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
recipe sets (the Guardian's helmet hides the eyes that share its cloth color, say). A part the
recipe dyes apart (`slot_colors`: the Blade's scarf, the Lancer's gold helm) is a second material of
its own, `<material>2` (cloth2, metal2), so a recolor can dye it apart too. The white swing trails
PixelForge paints on every strike (style fx_ramps.swing: rim, mid, core) are the material `trail`:
the monsters keep theirs (the game draws no swing of its own for them), while the knights come from
PixelForge's out/bare/ (tools/packs/pixelforge_bare.py: the same build with no trails), because the
game draws every knight's swing itself, aimed and dressed in its rarity; a trail of PixelForge's on
top would double it.
Humanoid knights also get the rig's anchors (head, chin, back, hip) per frame, for the game's capes.
Only PNG, JSON and YAML files are read from the checkout, as data; nothing in it is executed.
"""
import json
import os
import sys

import yaml
from PIL import Image

# Sheet -> the animations the game plays (aliases the game never asks for are left out).
SHEETS = {
    'rk_guardian': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'attack_slash', 'attack_heavy', 'block_enter', 'block_hold', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_blade': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'attack_slash', 'attack_heavy', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_ranger': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'shoot_bow', 'backflip', 'hurt', 'stun', 'death', 'victory'],
    'rk_cleric': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'cast', 'roll', 'hurt', 'stun', 'death', 'victory'],
    'rk_arcanist': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'cast', 'dodge', 'hurt', 'stun', 'death', 'victory'],
    'rk_lancer': ['idle', 'blink', 'walk', 'run', 'combat_idle', 'attack_slash', 'vault', 'hurt', 'stun', 'death', 'victory'],
    'slime': ['idle', 'move', 'attack_slam', 'attack_spit', 'hurt', 'death'],
    'bat': ['idle', 'attack_swoop', 'hurt', 'death'],
    'wolf': ['idle', 'combat_idle', 'walk', 'run', 'attack_bite', 'howl', 'hurt', 'death'],
    'goblin': ['idle', 'walk', 'combat_idle', 'attack_slash', 'hurt', 'death'],
    'goblin_archer': ['idle', 'walk', 'combat_idle', 'shoot_bow', 'hurt', 'death'],
    'goblin_chief': ['idle', 'walk', 'combat_idle', 'attack_slash', 'hurt', 'death'],
    'orc': ['idle', 'walk', 'run', 'combat_idle', 'attack_slash', 'attack_heavy', 'hurt', 'stun', 'death'],
    'skeleton': ['idle', 'walk', 'run', 'combat_idle', 'attack_slash', 'hurt', 'stun', 'death_crumble'],
    'ogre': ['idle', 'walk', 'combat_idle', 'attack_heavy', 'roar', 'hurt', 'death'],
    'stone_warden': ['idle', 'walk', 'combat_idle', 'attack_slam', 'cast_ring', 'attack_fan', 'charge', 'summon', 'stomp', 'enrage', 'hurt', 'death'],
    # The dark knight boss: a two-hit slash, a looping charge, a leaping slam, a ring and a fan of
    # blood crescents. Enraged, his plate cracks open on embers (a part of its own: a sheet of its own).
    'rook': ['idle', 'walk', 'combat_idle', 'attack_slash', 'charge', 'attack_slam', 'attack_ring', 'attack_fan', 'enrage', 'hurt', 'death'],
    'rook_enraged': ['idle', 'walk', 'combat_idle', 'attack_slash', 'charge', 'attack_slam', 'attack_ring', 'attack_fan', 'enrage', 'hurt', 'death'],
    'ashen_duelist': ['idle', 'walk', 'combat_idle', 'attack_slash', 'attack_lunge', 'hurt', 'death'],
}

# Recipes that are pure palette swaps of a sheet above are made in the game (frost_wolf from wolf,
# stone_warden_enraged from stone_warden), so they ship no pixels of their own. The Cinderwyrm is the
# game's own (tools/wyrm draws it), so PixelForge's is never imported.

# FX (out/fx/<name>/, after `pf fx build --all`), written as fx_<name>: the mobs' death poofs, the
# skeleton's crumble, the stun stars, the Stone Warden's thrown shards, the Cinderwyrm's fireballs,
# the rings of a wolf's howl, Rook's blood crescents.
FX = {
    'poof_smoke': ['play'],
    'bone_crumble': ['play'],
    'status_stun': ['loop'],
    'rock_shard': ['travel'],
    'fireball': ['travel'],
    'howl_rings': ['play'],
    'blood_crescent': ['travel'],
}

KNIGHT_ANCHORS = ('chin', 'back', 'hip')
OWNER_ORDER = ['metal', 'cloth', 'leather', 'accent', 'skin', 'hair', 'hide', 'fur', 'slime', 'slime_highlight', 'stone', 'bone',
               'membrane', 'horn', 'scales', 'leaf', 'fruit', 'chitin', 'eyes']
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


def part_material(repo, slot, variant):
    """The material a part is drawn in (parts/<slot>/<variant>/part.yaml)."""
    path = os.path.join(repo, 'parts', slot, variant, 'part.yaml')
    return (yaml.safe_load(open(path)) or {}).get('material') if os.path.isfile(path) else None


def owners_for(repo, style, recipe):
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
    # A part dyed apart (slot_colors) is a second material of its kind, ahead of the rest: cloth2
    # for a scarf or a cloak in another dye, metal2 for a helm in another metal (a third, cloth3...).
    seconds = {}
    for slot, preset in sorted((recipe.get('slot_colors') or {}).items()):
        mat = part_material(repo, slot, (recipe.get('parts') or {}).get(slot, ''))
        if not mat or preset == colors.get(mat):
            continue
        key = (mat, preset)
        if key not in seconds:
            seconds[key] = f'{mat}{2 + sum(1 for m, _p in seconds if m == mat)}'
        for shade, h in enumerate(style['materials'][mat]['presets'][preset]):
            found.setdefault(h.lower(), []).insert(0, (seconds[key], shade, True))
    out = {}
    rank = {m: i for i, m in enumerate(OWNER_ORDER)}
    for h, cands in found.items():
        # Set by the recipe first, a part dyed apart before its material, then OWNER_ORDER.
        cands.sort(key=lambda c: (not c[2], not c[0][-1:].isdigit(), rank.get(c[0], 99)))
        out[h] = (cands[0][0], cands[0][1])
    # The swing trails: rim, mid and the white core (or the ramp the recipe names: Rook's are blood).
    for shade, h in enumerate(style['fx_ramps'][recipe.get('trail') or 'swing']):
        out.setdefault(h.lower(), ('trail', shade))
    return out


def check_bare(repo, style, name):
    """The knight's trail-free build is there and is the full build's frames, timing and pixels but
    for its swing trails (else it's stale: run tools/packs/pixelforge_bare.py again)."""
    full_dir = os.path.join(repo, 'out', name)
    bare_dir = os.path.join(repo, 'out', 'bare', name)
    if not os.path.isfile(os.path.join(bare_dir, f'{name}.json')):
        raise SystemExit(f'{name}: no {bare_dir}; run tools/packs/pixelforge_bare.py with PixelForge\'s Python first')
    full = json.load(open(os.path.join(full_dir, f'{name}.json')))
    bare = json.load(open(os.path.join(bare_dir, f'{name}.json')))
    same = full['meta']['frameTags'] == bare['meta']['frameTags'] and [f['duration'] for f in full['frames']] == [f['duration'] for f in bare['frames']]
    if same:
        swing = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in style['fx_ramps']['swing']}
        a = Image.open(os.path.join(full_dir, f'{name}.png')).convert('RGBA')
        b = Image.open(os.path.join(bare_dir, f'{name}.png')).convert('RGBA')
        for ff, bf in zip(full['frames'], bare['frames']):
            fa = pixels(a.crop((ff['frame']['x'], ff['frame']['y'], ff['frame']['x'] + ff['frame']['w'], ff['frame']['y'] + ff['frame']['h'])))
            fb = pixels(b.crop((bf['frame']['x'], bf['frame']['y'], bf['frame']['x'] + bf['frame']['w'], bf['frame']['y'] + bf['frame']['h'])))
            if any(p != q and not (p[3] == 255 and p[:3] in swing) for p, q in zip(fa, fb)):
                same = False
                break
    if not same:
        raise SystemExit(f'{name}: {bare_dir} is not this build without its trails; run tools/packs/pixelforge_bare.py again')


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
    jobs = [(n, a, os.path.join(repo, 'out', 'bare' if n.startswith('rk_') else '', n), n, False) for n, a in SHEETS.items()]
    jobs += [(n, a, os.path.join(repo, 'out', 'fx', n), f'fx_{n}', True) for n, a in FX.items()]
    for name, anims, src, out_name, is_fx in jobs:
        if name.startswith('rk_'):
            check_bare(repo, style, name)
        meta = json.load(open(os.path.join(src, f'{name}.json')))
        sheet = Image.open(os.path.join(src, f'{name}.png')).convert('RGBA')
        recipe = {} if is_fx else yaml.safe_load(open(recipe_path(repo, name)))
        owner = {} if is_fx else owners_for(repo, style, recipe)
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
        stray = []
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
                if h != style['effects']['flash'].lower():
                    stray.append(h)
            table.append([h, a, mat, shade])
        if stray:
            print(f'{name}: colors no material owns (kept as drawn): {" ".join(stray)}')
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
        if is_knight and (recipe.get('parts') or {}).get('cape', 'none') != 'none':
            # A knight in a cloak of its own design: the game hangs no cape of its own on it.
            doc['cloak'] = True
        with open(os.path.join(out_dir, f'{out_name}.json'), 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        size = os.path.getsize(png_path)
        total += size
        print(f'{out_name}: {len(cells)} frames, {len(table)} colors, {size // 1024} KB')
    print(f'total {total // 1024} KB of PNG')


if __name__ == '__main__':
    main()
