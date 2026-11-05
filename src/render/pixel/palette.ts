/**
 * The one palette every pixel sprite is drawn with. Sprites are rows of single characters:
 * each character is a key below, and '.' is transparent. Ramps run dark > mid > light, with the
 * light source at the top left. See docs/PIXEL_ART.md for the style rules.
 */
export const PAL = {
  // Line work and neutrals
  k: '#1a1326', // ink: every outline
  x: '#2c2236', // deep shadow, inner lines
  '1': '#3e3a4e', // gray, darkest
  '2': '#5b5870',
  '3': '#7f7c94',
  '4': '#a7a5b8',
  '5': '#cfcedb', // gray, lightest
  w: '#ffffff', // white
  W: '#f4efe1', // cream
  // Browns, wood, fur, cardboard
  b: '#3b2420', // dark brown
  n: '#6a3b2a', // brown
  N: '#995b3a', // mid brown
  t: '#c98d5a', // tan
  T: '#ecc596', // light tan
  // Skin (people)
  S: '#c9845e', // skin shadow
  s: '#f2b48c', // skin
  // Reds and pinks
  r: '#7d1d2c', // dark red
  R: '#c8323a', // red
  e: '#ee6150', // light red / coral
  P: '#ffa5a5', // pink
  q: '#e15a99', // hot pink
  // Oranges and yellows
  o: '#b8501c', // dark orange
  O: '#ef8a22', // orange
  y: '#f5c638', // yellow / gold
  Y: '#fff28c', // light yellow
  // Greens
  g: '#1f4f3a', // dark green
  G: '#2f8a45', // green
  l: '#5dc14c', // light green
  L: '#b0ec6c', // lime
  // Blues and teals
  u: '#1e2a5c', // navy
  U: '#2f56a6', // blue
  c: '#3fa1e3', // sky blue
  C: '#9edcf7', // light blue
  a: '#2fb9a9', // teal
  A: '#9cf2df', // light aqua
  // Purples
  v: '#3f2766', // dark purple
  V: '#7546b8', // purple
  m: '#ae7ee6', // light purple
  M: '#e5cfff', // lilac
} as const;

export type PalKey = keyof typeof PAL;

/**
 * The raccoon hero's outline brown. Every character in the game is outlined in exactly this color
 * (hand-drawn enemies draw their outlines with it; pack sprites' outlines are recolored to it).
 */
export const CHARACTER_OUTLINE = '#32282b';

/** Ramps (dark, mid, light) for shading by hand or recoloring. */
export const RAMPS = {
  gray: ['2', '3', '4'],
  grayLight: ['3', '4', '5'],
  brown: ['n', 'N', 't'],
  wood: ['b', 'n', 'N'],
  tan: ['N', 't', 'T'],
  skin: ['S', 's', 'T'],
  red: ['r', 'R', 'e'],
  pink: ['q', 'P', 'w'],
  orange: ['o', 'O', 'y'],
  gold: ['O', 'y', 'Y'],
  green: ['g', 'G', 'l'],
  lime: ['G', 'l', 'L'],
  blue: ['u', 'U', 'c'],
  sky: ['U', 'c', 'C'],
  teal: ['g', 'a', 'A'],
  purple: ['v', 'V', 'm'],
  lilac: ['V', 'm', 'M'],
} as const satisfies Record<string, readonly [PalKey, PalKey, PalKey]>;
