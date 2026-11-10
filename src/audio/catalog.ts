/**
 * Every sound by its name. The name is also its file: drop src/assets/sounds/<name>.mp3 in and the
 * recording plays in place of the synthesized placeholder (docs/SOUNDS.md, written from this list by
 * tools/soundsDoc.ts, says how). Each entry says when the sound plays, what the placeholder is, and
 * how it mixes:
 *
 *   prio  0 background (the first dropped in a crowd), 1 the fight, 2 key moments (they cut
 *         through: the rest of the fight dips under them), 3 never dropped
 *   max   most of it playing at once; gap  least time between two starts (ms)
 *   bus   'fight' (ducked under key moments), 'key' (the moments that duck it), 'legacy' (the altar,
 *         the reveal and the menus, which play as they always have)
 *   duck  the fight dips to `depth` for `hold` s under it; music  the music does
 *
 * Pure data: nothing here touches the browser.
 */
import { CLASSES } from '../core/knights';
import { SKILLS, SKILL_IDS, SKILL_TIERS, TIER_NAME, type SkillId, type SkillTier } from '../core/skillbook';

export type Bus = 'fight' | 'key' | 'legacy';
export type Group = 'Hits' | 'Knights' | 'Attacks' | 'Explosions' | 'Foes' | 'Skill roll' | 'Skills' | 'Dungeon' | 'Altar' | 'Reveal' | 'Menus';
export type Prio = 0 | 1 | 2 | 3;

export interface SoundDef {
  group: Group;
  /** When it plays. */
  when: string;
  /** What the synthesized placeholder sounds like. */
  sound: string;
  prio: Prio;
  max: number;
  gap: number;
  bus: Bus;
  duck?: readonly [depth: number, hold: number];
  music?: readonly [depth: number, hold: number];
}

/** The order the groups are listed in. */
export const GROUPS: readonly Group[] = ['Hits', 'Knights', 'Attacks', 'Explosions', 'Foes', 'Skill roll', 'Skills', 'Dungeon', 'Altar', 'Reveal', 'Menus'];

type Mix = Partial<Pick<SoundDef, 'bus' | 'duck' | 'music'>>;

function def(group: Group, when: string, sound: string, prio: Prio, max: number, gap: number, mix: Mix = {}): SoundDef {
  return { group, when, sound, prio, max, gap, bus: mix.bus ?? (prio >= 2 ? 'key' : 'fight'), ...(mix.duck ? { duck: mix.duck } : {}), ...(mix.music ? { music: mix.music } : {}) };
}

/** An altar, reveal or menu sound: played as it always was (no limits beyond its own). */
function legacy(group: Group, when: string, sound: string): SoundDef {
  return { group, when, sound, prio: 3, max: 99, gap: 0, bus: 'legacy' };
}

const UNUSED = ' (Not played by the game yet.)';

// ------------------------------------------------------------------ the fight
const FIGHT = {
  // --- foes being hit, by what they're made of
  hit_flesh: def('Hits', 'A blow lands on something of flesh: beasts, goblins, orcs, bats, the farm’s animals, casters, the demon.', 'A meaty thud: a slap, a low body, a short smack.', 1, 4, 28),
  hit_slime: def('Hits', 'A blow lands on a slime.', 'A wet squelch and a bubble.', 1, 4, 28),
  hit_bone: def('Hits', 'A blow lands on a skeleton (the humanoids of the crypt, the graveyard and the desert ruins).', 'Dry bone clacks and a hollow knock.', 1, 4, 28),
  hit_stone: def('Hits', 'A blow lands on a golem or the Stone Warden.', 'A stone knock: a dull thunk, grit and chips.', 1, 4, 28),
  hit_shell: def('Hits', 'A blow lands on a bug.', 'A chitin crunch.', 1, 4, 28),
  hit_wood: def('Hits', 'A blow lands on a plant, a pumpkin or one of the farm’s scarecrows.', 'A hollow wooden knock and a rustle.', 1, 4, 28),
  hit_ghost: def('Hits', 'A blow passes through a ghost or a wisp; a ghost lets its homing wisps go (quieter, higher).', 'An airy whoosh and a faint wail.', 1, 4, 28),
  crit: def('Hits', 'A critical hit, on top of the blow’s own sound (one auto attack in ten, most skill hits).', 'A sharp crack, a steel ring and a heavier punch.', 2, 2, 55, { duck: [0.7, 0.1] }),
  lucky_hit: def('Hits', 'A LUCKY hit (the upgrade map’s Lucky Strike).', 'A bright double ping.', 2, 1, 120),

  // --- the knights
  knight_hurt: def('Knights', 'A knight takes a hit: yours louder (the fight dips under it), your squadmates’ quieter; a heavier hit deeper and longer.', 'An armored thud, a clink and a grunt.', 2, 2, 70, { duck: [0.6, 0.16] }),
  knight_block: def('Knights', 'A knight takes a hit with a shield up (Iron Skin, Aegis, Titan’s Wrath, Rallying Taunt, the Guardian’s roll).', 'A shield clang.', 1, 2, 80),
  knight_down: def('Knights', 'A knight falls.', 'A long slide down, a heavy thud and armor clattering.', 3, 1, 250, { duck: [0.4, 0.5], music: [0.5, 0.8] }),
  knight_dodge: def('Knights', 'A plain roll: the Ranger’s, dashing at a foe (its Power Shot sounds as it looses), and a skill’s leap.', 'A cloth whoosh and a soft landing.', 0, 2, 60),
  // --- each class's dash (src/world/dash.ts)
  dash_bash: def('Knights', 'The Guardian’s dash, Shield Bash: a shield-first charge.', 'A heavy rush of air and a shield’s scrape.', 1, 2, 80),
  dash_bash_hit: def('Knights', 'A foe the Shield Bash runs into, knocked aside.', 'A shield’s clang on a body and a dull thud.', 1, 2, 60),
  dash_shot: def('Knights', 'The Ranger’s dash at a foe: the Power Shot it looses as the roll ends.', 'A heavy bowstring crack and a rising whistle.', 1, 2, 80),
  dash_snare: def('Knights', 'The Ranger’s dash away from the foes: the snare it leaves where it started.', 'A backflip’s whoosh and a trap set with a clack.', 0, 2, 80),
  snare_snap: def('Knights', 'A Ranger’s snare snapping shut on a foe.', 'Iron jaws snapping shut and a rope’s creak.', 1, 2, 80),
  dash_shadow: def('Knights', 'The Blade’s dash, Phantom Dash (Kevin’s too).', 'A dark, breathy swish.', 0, 2, 50),
  dash_bless: def('Knights', 'The Cleric’s dash, Blessed Step: the holy circle it leaves.', 'A soft whoosh into a warm chime.', 0, 2, 80),
  dash_blink: def('Knights', 'The Arcanist’s dash, Blink, and the arcane burst where it left.', 'A quick zip, a sparkle and a soft arcane pop.', 0, 2, 60),
  dash_lunge: def('Knights', 'The Lancer’s dash, Spear Lunge.', 'A fast rising rush and the spear’s sharp fwip.', 1, 2, 80),
  perfect_roll: def('Knights', 'A PERFECT! roll: a hit (a bullet, a lunge, a blast, a boulder) goes through a rolling knight, once a roll. Yours cuts through the fight; a squadmate’s is a soft chime.', 'A quick zip up into three bright bells and a sparkle (a squadmate’s: one soft bell).', 2, 1, 90, { duck: [0.8, 0.12] }),
  revive: def('Knights', 'A knight gets back up: revived, Second Wind, the end of a Rewind.', 'A rising chime.', 2, 1, 300),
  heal: def('Knights', 'HP healed (Holy Orbs, Sanctuary’s glow, Blessing): one every 0.14 s at most.', 'A soft shimmer.', 0, 1, 140),

  // --- each class's auto attack
  atk_sword: def('Attacks', 'The Blade’s Cleave.', 'A whoosh and a steel slash.', 1, 3, 40),
  atk_shield: def('Attacks', 'The Guardian’s Shield Sweep.', 'A dull metal thunk on wood.', 1, 3, 40),
  atk_spear: def('Attacks', 'The Lancer’s thrust.', 'A short, sharp fwip and the shaft’s rattle.', 1, 3, 40),
  atk_bow: def('Attacks', 'The Ranger’s Longshot; a foe archer’s dart (quieter, higher).', 'A bowstring twang and the arrow’s whistle.', 1, 3, 40),
  arrow_thunk: def('Attacks', 'An arrow or a spear strikes a foe or a wall.', 'A woody thunk.', 0, 3, 30),
  atk_arcane: def('Attacks', 'The Arcanist’s Arcane Bolt; each spark of an elite caster’s beam (quieter, higher).', 'A sparkly zap.', 1, 3, 40),
  arcane_pop: def('Attacks', 'An Arcane Bolt or a Magic Missile bursts on impact; a foe’s seed or mine bursts into its pips.', 'A magical pop.', 1, 2, 45),
  atk_holy: def('Attacks', 'The Cleric’s Holy Orb.', 'A bright holy chime.', 1, 3, 40),

  // --- explosions
  boom_small: def('Explosions', 'A small blast: a caster’s circle or a boss’s falling circle going off, Excalibur’s line, Smite’s pillar, a ring of Arrow Nova, Miracle’s light on each foe.', 'A punchy boom and a crackle.', 1, 3, 55),
  boom_big: def('Explosions', 'A big blast: a bomber blowing itself up, the demon unmasked, Excalibur’s last blast, Singularity’s burst.', 'A boom: a low thump, a roar and debris.', 2, 2, 90, { duck: [0.6, 0.2] }),
  boom_bomb: def('Explosions', 'A bomb: Kamikaze’s, Wild Magic’s fireball.', 'A pop, a boom, a fizz and debris.', 2, 2, 80, { duck: [0.7, 0.15] }),
  boom_meteor: def('Explosions', 'A meteor lands (Meteor, Meteor Storm, Wild Magic), or a Lancer comes down from Skyfall.', 'A crash, a deep thump, a rumble, debris and crackling fire.', 2, 3, 70, { duck: [0.6, 0.22] }),
  boom_slam: def('Explosions', 'A slam: a golem’s or a boss’s, an ogre’s boulder or its leap coming down, a boss landing a leap, Titan’s Wrath’s aftershocks, Snare’s net landing. (A skill’s own slam as it fires, Ground Pound’s say, is that skill’s sound.)', 'A ground thump, a rumble and gravel.', 1, 2, 70),
  shockwave: def('Explosions', 'A shockwave ring that isn’t a skill’s own: Wild Magic’s Shockwave (the upgrade map).', 'A deep whoomp.', 1, 2, 90),
  zap: def('Explosions', 'Lightning: each of Chain Lightning’s jumps on from its first foe.', 'An electric crackle and a snap.', 1, 3, 45),

  // --- foes
  death_flesh: def('Foes', 'A foe of flesh falls (an elite deeper, a boss deeper still).', 'A thud, a last breath and the body hitting the ground.', 1, 3, 40),
  death_slime: def('Foes', 'A slime pops; a slime’s lobbed glob lands (quieter, higher).', 'A wet splat and bubbles.', 1, 3, 40),
  death_bone: def('Foes', 'A skeleton falls apart.', 'Bones clattering down.', 1, 3, 40),
  death_stone: def('Foes', 'A golem or the Stone Warden crumbles.', 'A deep thump and rocks tumbling.', 1, 3, 40),
  death_shell: def('Foes', 'A bug is squashed.', 'A crunch and a squeak.', 1, 3, 40),
  death_wood: def('Foes', 'A plant, a pumpkin or a scarecrow is felled.', 'A crack and a rustle.', 1, 3, 40),
  death_ghost: def('Foes', 'A ghost fades away.', 'A fading wail.', 1, 3, 40),
  kill_chime: def('Foes', 'Each kill after the first in a wave (2.5 s or less since the last): a step up the scale each time.', 'A bell climbing the scale.', 0, 2, 60),
  mob_bite: def('Foes', 'A beast, a slime, a bug, a bat or a farm animal bites (hit or miss), or pounces or hops at a knight.', 'A snapping bite.', 0, 3, 45),
  mob_swipe: def('Foes', 'A goblin, a skeleton, an orc or a ghost swings at a knight; any foe dashes at one (a goblin’s stab, an orc’s shoulder charge, a bat’s swoop); an ogre hurls a boulder; a goblin’s knife, a skeleton’s bone or an orc’s axe is thrown (and any new kind of attack without a sound of its own).', 'A weapon whoosh.', 0, 3, 45),
  mob_shot: def('Foes', 'A foe shoots or spits: a volley’s aimed shot, fan, burst, ring or curving pair, and its spit, spores, seeds, globs, mines and pellets (bigger for three or more); a boss’s ring or fan of shots (bigger).', 'A spit and a puff.', 0, 3, 50),
  mob_cast: def('Foes', 'A caster raises its circle (its 0.5 s wind-up; the circle bursts later, as boom_small).', 'A rising magic hum ending in a whomp.', 1, 2, 120),
  mob_charge_windup: def('Foes', 'A charger (a boar, a rhino, a ram, a hog) paws the ground before it charges.', 'A snort, hooves scraping, a growl.', 1, 2, 150),
  mob_charge: def('Foes', 'A charger, or a boss, charges; a boss leaps.', 'Galloping thuds and rushing air.', 1, 2, 120),
  mob_slam_windup: def('Foes', 'A golem raises its fists before a slam, crouches to leap and slam, or heaves up a boulder to throw (the slam and the boulder coming down are boom_slam).', 'A heavy creak and a strain.', 1, 2, 150),
  mob_fuse: def('Foes', 'A bomber lights up, 0.6 s before it blows.', 'A fuse hissing, ticking faster.', 1, 2, 120),
  boss_windup: def('Foes', 'A boss winds up a move: a ring or a fan of shots, a charge, a slam, a summons, a rain of circles.', 'A deep growl.', 2, 1, 300),
  boss_summon: def('Foes', 'A boss calls up minions.', 'A dark whoosh and a drone.', 2, 1, 400),
  boss_enrage: def('Foes', 'A boss goes ENRAGED at half its HP.', 'A roar over a deep thump.', 3, 1, 1000, { duck: [0.4, 0.6], music: [0.4, 1] }),
} as const satisfies Record<string, SoundDef>;

// ------------------------------------------------------------------ the skill roll
export type LandCue = `skill_roll_land_${SkillTier}`;

/** The landing sound for a skill tier. */
export function landCue(tier: SkillTier): LandCue {
  return `skill_roll_land_${tier}`;
}

const LAND_SOUND: Record<SkillTier, string> = {
  common: 'A reel’s clunk into place.',
  uncommon: 'A clunk and a two-note chime.',
  rare: 'A clunk, a rising three-note chime and a whoosh.',
  epic: 'A slam, a chord stab and a run of bells.',
  legendary: 'A heavy impact, a brass chord, a cascade of bells and a cymbal.',
  jackpot: 'A fanfare: brass in rhythm, timpani, bells, coins and a cymbal swell.',
};

const LAND_MIX: Record<SkillTier, [Prio, number, Mix]> = {
  common: [2, 2, {}],
  uncommon: [2, 2, { duck: [0.75, 0.12] }],
  rare: [2, 2, { duck: [0.7, 0.18] }],
  epic: [2, 2, { duck: [0.6, 0.3], music: [0.6, 0.4] }],
  legendary: [3, 2, { duck: [0.5, 0.5], music: [0.4, 0.9] }],
  jackpot: [3, 1, { duck: [0.35, 1.2], music: [0.25, 1.6] }],
};

const ROLL = {
  skill_roll_start: def('Skill roll', 'A knight’s skill roll starts spinning (yours louder; your squadmates’ quieter, from where they stand).', 'A lever clack and a whirr.', 1, 3, 60, { bus: 'key' }),
  skill_roll_spin: def('Skill roll', 'Each skill passing the line as a knight’s skill reel spins: ticks that slow down as it brakes, climbing toward a rare result (with a shimmer under an Epic or better).', 'A reel tick.', 1, 12, 0, { bus: 'key' }),
  ...(Object.fromEntries(
    SKILL_TIERS.map((t) => {
      const [prio, max, mix] = LAND_MIX[t];
      const what = t === 'jackpot' ? 'the jackpot (a signature, like Rewind)' : `a ${TIER_NAME[t]} skill`;
      return [landCue(t), def('Skill roll', `A knight’s skill reel lands on ${what}; the skill’s own sound follows.`, LAND_SOUND[t], prio, max, 60, mix)];
    }),
  ) as Record<LandCue, SoundDef>),
};

// ------------------------------------------------------------------ the skills
type Snake<S extends string> = S extends `${infer H}${infer T}` ? `${H extends Lowercase<H> ? H : `_${Lowercase<H>}`}${Snake<T>}` : S;
export type SkillCue = `skill_${Snake<SkillId>}`;

/** The sound a skill makes as it fires: skill_ and its id in snake case (titansWrath: skill_titans_wrath). */
export function skillCue(id: SkillId): SkillCue {
  return `skill_${id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}` as SkillCue;
}

/** What each skill's placeholder sounds like (its later beats, its hits and blasts, sound on their own). */
const SKILL_SOUND: Record<SkillId, string> = {
  shieldSlam: 'A shield swung hard: a whoosh, a metal clang and a heavy thump.',
  ironSkin: 'Armor hardening: a clank, a metallic shimmer rising and a low hum.',
  groundPound: 'A ground-shaking thump, a rumble and gravel.',
  rallyingTaunt: 'A war shout, a drum hit and a shockwave whoomp.',
  aegis: 'A golden dome: a deep bwom, a chord swelling and a shimmer.',
  titansWrath: 'A huge quake: a rumble rising into a massive impact and a low brass stab (the aftershocks are boom_slam).',
  twinSlash: 'Two quick sword slashes, the second higher.',
  battleCry: 'A shout, a double drum hit and a rising horn.',
  shadowstep: 'A dark whoosh, a teleport zip and a stab in the back.',
  whirlwind: 'A two-second spinning swoosh loop, circling left and right.',
  thousandCuts: 'A blade drawn, then a flurry of ten slashes and a sheathe.',
  excalibur: 'A holy sword: a choir chord, a bright ring and a whoosh along the line (its blasts are boom_small and boom_big).',
  powerShot: 'A heavy twang and the arrow cracking the air.',
  fanShot: 'A fan of arrows: a strummed chord of twangs and a wide whoosh.',
  snare: 'A twang and a whistling arrow (the net is boom_slam).',
  arrowRain: 'A volley of twangs, whistles falling and two seconds of patter.',
  arrowNova: 'A flip and two rings of arrows bursting out.',
  thousandArrows: 'A huge volley: a roll of twangs, a swarm of whistles and three seconds of patter.',
  mend: 'A soft harp run up and a warm shimmer.',
  smite: 'A high bell, a holy whoosh and the light striking.',
  blessing: 'A bright chord swelling and sparkles.',
  sanctuary: 'A three-second choir pad, a low bell and sparkles.',
  guardianAngel: 'Wings beating, an angelic chord and a harp sweep.',
  miracle: 'A choir swell, a bright chord, a cascade of bells and a shimmer.',
  magicMissiles: 'Six sparkly pews in a quick volley.',
  frostNova: 'An icy crack, a cold whoosh and a crystal shimmer.',
  chainLightning: 'A big electric crackle and a buzz (each jump is zap).',
  meteor: 'A meteor’s roar falling for 0.9 s (its impact is boom_meteor).',
  singularity: 'A vortex: a low drone and a sucking whoosh rising for 2.5 s (its burst is boom_big).',
  meteorStorm: 'A rumbling roar and seven whistles falling, one onto each meteor’s landing.',
  javelin: 'A heavy throw: a whoosh and the spear’s spinning thrum.',
  sweep: 'A wide circling swoosh and the shaft’s whirr.',
  impale: 'A hard thrust and a crunch.',
  dragonLunge: 'A dragon’s growl and a rushing dash.',
  wyrmRush: 'A growl and three rushing dashes.',
  skyfall: 'A leap up and a whistle falling into the landing (boom_meteor).',
  rewind: 'Time running backwards: a falling warble, a clock ticking back and a reversed whoosh landing in the past.',
};

const BIG_SKILL: Partial<Record<SkillTier, Mix>> = {
  epic: { duck: [0.65, 0.3] },
  legendary: { duck: [0.5, 0.5], music: [0.5, 0.8] },
  jackpot: { duck: [0.4, 0.8], music: [0.35, 1] },
};

const SKILL_SOUNDS = Object.fromEntries(
  SKILL_IDS.map((id) => {
    const sk = SKILLS[id];
    const who = sk.cls ? `The ${CLASSES[sk.cls].name}’s` : 'The signature';
    return [skillCue(id), def('Skills', `${who} ${sk.name} (${TIER_NAME[sk.tier]}) fires.`, SKILL_SOUND[id], 2, 2, 100, BIG_SKILL[sk.tier] ?? {})];
  }),
) as Record<SkillCue, SoundDef>;

// ------------------------------------------------------------------ the altar, the reveal, the menus
const LEGACY = {
  // --- the dungeon
  coin: legacy('Dungeon', 'Gold picked up, the upgrade map’s repeat buys (each coin a step higher through a run of them), and paying for a roll at the tinker’s (and a free one coming back).', 'A coin’s ping.'),
  pickup: legacy('Dungeon', 'Something picked up off the floor.' + UNUSED, 'A bag’s rustle and a bell.'),
  potion: legacy('Dungeon', 'A Luck Potion picked up.', 'Three gulps, then the long jingle.'),
  xp: legacy('Dungeon', 'XP reaching a bar.' + UNUSED, 'A soft upward blip.'),
  level_up: legacy('Dungeon', 'A knight levels up (its hero sheet).', 'The jingle, the music dipping under it.'),
  portal: legacy('Dungeon', 'A floor is cleared: the portal opens; and the squad swirling into it, on its way down.', 'Rising bells and a swirling whoosh.'),
  floor_start: legacy('Dungeon', 'A new floor starts.', 'A whoosh in and a horn call.'),
  boss_warn: legacy('Dungeon', 'A boss telegraphs an attack.' + UNUSED + ' The fight plays boss_windup.', 'Two low warning blips.'),
  boss_roar: legacy('Dungeon', 'A boss floor starts.', 'A deep boom, a low brass growl and a roar.'),
  boss_down: legacy('Dungeon', 'A boss falls (the music’s victory sting carries the fanfare).', 'A boom and a shower of coins.'),
  wipe: legacy('Dungeon', 'The squad is wiped.', 'Four notes sliding down, the last one wobbling.'),
  treasure: legacy('Dungeon', 'A chest or a treasure room.' + UNUSED, 'A sparkle of bells.'),
  lock_tap: legacy('Altar', 'A tap on a new game’s sealed altar (the seal jolts); a merchant’s ware you can’t afford.', 'A heavy metal clank.'),
  lock_break: legacy('Altar', 'The altar’s seal cracks and its bindings fall off (with glow_up).', 'A ping, a crash and clatter.'),
  title_start: legacy('Dungeon', 'Setting off: down the hub’s steps into the dungeon, or the warden’s button.', 'A punchy press, a run up the chord and sparkles.'),
  rebirth: legacy('Dungeon', 'A rebirth.', 'Two pickup notes, the chord, bells and a shower of coins.'),
  // --- the altar
  reel_start: legacy('Altar', 'The altar spins (quiet when the altar isn’t on screen), and a roll at the tinker’s or the sage’s.', 'A lever clack and a short whirr.'),
  reel_tick: legacy('Altar', 'A cell clicking past an altar reel’s line (the altar on screen) or a keeper’s roll’s, and the reveal’s odds counting.', 'A tick that climbs as the reel slows.'),
  reel_creep: legacy('Altar', 'A rare find crawling the last few cells toward the line (the altar, a keeper’s roll).', 'Notches climbing a step each.'),
  reel_land: legacy('Altar', 'An altar reel or a keeper’s roll lands, heavier for rarer finds.', 'A thud and a bell.'),
  glow_up: legacy('Altar', 'A teased find’s glow climbs a tier (the altar, a keeper’s roll); the altar’s seal breaking.', 'An upward flick and two bells.'),
  rattle: legacy('Altar', 'The build-up before a reveal: the reel shakes.', 'Rattling beats with a heartbeat.'),
  riser_short: legacy('Altar', 'A teased find’s short build-up.', 'A rising tone.'),
  riser_long: legacy('Altar', 'The long build-up before a reveal (HYPER RARE’s summoning too).', 'A tone that seems to keep rising.'),
  token: legacy('Altar', 'A luck token lands, a step higher for each in a chain.', 'A leafy shimmer and a chime.'),
  respin: legacy('Altar', 'A reel spins up again after a token.', 'A quick upward whoosh.'),
  combo: legacy('Altar', 'A token combo: the reels’ numbers fly together.', 'Two glides meeting in a thump, a bell per reel.'),
  find_pop: legacy('Altar', 'An everyday find worth a little sound (Uncommon and up, as rare for your luck).', 'A quick pop and a bell in its rarity.'),
  // --- the reveal
  blackout: legacy('Reveal', 'The screen goes dark for a big find.' + UNUSED, 'A deep boom, the music dropping out.'),
  heartbeat: legacy('Reveal', 'A heartbeat in the reveal’s dark.', 'Lub-dub, higher and louder each beat.'),
  emerge: legacy('Reveal', 'The knight rising out of the dark.' + UNUSED, 'A shimmering swell.'),
  count_tick: legacy('Reveal', 'The reveal’s “1 in X” counting up.' + UNUSED, 'A tick climbing in pitch.'),
  tier_pass: legacy('Reveal', 'The count passing a rarity’s odds.' + UNUSED, 'A bright chime.'),
  slam: legacy('Reveal', 'A reveal lands (BIG, HUGE, INSANE), and an Exalted or rarer knight joining the squad.', 'A slam, a crash and a chord stab.'),
  reveal_sting: legacy('Reveal', 'The rarity sting after a reveal (one file for every rarity).', 'Bells for the commoner finds; an orchestral hit, a choir and coins from Legendary up; a fanfare from Astral up.'),
  hyper_intro: legacy('Reveal', 'HYPER RARE’s summoning.' + UNUSED, 'A swelling rumble, the long riser and an alarm.'),
  hyper_boom: legacy('Reveal', 'HYPER RARE bursts open.' + UNUSED, 'A huge boom and crash, a big chord and sparkles.'),
  firework: legacy('Reveal', 'Fireworks after an INSANE or HYPER RARE reveal.', 'A pop and a crackle.'),
  stamp: legacy('Reveal', 'A seal stamped down (a rarity stamp, NEW!), an Epic or better skill landing on the HUD, and an Epic or better roll at a keeper’s.', 'A thump, a paper slap and a small ring.'),
  // --- knights and menus
  jingle: legacy('Menus', 'A new knight joins; a lucky spin; a double roll at the tinker’s; the signature three notes.', 'Three bells up the chord.'),
  jingle_long: legacy('Menus', 'Bigger wins: a token combo, a Luck Potion, a boss down without the music’s sting.', 'Five bells up the chord.'),
  dupe: legacy('Menus', 'A repeat lands at the altar (on screen) and is kept as an extra, and the hero sheet’s mutate button.', 'A small soft pop and a swish.'),
  mutation: legacy('Menus', 'A better mutation.', 'A shimmer up and a sparkle.'),
  break_down: legacy('Menus', 'Duplicates broken into shards.', 'A crunch, glass flying, crystals tinkling down.'),
  sell: legacy('Menus', 'A knight’s extras sold at Bram the Broker’s (more coins for more of them), or a knight sold at the Warden’s.', 'A ka-ching and coins.'),
  haul: legacy('Menus', 'A big haul of gold: every extra sold at once at Bram the Broker’s (longer for more of them).', 'A ka-ching and coins pouring in.'),
  buy: legacy('Menus', 'An upgrade bought.', 'A coin, a bright arpeggio up and a sparkle.'),
  equip: legacy('Menus', 'A knight takes its place in the squad (Best squad, choosing your knight).', 'A thump and a clank, a chime climbing with its rarity.'),
  perk: legacy('Menus', 'A perk rolled at the sage’s (fuller for a Rare or Epic one).', 'A sweep up into a chord.'),
  unlock: legacy('Menus', 'Something new opens up (a special upgrade, a Legendary roll at the tinker’s).', 'A rising sparkle.'),
  collect: legacy('Menus', 'Earnings collected.' + UNUSED, 'A cascade of coins and a ka-ching.'),
  ding: legacy('Menus', 'An upgrade maxed out.', 'A bright ding.'),
  tap: legacy('Menus', 'A button press.', 'A pop, a semitone higher each tap through quick taps.'),
  panel_open: legacy('Menus', 'A panel or a talk opens.', 'A whoosh up, a wooden knock and a little bell.'),
  panel_close: legacy('Menus', 'A panel closes.', 'A whoosh down and a lower knock.'),
} as const satisfies Record<string, SoundDef>;

export type FightCue = keyof typeof FIGHT | keyof typeof ROLL | SkillCue;
export type LegacyCue = keyof typeof LEGACY;
/** Every sound's name. */
export type Cue = FightCue | LegacyCue;

export const SOUNDS: Readonly<Record<Cue, SoundDef>> = { ...FIGHT, ...ROLL, ...SKILL_SOUNDS, ...LEGACY };

/** Every sound's name, in the order the docs list them. */
export const SOUND_NAMES: readonly Cue[] = (Object.keys(SOUNDS) as Cue[]).sort((a, b) => GROUPS.indexOf(SOUNDS[a].group) - GROUPS.indexOf(SOUNDS[b].group));

export function isCue(name: string): name is Cue {
  return Object.prototype.hasOwnProperty.call(SOUNDS, name);
}

/** The sounds the fight plays (synthesized in recipes.ts), as against the altar's and the menus'. */
export function isFightCue(name: string): name is FightCue {
  return isCue(name) && SOUNDS[name].bus !== 'legacy';
}
