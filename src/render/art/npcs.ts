/**
 * NPC art. Every NPC is dressed on Snoblin's prototype mannequin, the same skeleton as the knights
 * (art/knights.ts): the mannequin's pixel roles are colored for the NPC's skin and clothes (with an
 * apron, overalls' bib, vest, tabard or shawl over the torso, a long dress or robe over the legs),
 * then hair, a beard, glasses and a hat are laid over the head for each view, and the extras go on:
 * a backpack, the thing in their hand, a ghost's wisp, a goblin's ears, a chicken costume's beak, and
 * a demon's tells (a little tail poking out, horn tips under the hat, a curl of smoke, red eyes).
 * Same ink outline and light from the top left as the knights. Side frames face right.
 */
import type { HatKind, NpcDef, NpcItem, NpcLook } from '../../world/npcs';
import { blank, fromRows, type PixelBuf } from '../pixel/buf';
import { UI_SM } from '../pixel/ui';
import { BODY_ANCHOR, BODY_ANIMS, BODY_FRAMES, BODY_H, BODY_W, type BodyFrame } from '../packs/mannequin';
import { inkOutline, mixHex, setRGB } from './draw';
import { OUTLINE, type View } from './knights';

/** NPC frames: the mannequin with room round it for hats, tails and things held. */
export const NPC_W = BODY_W + 6;
export const NPC_H = BODY_H + 9;
const OX = 3;
const OY = 9;
/** The feet, in an NPC frame. */
export const NPC_ANCHOR = { x: BODY_ANCHOR.x + OX, y: NPC_H - 1 };

const EYE = '#1a1020';
const WHITE: readonly [string, string] = ['#c4bece', '#f4f0f8'];
const BONE: readonly [string, string] = ['#a89880', '#f0e6d2'];
const BEAK: readonly [string, string] = ['#b8641a', '#f2a23a'];

// ------------------------------------------------------------------ head overlays

/*
 * Head overlays are 14 wide, laid with their column 3 on the head's left outline (head[0]) and their
 * row 6 on the head's top row (head[1]): the head's inside is columns 4-9, rows 7-12 (eyes on row 10,
 * at columns 5 and 8 facing down, column 6 facing right).
 *
 * Keys: . keep   k ink   A B C hat light, mid, dark   D d trim light, dark   H h x hair light, mid, dark
 *       F f X beard light, mid, dark   S s z skin light, mid, dark   N n horn light, dark   E deep shadow
 *       L lens   O o beak light, dark   R eye glow
 */
type Tpl = Readonly<Record<View, readonly string[]>>;

const HAIR: Record<'short' | 'bob' | 'bun' | 'bald', Tpl> = {
  short: {
    down: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhhx....', '....h....x....'],
    side: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhh.....', '....Hhx.......', '....h.........', '....hx........', '....xx........'],
    up: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhhx....', '....Hhhhhx....', '....hhhhxx....', '....hhhxxx....', '....xxxxxx....'],
  },
  bob: {
    down: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhhx....', '....H....x....', '....h....x....', '...kh....xk...', '...kx....xk...', '....k....k....'],
    side: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhh.....', '....Hhx.......', '...kh.........', '...khx........', '...kxx........', '....kk........'],
    up: ['', '', '', '', '', '', '', '....HHHHhh....', '....HHhhhx....', '....Hhhhhx....', '...khhhhxxk...', '...khhhxxxk...', '...kxxxxxxk...', '....kkkkkk....'],
  },
  bun: {
    down: ['', '', '', '......kk......', '.....kHhk.....', '....kHhhxk....', '', '....HHHHhh....', '....Hhhhhx....', '....h....x....'],
    side: ['', '', '', '...kk.........', '..kHhk........', '..kHhxk.......', '', '....HHHHhh....', '....HHhhh.....', '....Hhx.......', '....h.........', '....hx........', '....xx........'],
    up: ['', '', '', '......kk......', '.....kHhk.....', '....kHhhxk....', '', '....HHHHhh....', '....HHhhhx....', '....Hhhhhx....', '....hhhhxx....', '....hhhxxx....', '....xxxxxx....'],
  },
  bald: {
    down: ['', '', '', '', '', '', '', '.....S........', '....x....x....', '....h....x....'],
    side: ['', '', '', '', '', '', '', '......S.......', '..............', '....hx........', '....h.........', '....hx........', '....xx........'],
    up: ['', '', '', '', '', '', '', '.....S........', '....x....x....', '....hhhhxx....', '....hhhxxx....', '....xxxxxx....'],
  },
};

const BEARDS: Record<NonNullable<NpcLook['beard']>, Tpl> = {
  stubble: {
    down: ['', '', '', '', '', '', '', '', '', '', '', '', '....zzzzzz....'],
    side: ['', '', '', '', '', '', '', '', '', '', '', '', '.....zzzzz....'],
    up: [],
  },
  mustache: {
    down: ['', '', '', '', '', '', '', '', '', '', '', '.....fFFf.....', '.....X..X.....'],
    side: ['', '', '', '', '', '', '', '', '', '', '', '........fFk...', '.........X....'],
    up: [],
  },
  full: {
    down: ['', '', '', '', '', '', '', '', '', '', '', '....fFFFFf....', '...kfFFFFfk...', '....kfFFfk....', '.....kffk.....', '......kk......'],
    side: ['', '', '', '', '', '', '', '', '', '', '....f.........', '....ffFFFf....', '....kfFFFfk...', '.....kfFfk....', '......kkk.....'],
    up: [],
  },
  long: {
    down: ['', '', '', '', '', '', '', '', '', '', '', '....fFFFFf....', '...kfFFFFfk...', '....kFFFfk....', '....kfFFfk....', '.....kFfk.....', '.....kfXk.....', '......kk......'],
    side: ['', '', '', '', '', '', '', '', '', '', '....f.........', '....ffFFFf....', '....kfFFFfk...', '.....kFFfk....', '.....kfFfk....', '......kfXk....', '.......kk.....'],
    up: [],
  },
  goatee: {
    down: ['', '', '', '', '', '', '', '', '', '', '', '.....X..X.....', '......XX......', '......kX......', '.......k......'],
    side: ['', '', '', '', '', '', '', '', '', '', '', '.........X....', '........XX....', '........kXk...', '.........k....'],
    up: [],
  },
};

const GLASSES: Tpl = {
  down: ['', '', '', '', '', '', '', '', '', '', '....kLkkLk....'],
  side: ['', '', '', '', '', '', '', '', '', '', '....kkLk......'],
  up: ['', '', '', '', '', '', '', '', '', '', '...k......k...'],
};

const EARS: Tpl = {
  down: ['', '', '', '', '', '', 'k............k', 'kSk........kzk', '.kSk......kzk.', '.kSSk....kzzk.', '..kk......kk..'],
  side: ['', '', '', '', '', '', '..k...........', '..kSk.........', '...kSk........', '...kssk.......', '....kk........'],
  up: ['', '', '', '', '', '', 'k............k', 'ksk........kzk', '.ksk......kzk.', '.kssk....kzzk.', '..kk......kk..'],
};

const HORNS: Tpl = {
  down: ['', '', '...kk....kk...', '...kNk..kNk...', '....kn..nk....'],
  side: ['', '', '.....kk..kk...', '.....kNk.kNk..', '......kn.kn...'],
  up: ['', '', '...kk....kk...', '...kNk..kNk...', '....kn..nk....'],
};

const HATS: Record<HatKind, Tpl> = {
  straw: {
    down: ['', '', '', '.....kkkk.....', '....kAAABk....', '....kAABBk....', '...kDDDDddk...', '.kkAAAAABBBkk.', 'kAAAAAABBBBBCk', '.kkCCBBBBCCkk.'],
    side: ['', '', '', '.....kkkk.....', '....kAAABk....', '....kAABBk....', '...kDDDDddk...', 'kkkAAAAABBBkkk', '.kCCBBBBBBCCk.', '..kkkkkkkkkk..'],
    up: ['', '', '', '.....kkkk.....', '....kAAABk....', '....kAABBk....', '...kDDDDddk...', '.kkAAAAABBBkk.', 'kAAAAAABBBBBCk', '.kkCCBBBBCCkk.'],
  },
  kerchief: {
    down: ['', '', '', '', '', '.....kkkk.....', '...kkAAABkk...', '..kAAAAABBBk..', '..kkBBBBCCkk..'],
    side: ['', '', '', '', '', '.....kkkk.....', '...kkAAABk....', '..kAAAAABBk...', '.kkkBBBBCCk...', 'kBCk..........', 'kCk...........', '.k............'],
    up: ['', '', '', '', '', '.....kkkk.....', '...kkAAABkk...', '..kAAAAABBBk..', '..kkBBBBCCkk..', '.....kBCk.....', '....kBkkCk....', '....kk..kk....'],
  },
  kettle: {
    down: ['', '', '', '', '.....kkkk.....', '....kAAABk....', '...kAAABBCk...', '..kkAABBBCkk..', '.kAAABBBBBCCk.', '..kkkkkkkkkk..'],
    side: ['', '', '', '', '.....kkkk.....', '....kAAABk....', '...kAAABBCk...', '..kkAABBBCkk..', 'kAAABBBBBBCCk.', '.kkkkkkkkkkkk.'],
    up: ['', '', '', '', '.....kkkk.....', '....kAAABk....', '...kAAABBCk...', '..kkAABBBCkk..', '.kAAABBBBBCCk.', '..kkkkkkkkkk..'],
  },
  cap: {
    down: ['', '', '', '', '.....kkkk.....', '....kAAABkk...', '...kAAAABkDk..', '..kAAABBBkdDk.', '..kkCCCCCkdDk.', '..........kk..'],
    side: ['', '', '', '', '.....kkkk.....', '..kkkAAABk....', '.kDDkAAABBk...', '.kDdkAABBBCk..', '.kdk.kCCCCCkk.', '..k...........'],
    up: ['', '', '', '', '.....kkkk.....', '...kkAAABk....', '..kDkAAAABk...', '.kDdkAABBBCk..', '.kDdkkCCCCkk..', '..kk..........'],
  },
  beret: {
    down: ['', '', '', '', '......kk......', '....kkBDkk....', '..kkAAAABBkk..', '.kAAAAABBBBCk.', '..kkCCCCCCkk..'],
    side: ['', '', '', '', '......kk......', '....kkBDkk....', '..kkAAAABBkk..', '.kAAAAABBBBCk.', '..kkCCCCCCkk..'],
    up: ['', '', '', '', '......kk......', '....kkBDkk....', '..kkAAAABBkk..', '.kAAAAABBBBCk.', '..kkCCCCCCkk..'],
  },
  chef: {
    down: ['', '....kkkkkk....', '...kAAAAABk...', '..kAAAAAABBk..', '..kAAAAABBBk..', '..kkBAABBBkk..', '...kAAABBBk...', '...kBBBBBCk...'],
    side: ['', '....kkkkkk....', '...kAAAAABk...', '..kAAAAAABBk..', '..kAAAAABBBk..', '..kkBAABBBkk..', '...kAAABBBk...', '...kBBBBBCk...'],
    up: ['', '....kkkkkk....', '...kAAAAABk...', '..kAAAAAABBk..', '..kAAAAABBBk..', '..kkBAABBBkk..', '...kAAABBBk...', '...kBBBBBCk...'],
  },
  wizard: {
    down: ['.........kk...', '........kABk..', '.......kAABk..', '......kAABk...', '.....kAADBk...', '....kAAABBk...', '...kDDDDDdk...', '.kkAAAAABBBkk.', '..kkCCCCCCkk..'],
    side: ['..kk..........', '..kABk........', '...kABk.......', '...kAABk......', '....kADBk.....', '....kAABBk....', '...kDDDDdk....', 'kkAAAAABBBBkk.', '.kkCCCCCCCkk..'],
    up: ['.........kk...', '........kABk..', '.......kAABk..', '......kAABk...', '.....kAABBk...', '....kAAABBk...', '...kDDDDDdk...', '.kkAAAAABBBkk.', '..kkCCCCCCkk..'],
  },
  twigs: {
    down: ['', '', '...k...k...k..', '..kAk.kAk.kBk.', '..kAkkABkkBk..', '..kDAABBBCDk..', '..kkDdkkDdkk..'],
    side: ['', '', '...k...k...k..', '..kAk.kAk.kBk.', '..kAkkABkkBk..', '..kDAABBBCDk..', '..kkDdkkDdkk..'],
    up: ['', '', '...k...k...k..', '..kBk.kAk.kAk.', '..kBkkABkkAk..', '..kDCBBBAADk..', '..kkdDkkdDkk..'],
  },
  chicken: {
    down: ['', '', '', '....k.k.k.....', '...kDkDkDk....', '...kDDDDdk....', '..kkAAAAAkk...', '..kAAAAAABBk..', '..kAAAABBBBk..', '..kAk....kBk..', '..kAk....kBk..', '..kAk....kCk..', '...kk....kk...'],
    side: ['', '', '', '...k.k.k......', '..kDkDkDk.....', '..kDDDDdk.....', '..kkAAAAkk....', '.kAAAAAABBk...', '.kAAAABBBBk...', '.kAAAk........', '.kAAk.........', '.kABk.........', '..kk..........'],
    up: ['', '', '', '....k.k.k.....', '...kDkDkDk....', '...kDDDDdk....', '..kkAAAAAkk...', '..kAAAAAABBk..', '..kAAAAABBBk..', '..kAAAABBBBk..', '..kAAABBBBCk..', '..kABBBBBBCk..', '...kkkkkkkk...'],
  },
  visor: {
    down: ['', '', '', '', '', '', '', '...kddddddk...', '..kAAAAAABBk..', '...kkBBBBkk...'],
    side: ['', '', '', '', '', '', '', '...kddddddk...', '.......kAABBk.', '........kkkk..'],
    up: ['', '', '', '', '', '', '', '...kddddddk...'],
  },
  hood: {
    down: ['', '', '', '......kk......', '.....kABk.....', '....kAABBk....', '...kAAABBBk...', '..kAAAABBBCk..', '..kAABBBBBCk..', '..kAkEEEEkCk..', '..kAk....kCk..', '..kAk....kCk..', '..kBk....kCk..', '..kkk....kkk..'],
    side: ['', '', '', '.....kk.......', '....kABk......', '...kAABBk.....', '..kAAABBBk....', '.kAAAABBBBk...', '.kAABBBBCCk...', '.kAABkEEEE....', '.kABBk........', '.kABCk........', '.kBCCk........', '..kkk.........'],
    up: ['', '', '', '......kk......', '.....kABk.....', '....kAABBk....', '...kAAABBBk...', '..kAAAABBBCk..', '..kAAABBBBCk..', '..kAABBBBBCk..', '..kAABBBBCCk..', '..kABBBBCCCk..', '..kBBBBCCCCk..', '...kkkkkkkk...'],
  },
};

/** The chicken costume's beak (and wattle). */
const BEAK_TPL: Tpl = {
  down: ['', '', '', '', '', '', '', '', '', '', '', '......Oo......', '......Rk......'],
  side: ['', '', '', '', '', '', '', '', '', '', '.........kOk..', '.........Ook..', '.........Rk...'],
  up: [],
};

// ------------------------------------------------------------------ things held, tails, packs

/*
 * Drawn without outlines (each gets one), upright, with the grip at (px, py).
 * Keys: M m N metal   B b wood   P p paper   R red   O o orb   W white   G g n stone   K dark hole
 */
interface ItemArt {
  rows: readonly string[];
  px: number;
  py: number;
  /** Nudged right (long things are held beside the face, not in front of it). */
  dx?: number;
}
const ITEMS: Record<NpcItem, ItemArt> = {
  pitchfork: { rows: ['N.N.N', 'M.M.M', 'MmMmM', '..B..', '..b..', '..B..', '..b..', '..B..', '..b..', '..B..', '..b..'], px: 2, py: 7, dx: 2 },
  spear: { rows: ['.M.', 'MMm', 'MmN', '.N.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.'], px: 1, py: 9, dx: 1 },
  lute: { rows: ['.....bb', '....bB.', '...bB..', '.BBb...', 'BBKBb..', 'BBBBb..', '.bbb...'], px: 2, py: 4 },
  map: { rows: ['PPPPp', 'PRPPp', 'PPRPp', 'ppppp'], px: 1, py: 2 },
  ladle: { rows: ['.MM.', 'MMMm', '.mm.', '..N.', '..N.', '..N.', '..N.'], px: 2, py: 5, dx: 1 },
  staff: { rows: ['BB.', '.Bb', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.'], px: 1, py: 8, dx: 1 },
  orbStaff: { rows: ['.O.', 'OWo', '.o.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.', '.B.', '.b.'], px: 1, py: 8, dx: 1 },
  rock: { rows: ['.GG.', 'GGgg', 'Ggnn'], px: 1, py: 2 },
  ledger: { rows: ['RRRP', 'RRRP', 'RRRP', 'rrrp'], px: 1, py: 2 },
  spoon: { rows: ['MM', 'Mm', '.N', '.N'], px: 1, py: 3 },
  scroll: { rows: ['bPPb', '.Pp.', '.PP.', '.pP.', 'bRPb'], px: 1, py: 3 },
};
const ITEM_COLORS: Record<string, string> = {
  M: '#eef0f6', m: '#aab2c2', N: '#6a7082', B: '#9a6a3a', b: '#62401e', P: '#f2e6c6', p: '#c4ae84', R: '#c8302a', r: '#8a1a1a',
  O: '#a8f0ff', o: '#3aa0e0', W: '#ffffff', G: '#b8b4ae', g: '#86827c', n: '#5a5652', K: '#2a1610',
};

function itemBuf(item: NpcItem): { buf: PixelBuf; px: number; py: number } {
  const it = ITEMS[item];
  const b = blank(it.rows[0].length, it.rows.length);
  it.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && setRGB(b, x, y, ITEM_COLORS[ch] ?? '#ff00ff')));
  return { buf: inkOutline(b, OUTLINE), px: it.px + 1 - (it.dx ?? 0), py: it.py + 1 };
}

/** Copies the opaque pixels of `src` at (x, y); with `under`, only where `dst` is still empty. */
function paste(dst: PixelBuf, src: PixelBuf, x: number, y: number, under = false): void {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const si = (sy * src.w + sx) * 4;
      if (!src.px[si + 3]) continue;
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const di = (dy * dst.w + dx) * 4;
      if (under && dst.px[di + 3]) continue;
      dst.px.set(src.px.subarray(si, si + 4), di);
    }
  }
}

/**
 * A demon's tail with a spade tip, as a frame-sized layer: from the hips it pokes out behind the body
 * (to the left, facing down or right) or hangs from the back (facing up), and the tip swishes.
 */
function tailLayer(L: NpcLook, f: BodyFrame, view: View, frame: number): PixelBuf {
  const ramp = L.demon!.tail;
  const swish = frame % 4 === 1 || frame % 4 === 2 ? 1 : 0;
  const hip = f.head[3] + 4;
  // Body pixels, tip first.
  const path: Array<[number, number]> =
    view === 'up'
      ? [[14 + swish, hip - 3], [14, hip - 2], [14, hip - 1], [13, hip], [12, hip + 1], [11, hip + 1], [10, hip], [10, hip - 1]]
      : [[2 - swish, hip - 5], [2 - swish, hip - 4], [2, hip - 3], [2, hip - 2], [3, hip - 1], [4, hip], [5, hip], [6, hip]];
  const b = blank(NPC_W, NPC_H);
  path.forEach(([x, y], i) => setRGB(b, x + OX, y + OY, i < 4 ? ramp[2] : ramp[1]));
  const [tx, ty] = path[0];
  for (const [x, y] of [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1]]) setRGB(b, x + OX, y + OY, ramp[2]);
  setRGB(b, tx + 1 + OX, ty + OY, ramp[1]);
  return inkOutline(b, OUTLINE);
}

function packBuf(ramp: NpcLook['pack'] & {}): PixelBuf {
  const rows = ['.wwwwww.', 'wwWWWWww', 'BBBBBBBb', 'BbbbbbBb', 'BbYYbbBb', 'BbbbbbBb', 'Bbbbbbbb', '.bbbbbb.'];
  const col: Record<string, string> = { w: '#b8a888', W: '#e8dcc0', B: ramp[2], b: ramp[1], Y: '#ffd86a' };
  const b = blank(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && setRGB(b, x, y, col[ch] ?? ramp[0])));
  return inkOutline(b, OUTLINE);
}

// ------------------------------------------------------------------ the body

function lvl(role: string, a: string, b: string): 0 | 1 | 2 {
  return role === a ? 0 : role === b ? 1 : 2;
}

/** Body colors for each mannequin role. Null: leave the pixel empty. */
function bodyColor(role: string, L: NpcLook, x: number, y: number, f: BodyFrame, view: View): string | null {
  const cx = (f.head[0] + f.head[2]) / 2;
  const top = f.head[3] + 1; // the collar row
  const p = L.panel;
  const dx = Math.abs(x - cx);
  switch (role) {
    case 'k':
      return OUTLINE;
    case 'e':
      return L.eyes ?? EYE;
    case 'h':
    case 'i':
    case 'j': {
      const k = lvl(role, 'h', 'i');
      const hairy = L.hairStyle !== 'bald' && L.hairStyle !== 'none';
      if (hairy && view === 'up') return L.hair[k];
      // From the side the back of the head is hair (a skin pixel stays between it and the eye).
      if (hairy && view === 'side' && x <= f.head[0] + 1) return L.hair[k];
      return L.skin[k];
    }
    case 't':
    case 'u':
    case 'v': {
      const k = lvl(role, 't', 'u');
      if (p) {
        const pk = k === 2 ? 1 : 0;
        switch (p.kind) {
          case 'apron':
            if (view === 'down' && y > top && dx <= 1.5) return p.ramp[pk];
            if (view === 'side' && y > top && x >= cx + 0.5 && x <= cx + 1.5) return p.ramp[pk];
            if (view === 'up' && y === top + 3 && dx <= 0.5) return p.ramp[1];
            break;
          case 'bib':
            if (view === 'down' && ((y > top && dx <= 1.5) || (y === top && dx >= 0.5 && dx <= 1.5))) return p.ramp[pk];
            if (view === 'side' && y >= top && x >= cx - 0.5 && x <= cx + 1.5) return p.ramp[pk];
            if (view === 'up' && y <= top + 2 && dx >= 0.5 && dx <= 1.5) return p.ramp[0];
            break;
          case 'vest':
            if (view === 'down' && dx >= 1.5) return p.ramp[pk];
            if (view === 'side' && x <= cx) return p.ramp[pk];
            if (view === 'up') return p.ramp[pk];
            break;
          case 'tabard':
            if (view !== 'side' && y > top && dx <= 0.5) return p.ramp[pk];
            if (view === 'side' && y > top && x >= cx + 0.5 && x <= cx + 1.5) return p.ramp[pk];
            break;
          case 'shawl':
            if (y <= top) return p.ramp[pk];
            if (y === top + 1 && (view === 'side' ? x >= cx : dx <= 1.5)) return p.ramp[pk];
            if (y === top + 2 && view !== 'side' && dx <= 0.5) return p.ramp[0];
            break;
        }
      }
      return L.shirt[k];
    }
    case 'a':
    case 'b':
    case 'c': {
      const k = lvl(role, 'a', 'b');
      if (p?.kind === 'shawl' && y <= top + (view === 'side' ? 0 : 1)) return p.ramp[k === 2 ? 1 : 0];
      return (L.sleeves ?? L.shirt)[k];
    }
    case 'l':
    case 'm':
    case 'n': {
      if (L.ghost) return null;
      const k = lvl(role, 'l', 'm');
      // The chicken costume is feathers down to the knees; then the legs are a bird's.
      if (L.beak && y === top + 4) return L.shirt[k];
      if (p && (p.kind === 'apron' || p.kind === 'bib') && y === top + 4) {
        if (view === 'down' && dx <= 1.5) return p.ramp[k === 2 ? 1 : 0];
        if (view === 'side' && p.kind === 'apron' && x >= cx + 0.5 && x <= cx + 1.5) return p.ramp[k === 2 ? 1 : 0];
      }
      if (L.dress && p?.kind === 'apron' && view === 'down' && dx <= 1.5) return p.ramp[k === 2 ? 1 : 0];
      return (L.dress ? L.shirt : L.pants)[k];
    }
    case 'f':
    case 'g':
      if (L.ghost) return null;
      return L.shoes[role === 'f' ? 0 : 1];
    default:
      return '#ff00ff';
  }
}

function stampTpl(b: PixelBuf, rows: readonly string[], x0: number, y0: number, color: (ch: string) => string | null): void {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.') continue;
      const c = color(ch);
      if (c) setRGB(b, x0 + x, y0 + y, c);
    }
  }
}

function overlayColor(ch: string, L: NpcLook): string | null {
  const hat = L.hat;
  const beard = L.beardRamp ?? L.hair;
  switch (ch) {
    case 'k':
      return OUTLINE;
    case 'A':
      return hat ? hat.ramp[2] : null;
    case 'B':
      return hat ? hat.ramp[1] : null;
    case 'C':
      return hat ? hat.ramp[0] : null;
    case 'D':
      return hat?.trim ? hat.trim[1] : hat ? hat.ramp[2] : null;
    case 'd':
      return hat?.trim ? hat.trim[0] : hat ? hat.ramp[0] : null;
    case 'H':
      return L.hair[2];
    case 'h':
      return L.hair[1];
    case 'x':
      return L.hair[0];
    case 'F':
      return beard[2];
    case 'f':
      return beard[1];
    case 'X':
      return beard[0];
    case 'S':
      return mixHex(L.skin[2], '#ffffff', 0.45);
    case 's':
      return L.skin[1];
    case 'z':
      return mixHex(L.skin[0], L.hair[0], 0.35);
    case 'N':
      return BONE[1];
    case 'n':
      return BONE[0];
    case 'E':
      return '#140a12';
    case 'L':
      return L.eyes && L.eyes !== EYE ? mixHex(L.eyes, '#ffd0c0', 0.25) : '#dff2ff';
    case 'O':
      return BEAK[1];
    case 'o':
      return BEAK[0];
    case 'R':
      return hat?.trim ? hat.trim[1] : '#e0402e';
    case 'W':
      return WHITE[1];
    case 'w':
      return WHITE[0];
    default:
      return null;
  }
}

function frameOf(anim: 'idle' | 'walk', view: View, frame: number): BodyFrame {
  const list = BODY_ANIMS[`${anim}_${view}`];
  return BODY_FRAMES[list[((frame % list.length) + list.length) % list.length]];
}

/**
 * One NPC frame, facing right in side view (flip it for left). `frame` counts up freely: the body
 * cycles through its animation and the tail and smoke drift with it. The feet are at (ax, ay).
 */
export function npcFrame(def: NpcDef, anim: 'idle' | 'walk', view: View, frame: number): { buf: PixelBuf; ax: number; ay: number } {
  const L = def.look;
  const f = frameOf(anim, view, frame);
  const b = blank(NPC_W, NPC_H);
  const hx = OX + f.head[0] - 3;
  const hy = OY + f.head[1] - 6;
  const handR: [number, number] = [OX + f.handR[0], OY + f.handR[1]];
  // --- behind the body: a tail, the pack, the thing held (from the back)
  if (L.demon?.tail && view !== 'up') paste(b, tailLayer(L, f, view, frame), -1, -1);
  if (L.pack && view !== 'up') {
    const pk = packBuf(L.pack);
    if (view === 'down') paste(b, pk, OX + Math.round((f.head[0] + f.head[2]) / 2) - 4, OY + f.head[3] - 2);
    else paste(b, pk, OX + f.head[0] - 5, OY + f.head[3]);
  }
  if (L.item && view === 'up') {
    // From behind, the thing held shows past the shoulder.
    const it = itemBuf(L.item);
    paste(b, it.buf, handR[0] - it.px + 1, handR[1] - it.py);
  }
  // --- the body
  for (let y = 0; y < f.rows.length; y++) {
    const row = f.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      // A long dress closes the gap between the legs.
      const c = bodyColor(ch, L, x, y, f, view);
      if (c) setRGB(b, x + OX, y + OY, c);
    }
  }
  if (L.dress && !L.ghost) fillSkirt(b, L, f, view);
  if (L.ghost) wisp(b, L, f, frame);
  // --- the head: hair, beard, glasses, ears, hat, horns, beak
  const col = (ch: string) => overlayColor(ch, L);
  if (L.hairStyle !== 'none') stampTpl(b, HAIR[L.hairStyle][view], hx, hy, col);
  if (L.beard) stampTpl(b, BEARDS[L.beard][view], hx, hy, col);
  if (L.glasses) stampTpl(b, GLASSES[view], hx, hy, col);
  if (L.ears) stampTpl(b, EARS[view], hx, hy, col);
  if (L.hat) stampTpl(b, HATS[L.hat.kind][view], hx, hy, col);
  if (L.demon?.horns) stampTpl(b, HORNS[view], hx, hy, col);
  if (L.beak) stampTpl(b, BEAK_TPL[view], hx, hy, col);
  // Eyes peek out of a hood's shadow.
  if (L.hat?.kind === 'hood' && view !== 'up') {
    const eye = L.eyes ?? EYE;
    if (view === 'down') {
      setRGB(b, hx + 5, hy + 10, eye);
      setRGB(b, hx + 8, hy + 10, eye);
    } else setRGB(b, hx + 6, hy + 10, eye);
  }
  // --- in front: the pack from behind, the thing held, the tail from behind
  if (L.pack && view === 'up') paste(b, packBuf(L.pack), OX + Math.round((f.head[0] + f.head[2]) / 2) - 4, OY + f.head[3] + 1);
  if (L.item && view !== 'up') {
    const it = itemBuf(L.item);
    // From the side the hand is in front of the face: long things go a pixel further out.
    const nudge = view === 'side' && ITEMS[L.item].dx ? 1 : 0;
    paste(b, it.buf, handR[0] - it.px + nudge, handR[1] - it.py + 1);
  }
  if (L.demon?.tail && view === 'up') paste(b, tailLayer(L, f, view, frame), -1, -1);
  if (L.demon?.smoke) smoke(b, hx, hy + (L.hat ? 0 : 2), frame);
  if (L.ghost) fade(b, 205);
  return { buf: b, ax: NPC_ANCHOR.x, ay: NPC_ANCHOR.y };
}

/** A dress or robe: the gap between the legs fills in and the hem flares a pixel. */
function fillSkirt(b: PixelBuf, L: NpcLook, f: BodyFrame, view: View): void {
  const legTop = f.head[3] + 5;
  for (let y = legTop; y < f.rows.length - 1; y++) {
    const row = f.rows[y];
    const first = row.search(/[lmn]/);
    const last = Math.max(row.lastIndexOf('l'), row.lastIndexOf('m'), row.lastIndexOf('n'));
    if (first < 0) continue;
    for (let x = first; x <= last; x++) {
      if (row[x] === 'k' || row[x] === '.') {
        const cx = (f.head[0] + f.head[2]) / 2;
        const apron = L.panel?.kind === 'apron' && view === 'down' && Math.abs(x - cx) <= 1.5;
        setRGB(b, x + OX, y + OY, apron ? L.panel!.ramp[0] : L.shirt[x < cx ? 1 : 0]);
      }
    }
  }
}

/** A ghost has no legs: its robe trails off in a wisp that sways. */
function wisp(b: PixelBuf, L: NpcLook, f: BodyFrame, frame: number): void {
  const y0 = OY + f.head[3] + 5;
  const cx = OX + Math.round((f.head[0] + f.head[2]) / 2);
  const sway = frame % 4 < 2 ? 0 : 1;
  const rows: Array<[number, number]> = [[cx - 3, cx + 2], [cx - 2 + sway, cx + 1 + sway], [cx - 1 + sway * 2, cx + sway * 2]];
  rows.forEach(([a, z], i) => {
    for (let x = a - 1; x <= z + 1; x++) setRGB(b, x, y0 + i, x < a || x > z ? OUTLINE : L.shirt[x <= (a + z) / 2 ? 1 : 0]);
  });
  setRGB(b, cx - 1 + sway * 2, y0 + 3, OUTLINE);
  setRGB(b, cx + sway * 2, y0 + 3, OUTLINE);
}

/** A curl of smoke from under the hat (it drifts up and right as the frames go by). */
function smoke(b: PixelBuf, hx: number, hy: number, frame: number): void {
  const t = ((frame % 4) + 4) % 4;
  const puffs: Array<[number, number, number]> = [
    [hx + 8 + (t % 2), hy + 2 - Math.floor(t / 2), 200],
    [hx + 9 + (t >= 2 ? 1 : 0), hy - t % 2, 150],
    [hx + 8 + ((t + 1) % 2), hy - 2 + (t % 2), 105],
  ];
  for (const [x, y, a] of puffs) if (y >= 0) setRGB(b, x, y, '#b8b0c4', a);
}

function fade(b: PixelBuf, alpha: number): void {
  for (let i = 3; i < b.px.length; i += 4) if (b.px[i]) b.px[i] = Math.min(b.px[i], alpha);
}

// ------------------------------------------------------------------ quest markers

/** The bubble over a quest giver: a gold "!" (a job to offer) or "?" (a job to hand back). */
export function questMarker(kind: 'offer' | 'turnIn'): PixelBuf {
  const bubble = [
    '..kkkkkk..',
    '.kWYYYYyk.',
    'kWYYYYYYyk',
    'kYYYYYYYyk',
    'kYYYYYYYyk',
    'kYYYYYYYyk',
    'kYYYYYYyok',
    'kYYYYYYyok',
    'kyYYYYyyok',
    '.koyyyyook',
    '..kkkkkkk.',
    '....kok...',
    '.....k....',
  ];
  const glyph = kind === 'offer' ? ['..##..', '..##..', '..##..', '..##..', '......', '..##..'] : ['.####.', '.#..##', '...##.', '..##..', '......', '..##..'];
  const col: Record<string, string> = { k: OUTLINE, W: '#fff6c8', Y: '#ffd84a', y: '#e8a428', o: '#a8641a', '#': '#3a1e10' };
  const b = blank(bubble[0].length, bubble.length);
  bubble.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && setRGB(b, x, y, col[ch])));
  glyph.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && setRGB(b, x + 2, y + 2, col['#'])));
  return b;
}

/**
 * The coin over Bram the Broker while extras wait for him to sell: smaller and quieter than a job's
 * bubble (there's no job to take, only gold to collect). It's the UI's own coin, the one in the purse
 * his sales fly into.
 */
export function coinMarker(): PixelBuf {
  return fromRows(UI_SM.coin!);
}
