/**
 * The hub's keepers and regulars: their looks, the tools of their trade (a smith's hammer, a tinker's
 * wrench, a priestess's candle) and their poses. The keepers stand tall in the style of their
 * portraits (tallFolk.ts); the regulars are dressed on the same Snoblin mannequin as every NPC
 * (art/npcs.ts), with the poses the stock NPC frames don't have: sitting on a bench or a chair facing
 * you, and sitting at a table seen from behind. `keeperFrame` draws any of them, standing or sitting,
 * so the renderer only needs where they are and which way they face.
 */
import type { NpcDef, NpcLook, Ramp2, Ramp3 } from '../../world/npcs';
import { blank, flipX, type PixelBuf } from '../pixel/buf';
import { BODY_ANCHOR, BODY_ANIMS, BODY_FRAMES, BODY_H } from '../packs/mannequin';
import { inkOutline, setRGB } from './draw';
import { OUTLINE, type View } from './knights';
import { NPC_ANCHOR, NPC_H, NPC_W, npcFrame } from './npcs';
import { isTall, reachOf, tallFrame } from './tallFolk';

/** Where the mannequin sits inside an NPC frame (same offsets as art/npcs.ts). */
const OX = NPC_ANCHOR.x - BODY_ANCHOR.x;
const OY = NPC_H - BODY_H;

export type KeeperPose = 'stand' | 'sit';
export type KeeperTool = 'hammer' | 'wrench' | 'candle' | 'tongs' | 'book' | 'cup';

// ------------------------------------------------------------------ the cast

const SKIN = {
  pale: ['#c88a6a', '#eab08a', '#ffd4b0'],
  light: ['#b07a5a', '#d8a07a', '#f4c8a0'],
  tan: ['#9a6444', '#c08458', '#e0a878'],
  brown: ['#7a4a30', '#9a6440', '#be8458'],
  dark: ['#5a3420', '#784830', '#9a6444'],
} as const satisfies Record<string, Ramp3>;

const HAIR = {
  brown: ['#2a1a14', '#4a2e20', '#6e4630'],
  ginger: ['#6a2a12', '#a4481e', '#d4723a'],
  blond: ['#7a5a20', '#b48a3a', '#e4c060'],
  black: ['#141016', '#2a2430', '#443c4a'],
  gray: ['#5a5460', '#8e8894', '#c4bec8'],
  white: ['#8a8698', '#c8c4d4', '#f2f0f8'],
} as const satisfies Record<string, Ramp3>;

const SHOES: Ramp2 = ['#2e2018', '#4a3424'];
const BOOTS: Ramp2 = ['#1e1a1e', '#38303a'];
const GOLD2: Ramp2 = ['#b8862a', '#f0c850'];

function keeper(id: string, name: string, title: string, look: NpcLook, barks: string[]): NpcDef {
  // Keepers never wander into the dungeon: no weight, no quests.
  return { id: `hub-${id}`, name, title, kind: 'folk', look, barks, quests: [], weight: 0 };
}

/** The keepers, by station, and the regulars who just come for the light. */
export const HUB_CAST = {
  oracle: keeper('oracle', 'Oracle Vesper', 'keeper of the Gilded Reel', {
    skin: SKIN.light,
    hair: HAIR.white,
    hairStyle: 'none',
    shirt: ['#2c1640', '#4a2466', '#6e3a8e'],
    pants: ['#2c1640', '#4a2466', '#6e3a8e'],
    shoes: ['#1e1420', '#33223a'],
    dress: true,
    panel: { kind: 'shawl', ramp: GOLD2 },
    hat: { kind: 'hood', ramp: ['#2c1640', '#4a2466', '#6e3a8e'], trim: GOLD2 },
    eyes: '#ffd84a',
    item: 'orbStaff',
    tall: { slim: true, glow: true },
  },['The reels never stop.', 'Fortune favors the patient. And the lucky.', 'Hm. I sense a Legendary in your future. Or soup.']),
  smith: keeper('smith', 'Brannoc', 'the smith', {
    skin: SKIN.tan,
    hair: HAIR.ginger,
    hairStyle: 'bald',
    beard: 'full',
    shirt: ['#26222a', '#3c3640', '#58505a'],
    sleeves: SKIN.tan,
    pants: ['#2a2018', '#43342a', '#5e4a3a'],
    shoes: BOOTS,
    panel: { kind: 'apron', ramp: ['#5a3418', '#8a5428'] },
    eyes: '#5a9a4a',
    tall: {},
  }, ['Clang.', 'Shards. Gold. Hammer. Better knight.', 'Mind the sparks.']),
  scrap: keeper('scrap', 'Rusty Mags', 'junk dealer', {
    skin: SKIN.pale,
    hair: HAIR.gray,
    hairStyle: 'bun',
    glasses: true,
    hat: { kind: 'kerchief', ramp: ['#6a2a12', '#a4481e', '#d4723a'] },
    shirt: ['#3a3e1e', '#5a602e', '#7e8442'],
    panel: { kind: 'vest', ramp: ['#3e2a1a', '#6a4a2e'] },
    pants: ['#22304a', '#34507a', '#5076a6'],
    shoes: SHOES,
    eyes: '#7a9a3a',
    tall: { slim: true },
  }, ['One knight\'s spare is another knight\'s shards.', 'Everything breaks down. Eventually.', 'I buy doubles. I buy triples. I buy.']),
  squad: keeper('squad', 'Quartermaster Hilde', 'keeper of the roster', {
    skin: SKIN.light,
    hair: HAIR.blond,
    hairStyle: 'bob',
    shirt: ['#4a1418', '#7a2228', '#a83a3a'],
    panel: { kind: 'vest', ramp: ['#1e2a4a', '#2e4270'] },
    pants: ['#1e2a4a', '#2e4270', '#46609a'],
    shoes: BOOTS,
    hat: { kind: 'beret', ramp: ['#1a2240', '#2a3a66', '#3e5490'], trim: GOLD2 },
    item: 'ledger',
    eyes: '#3a7ad8',
    tall: { slim: true },
  },['Three to a squad. No exceptions. Mostly.', 'Who\'s leading today?', 'Names, classes, boot sizes.']),
  upgrades: keeper('upgrades', 'Tinker Pell', 'outfitter', {
    skin: SKIN.brown,
    hair: HAIR.black,
    hairStyle: 'short',
    glasses: true,
    shirt: ['#16404a', '#1e6070', '#2e8a96'],
    panel: { kind: 'apron', ramp: ['#8a7a5a', '#b8a67a'] },
    pants: ['#2a2018', '#43342a', '#5e4a3a'],
    shoes: SHOES,
    eyes: '#e0902a',
    tall: {},
  }, ['A gear here, a spring there...', 'Faster reels? I can do faster reels.', 'Don\'t touch that. Or do. It\'s fine.']),
  perks: keeper('perks', 'Sage Orrin', 'reader of sigils', {
    skin: SKIN.pale,
    hair: HAIR.white,
    hairStyle: 'bald',
    beard: 'long',
    shirt: ['#143a34', '#1e5a4e', '#2e7e6a'],
    pants: ['#143a34', '#1e5a4e', '#2e7e6a'],
    shoes: SHOES,
    dress: true,
    panel: { kind: 'shawl', ramp: ['#8a6a2a', '#c8a048'] },
    item: 'staff',
    eyes: '#6a92c8',
    tall: {},
  },['Mm.', 'The sigils remember every rebirth.', 'Sit. Listen. The stones are talking.']),
  rebirth: keeper('rebirth', 'Sister Maren', 'priestess of the shrine', {
    skin: SKIN.brown,
    hair: HAIR.black,
    hairStyle: 'none',
    shirt: ['#a89c88', '#d8ceb8', '#f6efe0'],
    pants: ['#a89c88', '#d8ceb8', '#f6efe0'],
    shoes: ['#6a5a48', '#8a7a64'],
    dress: true,
    panel: { kind: 'tabard', ramp: GOLD2 },
    hat: { kind: 'hood', ramp: ['#9a94a8', '#cfc8da', '#f4f0f8'], trim: GOLD2 },
    eyes: '#d8962a',
    tall: { slim: true },
  }, ['Every ending is a door.', 'Rise again, and rise stronger.', 'The flame never goes out. I check.']),
  gate: keeper('gate', 'Warden Tobb', 'keeper of the stairs', {
    skin: SKIN.dark,
    hair: HAIR.black,
    hairStyle: 'short',
    shirt: ['#1a3a22', '#285a32', '#3a7e46'],
    sleeves: ['#4a4e5a', '#7a808e', '#a8aeba'],
    pants: ['#2e2620', '#4a3e32', '#62564a'],
    shoes: BOOTS,
    panel: { kind: 'tabard', ramp: GOLD2 },
    hat: { kind: 'kettle', ramp: ['#3e4450', '#6e7684', '#a4acb8'] },
    beard: 'mustache',
    item: 'spear',
    eyes: '#b8742a',
    tall: {},
  },['Stairs go down. Monsters come up.', 'Mind the bottom step. It glows.', 'Back in one piece, I hope.']),
  traveller: keeper('traveller', 'A traveller', 'resting his feet', {
    skin: SKIN.light,
    hair: HAIR.brown,
    hairStyle: 'short',
    shirt: ['#22304a', '#34507a', '#5076a6'],
    pants: ['#2a2018', '#43342a', '#5e4a3a'],
    shoes: SHOES,
    hat: { kind: 'straw', ramp: ['#8a6a2a', '#c8a048', '#ecd078'], trim: ['#6a2a1a', '#a8402a'] },
    pack: ['#3a2414', '#6a4426', '#9a6a3a'],
  }, ['Long day.', 'Best pie this side of the dungeon.']),
} as const;

/** The tool each keeper holds (the stock NPC items cover the rest). */
export const HUB_TOOLS: Partial<Record<keyof typeof HUB_CAST, KeeperTool>> = {
  smith: 'hammer',
  scrap: 'tongs',
  upgrades: 'wrench',
  rebirth: 'candle',
  traveller: 'cup',
};

// ------------------------------------------------------------------ tools

/*
 * Drawn upright with the grip at (px, py), like the stock NPC items. Keys: M m N metal light, mid,
 * dark   B b wood   W wax   Y O flame (glows)   G g brass   R r red   P paper
 */
interface ToolArt {
  rows: readonly string[];
  px: number;
  py: number;
}
const TOOLS: Record<KeeperTool, ToolArt> = {
  hammer: { rows: ['MMMm', 'MmNN', '.B..', '.b..', '.B..', '.b..'], px: 1, py: 4 },
  wrench: { rows: ['M.M', 'MmM', '.m.', '.M.', '.m.', '.N.'], px: 1, py: 4 },
  candle: { rows: ['.Y.', '.O.', '.W.', '.W.', 'GgG'], px: 1, py: 4 },
  tongs: { rows: ['N.N', 'm.m', '.m.', '.M.', 'M.m', 'M.m'], px: 1, py: 3 },
  book: { rows: ['RRRP', 'RRRP', 'rrrp'], px: 1, py: 2 },
  cup: { rows: ['WWW', 'Bbb', 'Bbb'], px: 1, py: 2 },
};
const TOOL_COLORS: Record<string, string> = {
  M: '#e6e8f0', m: '#9aa2b2', N: '#5a6072', B: '#9a6a3a', b: '#62401e', W: '#f4ead2', Y: '#fff2a8', O: '#ff9a3a',
  G: '#e0b040', g: '#8a5a1a', R: '#a8302a', r: '#6a1a1a', P: '#f2e6c6',
};
const TOOL_GLOW = new Set(['Y', 'O']);

function toolBufs(tool: KeeperTool): { buf: PixelBuf; glow: PixelBuf; px: number; py: number } {
  const t = TOOLS[tool];
  const b = blank(t.rows[0].length, t.rows.length);
  const g = blank(t.rows[0].length + 2, t.rows.length + 2);
  t.rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    setRGB(b, x, y, TOOL_COLORS[ch] ?? '#ff00ff');
    if (TOOL_GLOW.has(ch)) setRGB(g, x + 1, y + 1, TOOL_COLORS[ch]);
  }));
  return { buf: inkOutline(b, OUTLINE), glow: g, px: t.px + 1, py: t.py + 1 };
}

// ------------------------------------------------------------------ frames

function bodyFrame(view: View, frame: number) {
  const list = BODY_ANIMS[`idle_${view}`];
  return BODY_FRAMES[list[((frame % list.length) + list.length) % list.length]];
}

function copyRow(dst: PixelBuf, src: PixelBuf, sy: number, dy: number, dx = 0): void {
  if (sy < 0 || sy >= src.h || dy < 0 || dy >= dst.h) return;
  for (let x = 0; x < src.w; x++) {
    const si = (sy * src.w + x) * 4;
    if (!src.px[si + 3]) continue;
    const X = x + dx;
    if (X < 0 || X >= dst.w) continue;
    dst.px.set(src.px.subarray(si, si + 4), (dy * dst.w + X) * 4);
  }
}

function opaqueSpan(b: PixelBuf, y: number): [number, number] | null {
  let a = -1;
  let z = -1;
  for (let x = 0; x < b.w; x++) {
    if (!b.px[(y * b.w + x) * 4 + 3]) continue;
    if (a < 0) a = x;
    z = x;
  }
  return a < 0 ? null : [a, z];
}

function pixelHex(b: PixelBuf, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return null;
  const i = (y * b.w + x) * 4;
  if (!b.px[i + 3]) return null;
  const f = (v: number) => v.toString(16).padStart(2, '0');
  return `#${f(b.px[i])}${f(b.px[i + 1])}${f(b.px[i + 2])}`;
}

export interface KeeperFrame {
  buf: PixelBuf;
  /** The feet (or, sitting, the floor under the seat), in frame pixels. */
  ax: number;
  ay: number;
  /** Pixels that glow (a candle's flame), same size as buf, or null. */
  glow: PixelBuf | null;
  /** How far the figure (hat, staff and all) reaches above its anchor. */
  height: number;
}

/**
 * A keeper (or a regular) in a pose, facing `dir` in a side view (-1 left). The keepers are tall
 * figures in the style of their portraits (tallFolk.ts), painted facing whichever way so their light
 * stays on the top left. A regular is the stock NPC frame (with their tool in hand): sitting facing
 * you, the upper body drops a pixel, the thighs come toward you as a wide lap row and the shoes rest
 * under it (put a bench or chair behind); sitting seen from behind, the back and the seat of the
 * trousers, the legs hidden under the table in front of them, the frame's anchor the floor under the
 * stool, 4 px below the hips (draw the stool first). `frame` counts up freely (the idle breathes, and
 * a keeper blinks).
 */
export function keeperFrame(def: NpcDef, pose: KeeperPose, view: View, frame: number, tool?: KeeperTool, dir: 1 | -1 = 1): KeeperFrame {
  if (isTall(def.look)) {
    const t = tallFrame(def, pose, view, frame, tool, dir);
    return { buf: t.buf, ax: t.ax, ay: t.ay, glow: t.glow, height: t.height };
  }
  const fr = mannequinFrame(def, pose, view, frame, tool);
  if (view !== 'side' || dir > 0) return fr;
  return { ...fr, buf: flipX(fr.buf), glow: fr.glow ? flipX(fr.glow) : null, ax: fr.buf.w - 1 - fr.ax };
}

function mannequinFrame(def: NpcDef, pose: KeeperPose, view: View, frame: number, tool?: KeeperTool): KeeperFrame {
  const look = def.look;
  const src = npcFrame(def, 'idle', view, frame).buf;
  const f = bodyFrame(view, frame);
  const handR: [number, number] = [OX + f.handR[0], OY + f.handR[1]];
  let buf: PixelBuf;
  const ax = NPC_ANCHOR.x;
  let ay = NPC_ANCHOR.y;
  let drop = 0;
  if (pose === 'stand') {
    buf = src;
  } else {
    buf = blank(NPC_W, NPC_H);
    const legTop = OY + f.head[3] + 5;
    const bottom = NPC_H - 1;
    if (view === 'up') {
      // From behind: everything above the hips, the hips on the bottom row.
      drop = bottom - legTop;
      for (let y = 0; y <= legTop; y++) copyRow(buf, src, y, y + drop);
      ay = bottom + 4;
    } else {
      // Facing you (or sideways, treated the same): the upper body down to row bottom - 2, a lap row,
      // then the shoes.
      drop = bottom - 1 - legTop;
      for (let y = 0; y < legTop; y++) copyRow(buf, src, y, y + drop);
      copyRow(buf, src, legTop, bottom - 1);
      // Widen the lap a pixel each side (knees apart), keeping the outline outside.
      const span = opaqueSpan(src, legTop);
      if (span) {
        const [a, z] = span;
        const left = pixelHex(src, a + 1, legTop) ?? OUTLINE;
        const right = pixelHex(src, z - 1, legTop) ?? OUTLINE;
        setRGB(buf, a, bottom - 1, left);
        setRGB(buf, z, bottom - 1, right);
        setRGB(buf, a - 1, bottom - 1, OUTLINE);
        setRGB(buf, z + 1, bottom - 1, OUTLINE);
        // A lighter top on the thighs (they catch the light).
        for (let x = a + 1; x < z; x++) {
          const c = pixelHex(buf, x, bottom - 1);
          if (c && c !== OUTLINE && pixelHex(buf, x, bottom - 2) === OUTLINE) setRGB(buf, x, bottom - 2, look.dress ? look.shirt[1] : look.pants[1]);
        }
      }
      copyRow(buf, src, bottom, bottom);
    }
  }
  let glow: PixelBuf | null = null;
  if (tool && view !== 'up') {
    const t = toolBufs(tool);
    const x = handR[0] - t.px + 1;
    const y = handR[1] + drop - t.py + 1;
    for (let sy = 0; sy < t.buf.h; sy++) {
      for (let sx = 0; sx < t.buf.w; sx++) {
        const si = (sy * t.buf.w + sx) * 4;
        if (!t.buf.px[si + 3]) continue;
        const X = x + sx;
        const Y = y + sy;
        if (X < 0 || Y < 0 || X >= buf.w || Y >= buf.h) continue;
        buf.px.set(t.buf.px.subarray(si, si + 4), (Y * buf.w + X) * 4);
        if (t.glow.px[si + 3]) {
          glow ??= blank(buf.w, buf.h);
          glow.px.set(t.glow.px.subarray(si, si + 4), (Y * buf.w + X) * 4);
        }
      }
    }
  }
  return { buf, ax, ay, glow, height: reachOf(buf, ay) };
}
