/**
 * The skills' pictures (the HUD's skill reel and the hero sheet's table): 10 x 10 pixel icons in the
 * UI icons' style (ink outline, light from the top left, the shared palette). Some are the UI's own
 * icons (src/render/pixel/ui.ts), some recolored, the rest drawn here. `skillIconArt` turns one into
 * an image URL (in the browser; the rows themselves are plain data, so Node tools can preview them).
 */
import type { SkillIcon } from '../core/skillbook';
import { fromRows, type Rows } from '../render/pixel/buf';
import { UI_MD } from '../render/pixel/ui';

// (Copied from px.tsx's extra icons, which that file keeps to itself.)
const SWORDS: Rows = ['kk......kk', 'k5k....k5k', '.k5k..k5k.', '..k5kk5k..', '...k55k...', '...k55k...', '..kykkyk..', '.kyk..kyk.', 'kbk....kbk', 'kk......kk'];

const DRAWN = {
  helm: [
    '..kkkkkk..',
    '.k555544k.',
    'k55544443k',
    'k54444333k',
    'kkkkkkkkkk',
    'k443kk332k',
    'k4x3kk3x2k',
    'k433kk322k',
    '.k33kk22k.',
    '..kkkkkk..',
  ],
  taunt: [
    '...kkkk...',
    'e..kYyk..e',
    '.e.kYyk.e.',
    '...kYOk...',
    'ee.kyOk.ee',
    '...kyOk...',
    '....kk....',
    '...kkkk...',
    '...kYOk...',
    '...kkkk...',
  ],
  dome: [
    '...kkkk...',
    '..kYYYyk..',
    '.kYCwCCyk.',
    '.kYwCCCOk.',
    'kYCCCCCCOk',
    'kyCCCCCCOk',
    'kyCCCCCCok',
    'kkkkkkkkkk',
    'kTtttttNnk',
    'kkkkkkkkkk',
  ],
  slashes: [
    '....k.k..k',
    '...kw.kmkw',
    '..kwmkwmkw',
    '.kwmkwmkm.',
    'kwmkwmkm..',
    'wmkwmkm...',
    'mkwmkm....',
    'kwmkm.....',
    'wmk.......',
    'mk........',
  ],
  arrow: [
    '.....kkkkk',
    '......kw5k',
    '.....k554k',
    '....kNk54k',
    '...kNk.kkk',
    '..kNk.....',
    'kkNk......',
    'kRNk......',
    'kReRk.....',
    '.kkkk.....',
  ],
  fan: [
    'kk..kk..kk',
    'k5k.k5k.5k',
    '.k4kk4kk4k',
    '..kNkNkNk.',
    '...kNNNk..',
    '....kNk...',
    '....kNk...',
    '...kRNRk..',
    '...kReRk..',
    '...kkkkk..',
  ],
  net: [
    'NTTNTTNTTN',
    't..t..t..t',
    't..t..t..t',
    'NTTNTTNTTN',
    't..t..t..t',
    't..t..t..t',
    'NTTNTTNTTN',
    't..t..t..t',
    't..t..t..t',
    'NTTNTTNTTN',
  ],
  bow: [
    '.kkk......',
    'kYyOkkk...',
    '.kkyO..k..',
    '...kyO.k..',
    'kkkkyOkkkk',
    'k5wwyOww4k',
    'kkkkyOkkkk',
    '...kyO.k..',
    '.kkyO..k..',
    'kYyOkkk...',
  ],
  pillar: [
    '...kkkk...',
    '...kwYk...',
    '...kwYk...',
    '...kwYk...',
    '..kwwYyk..',
    '..kwwYyk..',
    '.kYwwwYyk.',
    'kYYwwwYyOk',
    'kOyyyyyyok',
    '.kkkkkkkk.',
  ],
  cross: [
    '...kkkk...',
    '...kWwk...',
    'kkkkWwkkkk',
    'kWWWWwwwyk',
    'kwwwwwwwyk',
    'kkkkwwkkkk',
    '...kwyk...',
    '...kwyk...',
    '...kyOk...',
    '...kkkk...',
  ],
  wings: [
    'kk......kk',
    'kWk....kWk',
    'kWWk..kWWk',
    'kwWWkkWWwk',
    'kwWW55WWwk',
    '.kwW55Wwk.',
    '.kWWkkWWk.',
    '..kWk.kWk.',
    '..kWk.kWk.',
    '...kk..kk.',
  ],
  sun: [
    '....kk....',
    '.k..kk..k.',
    '..kkYYkk..',
    '..kYwYyk..',
    'kkYwYyyOkk',
    'kkYYyyyOkk',
    '..kyyyOk..',
    '..kkOOkk..',
    '.k..kk..k.',
    '....kk....',
  ],
  missiles: [
    '.....kkk..',
    '....kMmVk.',
    '...vkmVvk.',
    '.kkk.kkk..',
    'kMmVk.....',
    'kmVvk.kkk.',
    '.kkkvkMmVk',
    '....vkmVvk',
    '......kkk.',
    '..........',
  ],
  vortex: [
    '..kkkkkk..',
    '.kvvvvvvk.',
    'kvMMMMmvvk',
    'kMvvvvvmvk',
    'kmvMwMvmvk',
    'kmvmxwvMvk',
    'kvmvvvMvvk',
    'kvvmmmvvvk',
    '.kvvvvvvk.',
    '..kkkkkk..',
  ],
  dagger: [
    'kk........',
    'kVk.......',
    '.kVkk.....',
    '..kkYk....',
    '..kYk5k...',
    '.M.kk55k..',
    '..M..k5wk.',
    '.M.M..k54k',
    '..M.M.kk4k',
    '.......kkk',
  ],
  comet: [
    '......kkkk',
    '.....kOYyk',
    '....kOYyOk',
    '..kkOYyOk.',
    '.kN4kyOk..',
    'kNt54kk...',
    'kNt44nk...',
    'kNNnnnk...',
    '.knnnk....',
    '..kkk.....',
  ],
  spear: [
    '.......kkk',
    '......k5wk',
    '.....k554k',
    '....kN54k.',
    '...kNkkk..',
    '..kNk.....',
    '.kNk......',
    'kNk.......',
    'knk.......',
    'kk........',
  ],
  chevrons: [
    'kk...kk...',
    'kek..kek..',
    'kRek.kRek.',
    '.kRek.kRek',
    '..kRrk.kRr',
    '.kRrk.kRrk',
    'kRrk.kRrk.',
    'krk..krk..',
    'kk...kk...',
    '..........',
  ],
} as const satisfies Record<string, Rows>;

const md = (k: keyof typeof UI_MD): Rows => UI_MD[k]!;

/** Every skill picture: rows, and a recolor when it's another icon in other colors. */
export const SKILL_ART: Record<SkillIcon, { rows: Rows; recolor?: Record<string, string> }> = {
  // Guardian
  shield: { rows: md('shield') },
  helm: { rows: DRAWN.helm },
  quake: { rows: md('power') },
  taunt: { rows: DRAWN.taunt },
  dome: { rows: DRAWN.dome },
  titan: { rows: md('golem') },
  // Blade
  sword: { rows: md('sword') },
  swords: { rows: SWORDS },
  shadow: { rows: DRAWN.dagger },
  whirl: { rows: md('rebirth'), recolor: { M: 'w', m: '5', V: '3' } },
  slashes: { rows: DRAWN.slashes },
  holySword: { rows: md('sword'), recolor: { '5': 'Y', '4': 'y', w: 'w', Y: 'w', y: 'Y', O: 'O', N: 'o' } },
  // Ranger
  arrow: { rows: DRAWN.arrow },
  fan: { rows: DRAWN.fan },
  net: { rows: DRAWN.net },
  rain: { rows: md('drop'), recolor: { e: 'C', R: 'c', r: 'U' } },
  nova: { rows: md('star') },
  bow: { rows: DRAWN.bow },
  // Cleric
  heart: { rows: md('heart') },
  pillar: { rows: DRAWN.pillar },
  clover: { rows: md('clover') },
  cross: { rows: DRAWN.cross },
  wings: { rows: DRAWN.wings },
  sun: { rows: DRAWN.sun },
  // Arcanist
  missiles: { rows: DRAWN.missiles, recolor: { M: 'w', m: 'P', V: 'q', v: 'M' } },
  frost: { rows: md('gem') },
  bolt: { rows: md('bolt') },
  meteor: { rows: md('flame') },
  vortex: { rows: DRAWN.vortex },
  comet: { rows: DRAWN.comet },
  // Lancer
  spear: { rows: DRAWN.spear },
  sweep: { rows: md('rebirth'), recolor: { M: 'T', m: 't', V: 'N' } },
  target: { rows: md('target') },
  dash: { rows: md('arrowRight') },
  chevrons: { rows: DRAWN.chevrons },
  skyfall: { rows: DRAWN.comet, recolor: { O: 'y', Y: 'w', y: 'Y', N: '3', t: '4', n: '2', '5': '5', '4': '4' } },
  // Signatures
  clock: { rows: md('clock') },
};

const cache = new Map<SkillIcon, { url: string; w: number; h: number }>();

/** A skill's picture as an image URL and its size in pixels (browser only). */
export function skillIconArt(icon: SkillIcon): { url: string; w: number; h: number } {
  let a = cache.get(icon);
  if (a) return a;
  const art = SKILL_ART[icon];
  const w = Math.max(...art.rows.map((r) => r.length));
  const b = fromRows(
    art.rows.map((r) => r.padEnd(w, '.')),
    art.recolor,
  );
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(b.w, b.h);
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  a = { url: c.toDataURL(), w: b.w, h: b.h };
  cache.set(icon, a);
  return a;
}
