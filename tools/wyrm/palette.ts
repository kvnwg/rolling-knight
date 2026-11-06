/**
 * The Cinderwyrm's colors. The sheet is drawn in its embers (the second phase: red-gold scales with
 * plum shadows, gold horns, a white-hot glare); the game recolors it into obsidian for the first
 * phase (blue-black scales going sea-green in the light, gilded spikes, red eyes) by material.
 *
 * Every ramp is dark to light and shifts hue as it climbs: shadows lean cool (plum, ink-blue),
 * lights lean warm (gold), the way the references are lit.
 */
import { MAT } from './sdf';

export type Ramp = readonly string[];

export interface Look {
  scales: Ramp;
  belly: Ramp;
  horn: Ramp;
  membrane: Ramp;
  teeth: Ramp;
  mouth: Ramp;
  eyes: Ramp;
  trail: Ramp;
  outline: string;
}

export const EMBER: Look = {
  scales: ['#22102a', '#421634', '#6a1d35', '#952833', '#be3e2c', '#e0682b', '#f6a440'],
  belly: ['#5c2a2c', '#97492e', '#cc7c38', '#eeb85c'],
  horn: ['#4e2a16', '#835220', '#b8842e', '#e3b64c', '#fde894'],
  membrane: ['#2c1028', '#4e1932', '#7a2836', '#b0473a'],
  teeth: ['#c9b58e', '#f7eed6'],
  mouth: ['#2c0810', '#901e14', '#f6702c'],
  eyes: ['#ffb43a', '#fff6b8'],
  trail: ['#a3abbc', '#c6cbd4', '#e8e7e2'],
  outline: '#180a17',
};

export const OBSIDIAN: Look = {
  scales: ['#080a11', '#0f1820', '#162733', '#1e3843', '#2a4d55', '#3c6766', '#5e8a7e'],
  belly: ['#1b2027', '#2d383a', '#47544d', '#657664'],
  horn: ['#3e2a12', '#6e4c1a', '#a67a28', '#d6aa46', '#f6dc84'],
  membrane: ['#0b1017', '#141f29', '#1f323e', '#2e4753'],
  teeth: ['#c9b58e', '#f7eed6'],
  mouth: ['#2a0608', '#7c1410', '#e2441e'],
  eyes: ['#ff4a36', '#ffb4a2'],
  trail: ['#a3abbc', '#c6cbd4', '#e8e7e2'],
  outline: '#05070b',
};

export const MAT_NAME: Record<number, keyof Look> = {
  [MAT.scales]: 'scales',
  [MAT.belly]: 'belly',
  [MAT.horn]: 'horn',
  [MAT.membrane]: 'membrane',
  [MAT.teeth]: 'teeth',
  [MAT.mouth]: 'mouth',
  [MAT.eyes]: 'eyes',
  [MAT.trail]: 'trail',
};

export const SHADOW_HEX = '#1c1430';
export const SHADOW_ALPHA = 70;
export const FLASH_HEX = '#efe2c8';
