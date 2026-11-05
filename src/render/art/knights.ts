/**
 * Knights, dressed on Snoblin's prototype mannequin (the skeleton every character is built on):
 * the mannequin's pixel roles (face, torso, arms, legs, feet) are colored for the knight's class,
 * rarity and own colors, then a class helmet is drawn over the head for each view (a Guardian's great
 * helm, a Blade's plumed sallet, a Ranger's hood, a Cleric's mitre, an Arcanist's hat, a Lancer's
 * winged helm). Weapons and shields are separate sprites the renderer holds in the hands.
 */
import { CLASSES, knightDef, type ClassId } from '../../core/knights';
import { rarityIndex, type Rarity } from '../../core/rarity';
import type { MutationId } from '../../core/state';
import { hsl, toHex } from '../../world/mobgen';
import { blank, type PixelBuf } from '../pixel/buf';
import { BODY_ANCHOR, BODY_ANIMS, BODY_FRAMES, BODY_H, BODY_W, type BodyFrame } from '../packs/mannequin';
import { hash, mixHex, setRGB, shade } from './draw';

export type View = 'down' | 'side' | 'up';
export type BodyAnim = 'idle' | 'walk' | 'hurt' | 'death';

export const OUTLINE = '#1f1420';

/** Armor metal per rarity: darkest, dark, mid, light, shine. */
export const METAL: Record<Rarity, readonly string[]> = {
  common: ['#2e2622', '#5a4a40', '#7d6a5c', '#a08a76', '#c4ae96'],
  uncommon: ['#26302e', '#4a5856', '#6e807c', '#98aaa4', '#c6d4ce'],
  rare: ['#1c2640', '#34507a', '#4f74aa', '#7ea4d8', '#c0dcff'],
  epic: ['#24163c', '#4a2c78', '#6e48aa', '#9c78d8', '#d4bcff'],
  legendary: ['#4a2a0c', '#8a5414', '#c88a24', '#f2c24a', '#fff2a8'],
  mythic: ['#3a0c22', '#7a1a44', '#b8306a', '#f0609a', '#ffc2dc'],
  ancient: ['#1e2a1a', '#3e5a30', '#6a8a44', '#a8b868', '#e8e8b0'],
  exalted: ['#3a3e52', '#7a8098', '#b4bccc', '#e4e8f2', '#ffffff'],
  celestial: ['#0c1030', '#1c2a6a', '#2e4ab0', '#5a8ae8', '#a8e0ff'],
  astral: ['#062a2a', '#0e5a5a', '#1a9488', '#4ad8c0', '#b8fff0'],
  divine: ['#5a3a14', '#a8783a', '#e8c06a', '#fff0b8', '#ffffff'],
  eternal: ['#0a0612', '#1e1430', '#3a2860', '#6a4ab0', '#c0a8ff'],
  primordial: ['#3a1450', '#a03a8a', '#f07a5a', '#ffd25a', '#ffffff'],
};

const SKINS: ReadonlyArray<readonly string[]> = [
  ['#b07a5a', '#d8a07a', '#f4c8a0'],
  ['#9a6444', '#c08458', '#e0a878'],
  ['#7a4a30', '#9a6440', '#be8458'],
  ['#5a3420', '#784830', '#9a6444'],
  ['#c88a6a', '#eab08a', '#ffd4b0'],
];
const HAIRS: ReadonlyArray<readonly string[]> = [
  ['#2a1a14', '#4a2e20', '#6a4430'],
  ['#5a2a14', '#8a4420', '#b8642e'],
  ['#6a5020', '#a8823a', '#dcb458'],
  ['#1a1418', '#2e2830', '#463e48'],
  ['#5a5258', '#8a8088', '#bab0b8'],
];

export interface KnightLook {
  cls: ClassId;
  rarity: Rarity;
  metal: readonly string[];
  cloth: readonly string[];
  plume: readonly string[];
  gold: readonly string[];
  skin: readonly string[];
  hair: readonly string[];
  leather: readonly string[];
  white: readonly string[];
  mutation: MutationId | null;
}

/** A color ramp of 4 from a hue: dark to light. */
export function hueRamp(h: number, s: number, lights: readonly number[] = [0.18, 0.3, 0.44, 0.6]): string[] {
  return lights.map((l) => toHex(h, s, l));
}

export function knightLook(id: string, mutation: MutationId | null, timeSec = 0): KnightLook {
  const def = knightDef(id);
  const r = def.rarity;
  let metal = [...METAL[r]];
  if (r === 'primordial') {
    // Primordial armor cycles through every color.
    const h = (timeSec * 0.15) % 1;
    metal = hueRamp(h, 0.7, [0.14, 0.3, 0.48, 0.66, 0.86]);
  }
  const h0 = def.hue;
  let cloth = hueRamp(h0, 0.55);
  const plume = hueRamp((h0 + 0.5) % 1, 0.75, [0.3, 0.5, 0.68]);
  let gold = ['#7a4a14', '#c88a2a', '#ffd86a'];
  const skin = SKINS[Math.floor(hash(def.name.length, rarityIndex(r), 7) * SKINS.length)];
  const hair = HAIRS[Math.floor(hash(def.name.charCodeAt(0), rarityIndex(r)) * HAIRS.length)];
  let leather = ['#2e2018', '#4a3424', '#6a4c34', '#8a6646'];
  let white = ['#8a8494', '#c4bece', '#ece8f2', '#ffffff'];
  // Mutations change the look: Gilded trims in gold, Shadow darkens, Radiant brightens, Void inverts.
  if (mutation === 'gilded') {
    cloth = ['#5a3a10', '#8a5a1a', '#c88a2a', '#f2c24a'];
    metal = metal.map((c, i) => mixHex(c, ['#4a2a0c', '#8a5414', '#c88a24', '#f2c24a', '#fff2a8'][i], 0.45));
  } else if (mutation === 'shadow') {
    metal = metal.map((c) => mixHex(shade(c, -0.55), '#3a1a5a', 0.3));
    cloth = cloth.map((c) => mixHex(shade(c, -0.5), '#5a2a8a', 0.35));
    leather = leather.map((c) => shade(c, -0.4));
    white = white.map((c) => mixHex(c, '#3a2a5a', 0.6));
  } else if (mutation === 'radiant') {
    metal = metal.map((c) => mixHex(c, '#fff8e0', 0.45));
    cloth = cloth.map((c) => mixHex(c, '#ffffff', 0.3));
    gold = ['#c8902a', '#ffd86a', '#fff8c8'];
  } else if (mutation === 'void') {
    metal = ['#020206', '#0a0a18', '#16163a', '#2a2a6a', '#6ae8ff'];
    cloth = ['#020206', '#0e0a20', '#1e1640', '#3a2a7a'];
    white = ['#06060e', '#141430', '#24245a', '#6ae8ff'];
  }
  return { cls: def.cls, rarity: r, metal, cloth, plume, gold, skin, hair, leather, white, mutation };
}

// ------------------------------------------------------------------ helmets (12 x 12; the head sits at columns 2-9, rows 5-11)

/*
 * Keys: . keep what's under   k outline   M m N metal light, mid, dark   C c D cloth light, mid, dark
 * G g gold light, dark   W w white, off-white   P p plume light, dark   V visor (deep shadow)
 */
type Helm = Record<View, readonly string[]>;
const HELMS: Record<ClassId, Helm> = {
  guardian: {
    down: ['............', '............', '.....kk.....', '....kPpk....', '...kkPpkk...', '..kMMMMMmk..', '.kMMMMMMmNk.', '.kMMMMMmmNk.', '.kmmmmmmmNk.', '.kVVVVVVVVk.', '.kmMmMmmmNk.', '..kNmmmmNk..'],
    side: ['............', '............', '....kk......', '...kPpk.....', '..kkPpkk....', '..kMMMMMk...', '.kMMMMMMmk..', '.kMMMMMmmNk.', '.kmmmmmmmNk.', '.kmmmmVVVVk.', '.kNmmmmmNNk.', '..kNNmmmNk..'],
    up: ['............', '............', '.....kk.....', '....kpPk....', '...kkpPkk...', '..kMMMMMmk..', '.kMMMMMMmNk.', '.kMMMMMMmNk.', '.kmmmmmmmNk.', '.kmmmmmmmNk.', '.kNmmmmmmNk.', '..kNNNNNNk..'],
  },
  blade: {
    down: ['.....kk.....', '....kPPk....', '....kPpk....', '....kPpk....', '...kkMmkk...', '..kMMMMMmk..', '.kMMMMMMmNk.', '.kMmmmmmmNk.', '.kN......Nk.', '.kN......Nk.', '..k......k..', '............'],
    side: ['....kk......', '...kPPk.....', '...kPpk.....', '...kPpk.....', '..kkMmkk....', '..kMMMMMk...', '.kMMMMMMmk..', '.kMMMmmmmNk.', '.kNmmk......', '.kNmNk......', '.kNNk.......', '..kk........'],
    up: ['.....kk.....', '....kpPk....', '....kpPk....', '....kpPk....', '...kkmMkk...', '..kMMMMMmk..', '.kMMMMMMmNk.', '.kMMMMMMmNk.', '.kmmmmmmmNk.', '.kmmmmmmmNk.', '.kNmmmmmmNk.', '..kNNNNNNk..'],
  },
  ranger: {
    down: ['............', '............', '............', '.....kk.....', '....kCck....', '..kkCCCcck..', '.kCCCCCCcck.', '.kCCcccccDk.', '.kCD....cDk.', '.kCD....cDk.', '.kcD....DDk.', '.kcDk..kDDk.'],
    side: ['............', '............', '............', '....kk......', '...kCck.....', '..kCCCcck...', '.kCCCCCcck..', '.kCCCccccDk.', '.kCccD......', '.kCccD......', '.kccDD......', '.kcDDk......'],
    up: ['............', '............', '............', '.....kk.....', '....kcCk....', '..kkcCCCkk..', '.kCCCCCCcck.', '.kCCCCCccDk.', '.kCCCCcccDk.', '.kcCCCcccDk.', '.kccccccDDk.', '..kDDDDDDk..'],
  },
  cleric: {
    down: ['............', '.....kk.....', '....kWwk....', '...kWWGwk...', '...kWGGGk...', '..kWWWGwwk..', '.kgGGGGGGgk.', '.kWw....wwk.', '.kW......wk.', '.kw......wk.', '.kw......wk.', '..k......k..'],
    side: ['............', '....kk......', '...kWwk.....', '...kWGwk....', '..kWGGGk....', '..kWWGwwk...', '.kgGGGGGgk..', '.kWWw.......', '.kWWw.......', '.kWww.......', '.kwwk.......', '..kk........'],
    up: ['............', '.....kk.....', '....kwWk....', '...kwWWWk...', '...kWWWWk...', '..kWWWWWwk..', '.kgGGGGGGgk.', '.kWWWWWWwwk.', '.kWWWWWWwwk.', '.kwWWWWwwwk.', '.kwwwwwwwwk.', '..kwwwwwwk..'],
  },
  arcanist: {
    down: ['........kk..', '.......kCk..', '......kCDk..', '.....kCcDk..', '....kCCcDk..', '...kCCCccDk.', '..kGGGgGGgk.', 'kkCCCCcccDDk', '..kDDDDDDk..', '............', '............', '............'],
    side: ['..kk........', '..kCDk......', '...kCDk.....', '...kCcDk....', '...kCCcDk...', '..kCCCccDk..', '..kGGGgGGk..', '.kCCCCcccDDk', '..kDDDDDDk..', '............', '............', '............'],
    up: ['...kk.......', '...kCDk.....', '...kCcDk....', '....kCcDk...', '....kCCcDk..', '...kCCCccDk.', '..kGGGgGGgk.', 'kkCCCCcccDDk', '.kDDDDDDDDk.', '............', '............', '............'],
  },
  lancer: {
    down: ['............', '............', 'k..........k', 'kWk......kWk', 'kWWk.kk.kWWk', '.kWkMMMMkWk.', '.kMMMMMMmNk.', '.kMMmmmmmNk.', '.kN......Nk.', '.kN......Nk.', '..k......k..', '............'],
    side: ['............', '............', '.k..........', '.kWk........', '.kWWk.kk....', '..kWkMMMk...', '.kMMMMMMmk..', '.kMMMmmmmNk.', '.kNmmk......', '.kNmNk......', '.kNNk.......', '..kk........'],
    up: ['............', '............', 'k..........k', 'kWk......kWk', 'kWWk.kk.kWWk', '.kWkMMMMkWk.', '.kMMMMMMmNk.', '.kMMMMMMmNk.', '.kmmmmmmmNk.', '.kmmmmmmmNk.', '.kNmmmmmmNk.', '..kNNNNNNk..'],
  },
};

/** How many art pixels helmets add above the mannequin's head (the frame grows by this much). */
export const HELM_TOP = 5;
export const KNIGHT_W = BODY_W + 2;
export const KNIGHT_H = BODY_H + HELM_TOP;
/** The feet, in a knight frame. */
export const KNIGHT_ANCHOR = { x: BODY_ANCHOR.x + 1, y: KNIGHT_H - 1 };

function helmColor(ch: string, L: KnightLook): string | null {
  switch (ch) {
    case 'k':
      return OUTLINE;
    case 'M':
      return L.metal[3];
    case 'm':
      return L.metal[2];
    case 'N':
      return L.metal[1];
    case 'C':
      return L.cloth[2];
    case 'c':
      return L.cloth[1];
    case 'D':
      return L.cloth[0];
    case 'G':
      return L.gold[2];
    case 'g':
      return L.gold[1];
    case 'W':
      return L.white[2];
    case 'w':
      return L.white[1];
    case 'P':
      return L.plume[2];
    case 'p':
      return L.plume[1];
    case 'V':
      return L.mutation === 'void' ? '#6ae8ff' : '#0e0a12';
    default:
      return null;
  }
}

/** Body colors for each mannequin role, by class. */
function bodyColor(role: string, L: KnightLook, x: number, _y: number, f: BodyFrame, view: View): string {
  const plate = L.cls === 'guardian' || L.cls === 'blade' || L.cls === 'lancer';
  const robe = L.cls === 'cleric' || L.cls === 'arcanist';
  const cx = (f.head[0] + f.head[2]) / 2;
  const tabard = plate && view === 'down' && Math.abs(x - cx) <= 0.6;
  const shades = (r: readonly string[], k: 0 | 1 | 2) => r[k];
  const lvl = (ch: string, a: string, b: string): 0 | 1 | 2 => (ch === a ? 0 : ch === b ? 1 : 2);
  switch (role) {
    case 'k':
      return OUTLINE;
    case 'e':
      return L.mutation === 'void' ? '#6ae8ff' : '#1a1020';
    case 'h':
    case 'i':
    case 'j': {
      // Faces show skin; the back of the head is hair.
      const k = lvl(role, 'h', 'i');
      if (view === 'up') return L.hair[k];
      if (view === 'side' && x <= f.head[0] + 2) return L.hair[k];
      return L.skin[k];
    }
    case 't':
    case 'u':
    case 'v': {
      const k = lvl(role, 't', 'u');
      if (tabard) return L.cloth[k + 1];
      if (plate) return L.metal[k + 1];
      if (L.cls === 'cleric') return k === 0 ? L.gold[1] : L.white[k + 1];
      if (L.cls === 'arcanist') return L.cloth[k];
      return L.leather[k + 1];
    }
    case 'a':
    case 'b':
    case 'c': {
      const k = lvl(role, 'a', 'b');
      if (plate) return L.metal[k + 1];
      if (L.cls === 'ranger') return L.cloth[k];
      if (L.cls === 'cleric') return L.white[k + 1];
      return L.cloth[k];
    }
    case 'l':
    case 'm':
    case 'n': {
      const k = lvl(role, 'l', 'm');
      if (plate) return L.metal[k];
      if (robe) return L.cls === 'cleric' ? L.white[k + 1] : L.cloth[k];
      return L.leather[k];
    }
    case 'f':
    case 'g':
      return shades(plate ? [L.metal[0], L.metal[1], L.metal[1]] : L.leather, role === 'f' ? 0 : 1);
    default:
      return '#ff00ff';
  }
}

function frameIndex(anim: BodyAnim, view: View, frame: number): number {
  const list = BODY_ANIMS[`${anim}_${view}`];
  return list[((frame % list.length) + list.length) % list.length];
}

export function animLength(anim: BodyAnim, view: View): number {
  return BODY_ANIMS[`${anim}_${view}`].length;
}

/**
 * One knight frame, facing right in side view. Returns the buffer and where the hands and head are
 * (frame pixels), for weapons and effects.
 */
export function knightFrame(L: KnightLook, anim: BodyAnim, view: View, frame: number): { buf: PixelBuf; handR: [number, number]; handL: [number, number]; headTop: number } {
  const f = BODY_FRAMES[frameIndex(anim, view, frame)];
  const b = blank(KNIGHT_W, KNIGHT_H);
  const ox = 1;
  const oy = HELM_TOP;
  // A cape for Epic and better, behind the body.
  const caped = rarityIndex(L.rarity) >= rarityIndex('epic') && anim !== 'death';
  if (caped && view !== 'down') {
    const cx = Math.round((f.head[0] + f.head[2]) / 2) + ox;
    const top = f.head[3] + oy + 1;
    for (let y = top; y < Math.min(KNIGHT_H - 1, top + 7); y++) {
      const half = view === 'up' ? 3 : 2;
      const shift = view === 'side' ? -2 : 0;
      for (let x = cx - half + shift; x <= cx + half + shift - (view === 'side' ? 1 : 0); x++) {
        const edge = x === cx - half + shift || x === cx + half + shift - (view === 'side' ? 1 : 0) || y === top + 6;
        setRGB(b, x, y, edge ? OUTLINE : L.plume[y % 3 === 0 ? 1 : 0]);
      }
    }
  }
  for (let y = 0; y < f.rows.length; y++) {
    const row = f.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      setRGB(b, x + ox, y + oy, bodyColor(ch, L, x, y, f, view));
    }
  }
  // The helmet, over the head (not on a lying body).
  if (anim !== 'death' || frame === 0) {
    const tpl = HELMS[L.cls][view];
    const hx = f.head[0] + ox - 2;
    const hy = f.head[1] + oy - 5;
    for (let y = 0; y < tpl.length; y++) {
      for (let x = 0; x < tpl[y].length; x++) {
        const c = helmColor(tpl[y][x], L);
        if (c) setRGB(b, hx + x, hy + y, c);
      }
    }
    // A halo for Celestial and better.
    if (rarityIndex(L.rarity) >= rarityIndex('celestial')) {
      const cx = hx + 6;
      const cy = Math.max(0, hy + 1);
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 1], [0, 1], [1, 1]]) setRGB(b, cx + dx - 0.5, cy + dy, L.gold[2]);
    }
  }
  return {
    buf: b,
    handR: [f.handR[0] + ox, f.handR[1] + oy],
    handL: [f.handL[0] + ox, f.handL[1] + oy],
    headTop: f.head[1] + oy,
  };
}

// ------------------------------------------------------------------ weapons (drawn pointing up; the pivot is the grip)

export interface WeaponArt {
  buf: PixelBuf;
  /** The grip, in sprite pixels: the sprite rotates around it in the hand. */
  px: number;
  py: number;
}

function sprite(rows: readonly string[], colors: Record<string, string>): PixelBuf {
  const b = blank(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && setRGB(b, x, y, colors[ch] ?? '#ff00ff')));
  return b;
}

export function weaponArt(L: KnightLook): WeaponArt {
  const m = L.metal;
  const base = { k: OUTLINE, M: m[4], m: m[3], N: m[2], G: L.gold[2], g: L.gold[1], b: '#4a3020', B: '#6a4630', C: L.cloth[2], c: L.cloth[1], O: L.plume[2], o: L.plume[1], W: '#f4f0e0', w: '#c8c0b0' };
  switch (L.cls) {
    case 'guardian':
      // A flanged mace.
      return { buf: sprite(['.kkk.', 'kMmNk', 'kmMNk', '.kNk.', '..b..', '..B..', '..b..', '.kgk.'], base), px: 2, py: 5 };
    case 'blade':
      return { buf: sprite(['..k..', '.kMk.', '.kMmk', '.kMmk', '.kMmk', '.kMmk', 'kgGgk', '..b..', '..B..', '..g..'], base), px: 2, py: 8 };
    case 'lancer':
      return {
        buf: sprite(['..k...', '.kMk..', '.kMmk.', '.kNmk.', '..kgCC', '..BCcc', '..bCc.', '..B...', '..b...', '..B...', '..b...', '..B...', '..b...', '..B...'], base),
        px: 2,
        py: 9,
      };
    case 'ranger':
      // A longbow, string on the right.
      return { buf: sprite(['.kk..', 'kBbk.', 'kb.wk', 'kb..w', 'kB..w', 'kG..w', 'kB..w', 'kb..w', 'kb.wk', 'kBbk.', '.kk..'], base), px: 1, py: 5 };
    case 'cleric':
      return { buf: sprite(['..k..', '.kGk.', 'kGGGk', '.kGk.', '..g..', '..B..', '..b..', '..B..', '..b..', '..B..'], base), px: 2, py: 7 };
    case 'arcanist':
      return { buf: sprite(['.kkk.', 'kOOok', 'kOoOk', '.kok.', '..g..', '..B..', '..b..', '..B..', '..b..', '..B..', '..b..'], base), px: 2, py: 8 };
  }
}

/** The Guardian's kite shield, in the knight's cloth with a gold boss. */
export function shieldArt(L: KnightLook): PixelBuf {
  const m = L.metal;
  return sprite(['.kkkkk.', 'kMCCCmk', 'kMCGCmk', 'kmCCCNk', 'kmCcCNk', '.kmCNk.', '..kNk..', '...k...'], {
    k: OUTLINE, M: m[3], m: m[2], N: m[1], C: L.cloth[2], c: L.cloth[1], G: L.gold[2],
  });
}

export const CLASS_HAS_SHIELD: Record<ClassId, boolean> = { guardian: true, blade: false, ranger: false, cleric: false, arcanist: false, lancer: false };

/** The glow color for a knight (Legendary and better shine; mutations too). */
export function knightGlow(L: KnightLook): string | null {
  if (L.mutation === 'radiant') return '#fff2c0';
  if (L.mutation === 'void') return '#6ae8ff';
  if (L.mutation === 'shadow') return '#a060ff';
  return rarityIndex(L.rarity) >= rarityIndex('legendary') ? L.metal[3] : null;
}

export function classColor(cls: ClassId): string {
  return { guardian: '#c8a050', blade: '#d06050', ranger: '#60b060', cleric: '#f0e0a0', arcanist: '#9070e0', lancer: '#e08040' }[cls];
}

export { CLASSES, hsl };
