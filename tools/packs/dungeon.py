"""
The Dungeon biome's art, from three supplied packs, as indexed pixel art (src/render/pixel/indexed.ts)
in one generated module, src/render/packs/dungeonArt.ts:

  2D Pixel Dungeon Asset Pack v2.0   the purple-brown stone tileset (16 px: thin walls, a brick
                                     face on the north walls, cracked flagstones, doors) and its
                                     animated items and traps (torches, candlesticks, the red
                                     banner, chests, boxes, flasks, coins, keys, the spikes)
  DungeonAssets/Pack                 the blue-stone tileset (thick caps, a blue brick face, a
                                     cobbled rim round the floor, two doors) and its objects
                                     (barrel, pots, a cabinet, candles, swords)
  free-pixel-art-dungeon-objects     (Craftpix) the fire vent, the saw on its track, the flip
                                     plate with spikes under it, banners, skulls, armor, pedestals

    python3 -I tools/packs/dungeon.py <2D Pixel Dungeon Asset Pack dir> <DungeonAssets/Pack dir> \\
        <Craftpix PNG dir> src/render/packs/dungeonArt.ts

Pixels are copied 1:1 (one pack pixel = one art pixel, never scaled). Alpha is quantized: pixels
under 128 are dropped (soft shadows and the fire's faint halo; the game bakes its own shadows and
lights fires itself), the rest become opaque. Tiles keep their 16 px grid; sprites are cut to the
union of their frames' pixels. A few things are cleaned so they sit on any floor: the floor tiles'
edge shading is taken off (the game draws it where a wall really is), the spikes lose the floor
they were drawn on, and the saw loses the slot it was drawn in (the game draws its track). Only PNG
files are read from the packs, as data; nothing in them runs.
"""
import os
import sys

from PIL import Image

KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~'
ALPHA_MIN = 128


def load(path):
    return Image.open(path).convert('RGBA')


def win(im, x, y, w, h):
    return im.crop((x, y, x + w, y + h))


def quant(im):
    """Alpha to 0 or 255."""
    out = im.copy()
    px = out.load()
    for y in range(out.size[1]):
        for x in range(out.size[0]):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= ALPHA_MIN else (0, 0, 0, 0)
    return out


def hexs(p):
    return '#%02x%02x%02x' % p[:3]


def knock(im, colors):
    """Makes these colors transparent."""
    out = im.copy()
    px = out.load()
    for y in range(out.size[1]):
        for x in range(out.size[0]):
            if px[x, y][3] and hexs(px[x, y]) in colors:
                px[x, y] = (0, 0, 0, 0)
    return out


def bbox(frames):
    box = None
    for f in frames:
        b = f.getchannel('A').getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


class Palette:
    def __init__(self):
        self.colors = []

    def key(self, hx):
        if hx not in self.colors:
            self.colors.append(hx)
            if len(self.colors) > len(KEYS):
                raise SystemExit('palette too big')
        return KEYS[self.colors.index(hx)]

    def rows(self, im):
        px = im.load()
        out = []
        for y in range(im.size[1]):
            out.append(''.join('.' if px[x, y][3] == 0 else self.key(hexs(px[x, y])) for x in range(im.size[0])))
        return out


def ts_rows(rows, indent):
    pad = ' ' * indent
    return '[\n' + ''.join(f"{pad}  '{r}',\n" for r in rows) + f'{pad}]'


# ------------------------------------------------------------------ tiles

def purple_tiles(p1):
    """The purple-brown tileset: floors (edge shading taken off), faces, rims, caps and corners."""
    ts = quant(load(os.path.join(p1, 'character and tileset', 'Dungeon_Tileset.png')))
    t = lambda c, r: win(ts, c * 16, r * 16, 16, 16)
    tiles = {}
    VOID, SHADE, FLOOR = '#25131a', '#362030', '#3d253b'
    floors = [(c, r) for r in (1, 2, 3) for c in (1, 2, 3, 4)] + [(c, 6) for c in (0, 1, 2, 3)]
    for i, (c, r) in enumerate(floors):
        im = t(c, r).copy()
        px = im.load()
        col = lambda x: [hexs(px[x, y]) for y in range(16)]
        row = lambda y: [hexs(px[x, y]) for x in range(16)]
        # The room's edge tiles carry a 2 px shadow line (dark, then shade) along their wall side.
        clear = []
        if all(h == VOID for h in row(0)):
            clear += [(x, y) for y in (0, 1) for x in range(16)]
        if all(h == VOID for h in row(15)):
            clear += [(x, y) for y in (14, 15) for x in range(16)]
        if all(h == VOID for h in col(0)):
            clear += [(x, y) for x in (0, 1) for y in range(16)]
        if all(h == VOID for h in col(15)):
            clear += [(x, y) for x in (14, 15) for y in range(16)]
        for x, y in clear:
            px[x, y] = (0x3d, 0x25, 0x3b, 255)
        tiles[f'floor{i}'] = im
    for i, c in enumerate((1, 2, 3, 4)):
        tiles[f'face{i}'] = t(c, 0)
        tiles[f'cap{i}'] = t(c, 4)
    for r in range(4):
        tiles[f'rimR{r}'] = t(0, r)  # void, the rim on its right (floor to the east)
        tiles[f'rimL{r}'] = t(5, r)  # the rim on its left (floor to the west)
    tiles['cornerNE'] = t(0, 4)  # floor only to the north-east: the rim ends in a cap stone
    tiles['cornerNW'] = t(5, 4)
    tiles['innerNW'] = t(0, 5)  # floor north and west: a south cap turning into a west rim
    tiles['innerNE'] = t(3, 5)
    tiles['cap4'] = t(1, 5)
    return tiles, {'void': VOID, 'shade': SHADE, 'floor': FLOOR}


def blue_tiles(p2):
    """The blue-stone tileset, cut from its room frame (DungeonWalls.png) and doors."""
    dw = quant(load(os.path.join(p2, 'DungeonWalls.png')))
    tiles = {}
    plain = {'#5b5076'}
    # The middle of the frame's walls (its ends carry the corners' outlines, the pillars sit at 40
    # and, in the south wall, at 64).
    for i, x in enumerate((64, 80)):
        tiles[f'face{i}'] = win(dw, x, 32, 16, 16)  # the brick face's lower half and its base
        tiles[f'faceTop{i}'] = win(dw, x, 16, 16, 16)  # the cap's end, the face's top in shade
        tiles[f'capTop{i}'] = win(dw, x, 0, 16, 16)  # the cap over a face two tiles tall
        tiles[f'capN{i}'] = win(dw, x, 6, 16, 16)  # the cap over a face one tile tall
        # The floor's rim (its plain floor taken out, so rims overlay each other on the floor).
        tiles[f'floorN{i}'] = knock(win(dw, x, 48, 16, 16), plain)  # under a face
    for i, x in enumerate((32, 48, 80)):
        tiles[f'capS{i}'] = win(dw, x, 136, 16, 16)  # a south wall's cap
        tiles[f'floorS{i}'] = knock(win(dw, x, 120, 16, 16), plain)  # over a south cap
    # The pillar in the north wall (face, its top, its cap).
    tiles['pillar'] = win(dw, 40, 32, 16, 16)
    tiles['pillarTop'] = win(dw, 40, 16, 16, 16)
    tiles['pillarCap'] = win(dw, 40, 0, 16, 16)
    for i, y in enumerate((64, 96, 112)):
        tiles[f'capW{i}'] = win(dw, 0, y, 16, 16)  # a west wall's cap (floor to its east)
        tiles[f'capE{i}'] = win(dw, 112, y, 16, 16)
        tiles[f'floorW{i}'] = knock(win(dw, 16, y, 16, 16), plain)  # the floor beside a west wall: shade and rim
        tiles[f'floorE{i}'] = knock(win(dw, 96, y, 16, 16), plain)
    tiles['floorNW'] = knock(win(dw, 16, 48, 16, 16), plain)
    tiles['floorNE'] = knock(win(dw, 96, 48, 16, 16), plain)
    tiles['floorSW'] = knock(win(dw, 16, 120, 16, 16), plain)
    tiles['floorSE'] = knock(win(dw, 96, 120, 16, 16), plain)
    tiles['cornerTL'] = win(dw, 0, 4, 16, 16)
    tiles['cornerTR'] = win(dw, 112, 4, 16, 16)
    tiles['cornerBL'] = win(dw, 0, 134, 16, 16)
    tiles['cornerBR'] = win(dw, 112, 134, 16, 16)
    tiles['pillarW'] = win(dw, 0, 80, 16, 16)
    tiles['pillarE'] = win(dw, 112, 80, 16, 16)
    gt = quant(load(os.path.join(p2, 'Ground Tiles.png')))
    # Cracks and a lost brick or two on the plain floor.
    for i, (x, y) in enumerate(((16, 96), (32, 104), (0, 112))):
        tiles[f'crack{i}'] = knock(win(gt, x, y, 16, 16), {'#5b5076', '#966c6c'})
    return tiles, {'void': '#1e1a21', 'floor': '#5b5076'}


# ------------------------------------------------------------------ sprites

class Sprite:
    def __init__(self, name, frames, fps=8, note='', crop=True):
        frames = [quant(f) for f in frames]
        if crop:
            b = bbox(frames)
            frames = [f.crop(b) for f in frames]
        self.name = name
        self.frames = frames
        self.fps = fps
        self.note = note

    def ts(self):
        pal = Palette()
        rows = [pal.rows(f) for f in self.frames]
        w, h = self.frames[0].size
        uniq = []
        index = []
        for r in rows:
            if r not in uniq:
                uniq.append(r)
            index.append(uniq.index(r))
        body = ''.join(f'      {ts_rows(r, 6)},\n' for r in uniq)
        return (
            f"  /** {self.note} */\n" if self.note else ''
        ) + (
            f"  {self.name}: {{\n    w: {w},\n    h: {h},\n    anchor: {{ x: {w // 2}, y: {h - 1} }},\n    faces: 'right',\n"
            f"    pal: [{', '.join(repr(c) for c in pal.colors)}],\n"
            f"    frames: [\n{body}    ],\n"
            f"    anims: {{ idle: {{ fps: {self.fps}, loop: true, frames: [{', '.join(map(str, index))}] }} }},\n  }},\n"
        )


def items(p1, name, n=4, sub=None):
    d = os.path.join(p1, 'items and trap_animation', sub or name)
    return [load(os.path.join(d, f'{name}_{i}.png')) for i in range(1, n + 1)]


def sprites(p1, p2, p4):
    out = []
    ts = load(os.path.join(p1, 'character and tileset', 'Dungeon_Tileset.png'))
    t = lambda c, r, w=1, h=1: win(ts, c * 16, r * 16, w * 16, h * 16)
    # --- pack 1: lights, banners, the things on the floor
    out.append(Sprite('torch', items(p1, 'torch', sub='torch'), 8, 'A torch on a wall, burning (pack 1; the whole tile, placed as the pack does).', crop=False))
    out.append(Sprite('sideTorch', items(p1, 'side_torch', sub='torch'), 8, 'A torch on a west wall, leaning out (pack 1; the whole tile).', crop=False))
    out.append(Sprite('candlestick', items(p1, 'candlestick_1', sub='torch'), 6, 'A candlestick, its flame flickering (pack 1).'))
    out.append(Sprite('candlestick2', items(p1, 'candlestick_2', sub='torch'), 6, 'A taller candlestick (pack 1).'))
    out.append(Sprite('flag', items(p1, 'flag'), 5, 'The red shield banner, stirring (pack 1; the whole tile).', crop=False))
    out.append(Sprite('chest', items(p1, 'chest')[:1], 1, 'A chest (pack 1).'))
    out.append(Sprite('miniChest', items(p1, 'mini_chest')[:1], 1, 'A small chest (pack 1).'))
    out.append(Sprite('box', items(p1, 'box_1')[:1], 1, 'A crate (pack 1).'))
    out.append(Sprite('box2', items(p1, 'box_2')[:1], 1, 'A dark crate (pack 1).'))
    out.append(Sprite('miniBox', items(p1, 'mini_box_1')[:1], 1, 'A small crate (pack 1).'))
    out.append(Sprite('miniBox2', items(p1, 'mini_box_2')[:1], 1, 'A small dark crate (pack 1).'))
    for k in range(1, 5):
        out.append(Sprite(f'flask{k}', items(p1, f'flasks_{k}', sub='flasks'), 5, f'A flask, bubbling (pack 1, flasks {k}).'))
    out.append(Sprite('coin', items(p1, 'coin'), 8, 'A coin, turning (pack 1).'))
    out.append(Sprite('door', [t(6, 3, 2)], 1, 'A double door in a north wall (pack 1).', crop=False))
    out.append(Sprite('archDoor', [t(6, 6, 2)], 1, 'An arched double door (pack 1).', crop=False))
    out.append(Sprite('rubble', [t(9, 4)], 1, 'Fallen bricks (pack 1).'))
    out.append(Sprite('rubbleSmall', [t(9, 5)], 1, 'A few fallen bricks (pack 1).'))
    out.append(Sprite('bones', [t(8, 6)], 1, 'Bones (pack 1).'))
    out.append(Sprite('skullBone', [t(7, 7)], 1, 'A skull and a bone (pack 1).'))
    out.append(Sprite('cobweb', [t(4, 6)], 1, 'A cobweb in a top-left corner (pack 1).', crop=False))
    out.append(Sprite('cobwebSmall', [t(5, 6)], 1, 'A small cobweb in a top-right corner (pack 1).', crop=False))
    out.append(Sprite('banner', [t(4, 7)], 1, 'The red shield banner, still (pack 1; the whole tile).', crop=False))
    out.append(Sprite('ring', [t(5, 7)], 1, 'An iron ring on a wall (pack 1; the whole tile).', crop=False))
    out.append(Sprite('hook', [t(6, 7)], 1, 'A hook on a wall (pack 1; the whole tile).', crop=False))
    # --- pack 2: its objects
    ob = load(os.path.join(p2, 'Objects.png'))
    for name, box, note in (
        ('barrel', (7, 6, 18, 22), 'A barrel (pack 2).'),
        ('sword', (36, 12, 26, 15), 'A sword lying on the floor (pack 2).'),
        ('pot', (74, 7, 14, 17), 'A clay pot (pack 2).'),
        ('cabinet', (103, 2, 18, 28), 'A tall cabinet (pack 2).'),
        ('pots', (4, 37, 26, 20), 'A big pot with two small ones (pack 2).'),
        ('candlesBlue', (40, 38, 18, 13), 'Candles in a blue holder (pack 2).'),
        ('candlesPurple', (72, 38, 18, 13), 'Candles in a purple holder (pack 2).'),
        ('candlesWhite', (104, 38, 18, 13), 'Candles in a white holder (pack 2).'),
        ('pots2', (66, 69, 26, 20), 'Pots (pack 2).'),
    ):
        out.append(Sprite(name, [win(ob, *box)], 1, note))
    doors = load(os.path.join(p2, 'Doors.png'))
    out.append(Sprite('blueDoor', [win(doors, 0, 2, 32, 46)], 1, 'A wooden door in a blue wall, with its cap (pack 2).', crop=False))
    out.append(Sprite('blueDoorway', [win(doors, 32, 2, 32, 46)], 1, 'An open doorway in a blue wall (pack 2).', crop=False))
    # --- pack 4 (Craftpix): banners, skulls, armor, pedestals
    oo = load(os.path.join(p4, 'Other_objects.png'))
    for name, box, note in (
        ('dragonSkull', (7, 5, 34, 43), 'A horned dragon skull (Craftpix).'),
        ('skullBig', (52, 12, 24, 25), 'A big skull (Craftpix).'),
        ('armor', (70, 59, 21, 27), 'A suit of armor (Craftpix).'),
        ('armor2', (102, 59, 19, 27), 'A suit of armor (Craftpix).'),
        ('bannerRed', (164, 64, 23, 30), 'A red banner (Craftpix).'),
        ('bannerBlue', (196, 64, 23, 30), 'A blue banner (Craftpix).'),
    ):
        out.append(Sprite(name, [win(oo, *box)], 1, note))
    ped = load(os.path.join(p4, 'pedestals.png'))
    for name, box, note in (
        ('pedestal', (83, 3, 26, 26), 'A stone pedestal (Craftpix).'),
        ('pedestalRed', (195, 2, 26, 27), 'A pedestal with a red cloth (Craftpix).'),
        ('pedestalBlue', (307, 2, 26, 27), 'A pedestal with a blue cloth (Craftpix).'),
    ):
        out.append(Sprite(name, [win(ped, *box)], 1, note))
    # --- traps
    peaks = items(p1, 'peaks')
    # The spikes, out of the floor they were drawn on: 0 up, 1 half, 2 down (holes), 3 tips.
    out.append(Sprite('spikes', [knock(f, {'#3d253b', '#362030'}) for f in peaks], 8, 'Spikes: up, half up, down (holes), the tips showing (pack 1).', crop=False))
    fire = load(os.path.join(p4, 'fire_trap.png'))
    vent = [win(fire, f * 112 + 9, 0, 16, 64) for f in range(9)]
    out.append(Sprite('vent', vent, 10, 'A fire vent: off, a spark, the flame rising, full, sparks and embers (Craftpix).', crop=False))
    saw = load(os.path.join(p4, 'trap_saw.png'))
    discs = []
    for f in range(6):
        im = quant(win(saw, 0, f * 32, 32, 18))
        px = im.load()
        disc = {'#2b2944', '#6784b6', '#5b6b98', '#4c5377', '#414162', '#72abdc'}
        slot = {'#5f637a', '#2f2f41', '#959cc6'}
        for y in range(18):
            for x in range(32):
                if not px[x, y][3] or y < 13:
                    continue
                h = hexs(px[x, y])
                if h in slot or y >= 17:
                    px[x, y] = (0, 0, 0, 0)
        # The outline pixels left beside the slot (not touching the disc) go too.
        for y in range(13, 17):
            for x in range(32):
                if px[x, y][3] and hexs(px[x, y]) == '#2b2944':
                    near = any(0 <= x + d < 32 and px[x + d, y][3] and hexs(px[x + d, y]) in disc - {'#2b2944'} for d in (-1, 1))
                    above = y > 0 and px[x, y - 1][3]
                    if not near and not above:
                        px[x, y] = (0, 0, 0, 0)
        discs.append(im)
    out.append(Sprite('saw', discs, 16, 'A saw blade turning, half out of the floor (Craftpix).'))
    out.append(Sprite('sawTrack', [win(saw, 274, 205, 45, 5)], 1, 'The slot a saw runs along (Craftpix).'))
    plate = load(os.path.join(p4, 'trap_plate.png'))

    def plate_frames(x):
        fs = []
        for k in range(8):
            y = 32 * k - 8
            f = Image.new('RGBA', (16, 24), (0, 0, 0, 0))
            f.alpha_composite(plate.crop((x, max(0, y), x + 16, y + 24)), (0, max(0, -y)))
            fs.append(f)
        return fs
    out.append(Sprite('plate', plate_frames(0), 12, 'A flip plate: flat, turning over, its spiked side up, turning back (Craftpix).', crop=False))
    return out


def tileset_ts(name, tiles, colors, note):
    pal = Palette()
    for c in colors.values():
        pal.key(c)
    rows = {k: pal.rows(v) for k, v in tiles.items()}
    body = ''.join(f'    {k}: {ts_rows(r, 4)},\n' for k, r in rows.items())
    named = ', '.join(f'{k}: {v!r}' for k, v in colors.items())
    return (
        f'/** {note} */\n'
        f'export const {name}: TileSet = {{\n'
        f"  pal: [{', '.join(repr(c) for c in pal.colors)}],\n"
        f'  colors: {{ {named} }},\n'
        f'  tiles: {{\n{body}  }},\n}};\n'
    )


def main():
    if len(sys.argv) < 5:
        raise SystemExit(__doc__)
    p1, p2, p4, dst = sys.argv[1:5]
    purple, pc = purple_tiles(p1)
    blue, bc = blue_tiles(p2)
    sp = sprites(p1, p2, p4)
    names = ' | '.join(f"'{s.name}'" for s in sp)
    src = (
        '/**\n'
        ' * The Dungeon\'s art, generated by tools/packs/dungeon.py from three supplied packs (see CREDITS.md):\n'
        ' * the 2D Pixel Dungeon Asset Pack v2.0 (the purple-brown tileset, its items and spikes), DungeonAssets\n'
        ' * (the blue-stone tileset, doors and objects) and Craftpix\'s free dungeon objects (the fire vent, the\n'
        ' * saw, the flip plate, banners, skulls, armor, pedestals). Copied 1:1; do not edit by hand.\n'
        ' */\n'
        "import type { AnimSheet } from '../pixel/indexed';\n\n"
        '/** A 16 x 16 tile set: a palette (indexed by KEYS), named colors, and named tiles as indexed rows. */\n'
        'export interface TileSet {\n'
        '  pal: readonly string[];\n'
        '  colors: Readonly<Record<string, string>>;\n'
        '  tiles: Readonly<Record<string, readonly string[]>>;\n'
        '}\n\n'
        + tileset_ts('PURPLE_TILES', purple, pc, 'The purple-brown stone (pack 1): thin walls with a brick face to the north, cracked flagstones.')
        + '\n'
        + tileset_ts('BLUE_TILES', blue, bc, 'The blue stone (DungeonAssets): thick mauve caps, a blue brick face, a cobbled rim round the floor.')
        + f'\nexport type DungeonSprite = {names};\n\n'
        + '/** Props, decor and traps (anchor: the middle of the bottom row). */\n'
        + 'export const DUNGEON_SPRITES: Readonly<Record<DungeonSprite, AnimSheet>> = {\n'
        + ''.join(s.ts() for s in sp)
        + '};\n'
    )
    with open(dst, 'w') as f:
        f.write(src)
    print('wrote', dst, f'{len(src) // 1024} KB,', len(purple), 'purple tiles,', len(blue), 'blue tiles,', len(sp), 'sprites')
    for s in sp:
        print(f'  {s.name}: {s.frames[0].size[0]}x{s.frames[0].size[1]} x{len(s.frames)}')


if __name__ == '__main__':
    main()
