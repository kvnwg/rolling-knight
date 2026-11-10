/**
 * The trailer's takes (tools/trailer/capture.cjs films one; tools/trailer/cut.cjs joins them).
 * query: the game's dev URL flags (src/dev.ts), plus &seed=N for the capture's own randomness.
 * seconds: how long the take plays. cues: at a second of the take, run this in the page (window.__dir).
 * CUT, at the bottom, is the trailer: which seconds of which takes, in order.
 */
const cast = (at, slot, skill, spin) => ({ at, run: new Function(`window.__dir.cast(${slot}, '${skill}'${spin ? `, ${spin}` : ''})`) });
const heal = (at) => ({ at, run: () => window.__dir.heal() });
/** Nobody falls in a take: the squad is topped up every other second (or every `step` seconds). */
const heals = (to, step = 2) => Array.from({ length: Math.floor(to / step) }, (_, i) => heal(1 + i * step));

module.exports = {
  // Steady play in the first place a player sees: a rare squad at the hamlet's bridge.
  hamlet: { query: '?floor=2&squad=rare&classes=blade,ranger,cleric&auto&sky=clear', seconds: 20, cues: heals(20) },
  // Gloomwood: a clearing full of foes' shots to cut and roll through.
  forest: { query: '?floor=12&squad=epic&classes=blade,arcanist,cleric&auto', seconds: 20, cues: heals(20) },
  // The tundra: Titan's Wrath from the knight you play, a Thousand Arrows behind it.
  tundra: {
    query: '?floor=17&squad=legendary&classes=guardian,arcanist,ranger&auto',
    seconds: 20,
    cues: [...heals(20), cast(4.6, 0, 'titansWrath'), cast(5.4, 2, 'thousandArrows'), cast(6.6, 1, 'meteorStorm')],
  },
  // The Grimstone Dungeon: Skyfall.
  dungeon: {
    query: '?floor=23&squad=legendary&classes=lancer,blade,cleric&auto&rebirths=2',
    seconds: 20,
    cues: [...heals(20), cast(4.8, 0, 'skyfall'), cast(5.6, 1, 'excalibur')],
  },
  // The ruins in the sun: a Thousand Arrows.
  desert: {
    query: '?floor=37&squad=mythic&classes=ranger,blade,arcanist&auto&sky=clear',
    seconds: 20,
    cues: [...heals(20, 0.5), cast(2.4, 0, 'thousandArrows')],
  },
  // The Cinderwyrm's lair in the Ember Depths: a Meteor Storm.
  wyrm: {
    query: '?floor=50&squad=eternal&classes=blade,arcanist,cleric&auto',
    seconds: 30,
    cues: [...heals(30, 0.5), cast(8.2, 1, 'meteorStorm')],
  },
  // The Prism Grotto, a Primordial squad in its cycling colours.
  grotto: { query: '?floor=52&squad=primordial&classes=lancer,arcanist,ranger&auto&rebirths=2', seconds: 22, cues: heals(22) },
  // Rook, the black knight, to the blow that fells him.
  rook: {
    query: '?floor=25&squad=legendary&classes=blade,ranger,cleric&auto',
    seconds: 30,
    cues: [...heals(30), cast(11.4, 0, 'excalibur'), cast(12.6, 1, 'thousandArrows')],
  },
  // What the game is named for: the altar lands a find, and the screen is its.
  reveal: {
    query: '?floor=8&squad=epic&classes=blade,ranger,cleric&camp&hub',
    seconds: 14,
    cues: [{ at: 0.5, run: () => window.__dir.reveal('mythic-arcanist', 25000, 'insane') }],
  },
};

/**
 * The trailer: these seconds of these takes, in this order (19.5 s of play; with the cover it opens
 * on, 19.8 s). Steady play first, then a place and a fight every two seconds: four legendary skills
 * (Titan's Wrath, Skyfall, a Meteor Storm, Excalibur), the altar's reveal in the middle, eight
 * places, two bosses, and the last of them falling to end on.
 */
module.exports.CUT = [
  ['hamlet', 3.7, 6.6],
  ['forest', 11.2, 13.2],
  ['tundra', 4.9, 7.3],
  ['dungeon', 5.5, 7.5],
  ['reveal', 5.7, 7.6],
  ['desert', 5.3, 6.9],
  ['wyrm', 10.3, 12.5],
  ['grotto', 11.9, 13.5],
  ['rook', 12.0, 14.0],
  ['rook', 16.3, 17.2],
];
