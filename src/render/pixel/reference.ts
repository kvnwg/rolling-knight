/** Reference sprites that set the style bar for every other sprite (see docs/PIXEL_ART.md). */
import { checkRows, fromRows, type Rows, type SheetEntry } from './buf';

export const REF_COIN: Rows = [
  '................',
  '.....kkkkkk.....',
  '...kkYYYyyykk...',
  '..kYYyyyyyyyok..',
  '..kYyyOOOOyyok..',
  '.kYyyOyyyyOyyok.',
  '.kYyOyyYYyyOyok.',
  '.kyyOyyYyyyOyok.',
  '.kyyOyyyyyyOyok.',
  '.kyyOyyyyyyOook.',
  '.kyyyOyyyyOyook.',
  '..kyyyOOOOyyok..',
  '..koyyyyyyyook..',
  '...kkooooookk...',
  '.....kkkkkk.....',
  '................',
];

export const REF_CONE: Rows = [
  '................',
  '.......kk.......',
  '......kyok......',
  '......kyOk......',
  '.....kyOOok.....',
  '.....kyOOok.....',
  '....kwwww55k....',
  '....kyOOOOok....',
  '...kyOOOOOOok...',
  '...kwwwwww55k...',
  '..kyOOOOOOOOok..',
  '..kyOOOOOOOOok..',
  '.k333333333333k.',
  '.k222222222222k.',
  '..kkkkkkkkkkkk..',
  '................',
];

export function sheet(): SheetEntry[] {
  const all: [string, Rows][] = [['coin', REF_COIN], ['traffic_cone', REF_CONE]];
  return all.map(([name, rows]) => {
    checkRows(name, rows);
    return { name, buf: fromRows(rows) };
  });
}
