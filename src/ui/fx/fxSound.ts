/**
 * The good-roll effects' sounds, without depending on the audio module: the effects call `fxSound`
 * at the moments sounds belong, and the app connects it with `setFxSound(fn)`. Until then it's silent.
 *
 * Names and their `level`:
 * - 'reelTick'    a cell passing a reel's payline (level 0; at most one per 40 ms), or a notch of a
 *                 rare build-up's crawl (level 1, 2, 3... climbing: play it a step higher each time).
 *                 The reveal's "1 in X" counter also ticks it as it climbs past each tier (level = that
 *                 tier's rarity index).
 * - 'reelLand'    a reel stops on its knight (level = rarity index).
 * - 'token'       a luck token lands on a reel (level = its place in that reel's chain: 0, 1, 2, 3).
 * - 'combo'       two or more reels' tokens merge into their product (level = how many reels).
 * - 'riser'       a build-up starts climbing (level = the result's rarity index); in the reveal, the knight
 *                 rising out of the dark, and the start of HYPER RARE's summoning.
 * - 'heartbeat'   each heartbeat in the reveal's dark (level = rarity index).
 * - 'revealBig', 'revealHuge', 'revealInsane'  the reveal's odds slam down (level = rarity index).
 * - 'revealHyper' HYPER RARE's burst, as the knight appears (level = rarity index).
 * - 'stamp'       a tier stamped over a reel (Legendary and up), and the reveal's title slamming in
 *                 (level = rarity index).
 *
 * The 'big' reels play all of the reel sounds; the 'mini' reels only 'token' and 'combo' (Dumpster
 * Legend's mini roller was silent otherwise). `watchRollSounds(game)` (tokenFx.ts) plays 'token', 'combo'
 * and 'riser' from the spin's clock whether or not any reels are mounted. Each token, combo and riser
 * plays once per spin, whichever of them gets there first.
 */
export type FxSound = (name: string, level?: number) => void;

export let fxSound: FxSound = () => {};

export function setFxSound(fn: FxSound): void {
  fxSound = fn;
}
