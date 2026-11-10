# Sounds

Every sound in the game, by name. The synthesized ones are placeholders: each plays until a recording of its name replaces it.
This file is written from `src/audio/catalog.ts` by `npx tsx tools/soundsDoc.ts` (a test checks they agree).

## Replacing a sound

1. Name the file after the sound: `<name>.mp3`, the name exactly as in the tables below (for example `hit_slime.mp3`, `boom_big.mp3`, `skill_roll_land_epic.mp3`, `skill_whirlwind.mp3`).
2. Put it in `src/assets/sounds/`. Any name in the tables works; nothing else needs to change. Reload the page (restart `npm run dev` if it doesn’t pick it up).
3. Format: MP3, mono or stereo, 44.1 or 48 kHz, trimmed close at the start (a little leading silence is skipped). Keep fight sounds short: the length is how long the mix counts it as playing.
4. Loudness: add `"<name>": <gain>` to `src/assets/sounds/levels.json` (the gain the recording plays at, 1 = as recorded). Without an entry it is brought to about the loudness of the placeholder (its peak to 0.3). Turn it down until it sits with the sounds around it; the existing entries run from 0.02 to 0.5.

A recording plays with the same mix as its placeholder: where it happened (quieter far from your knight, panned toward its side), a small random change in level and pitch on every play (so repeats don’t machine-gun), lower for bigger foes, and the same limits and priority. Remove the file to get the placeholder back.

**Mix**: *background* sounds are dropped first in a crowded fight, then *fight* sounds; *key* moments cut through: they play on their own bus and duck the rest of the fight under them for a moment (the biggest dip the music too); *always* sounds are never dropped. “N at once” is how many of that sound can ring together; “ms apart” the least time between two starting. Several of one sound in the same frame play once, a little louder. The everyday fight sits under the music at the default volumes; the Sound slider (0 is silence) sets all of it.

159 sounds.

## Hits

A foe being hit, by what it is made of (as the art draws it), and the crits on top.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `hit_flesh` | A blow lands on something of flesh: beasts, goblins, orcs, bats, the farm’s animals, casters, the demon. | A meaty thud: a slap, a low body, a short smack. | fight, 4 at once, 28 ms apart |
| `hit_slime` | A blow lands on a slime. | A wet squelch and a bubble. | fight, 4 at once, 28 ms apart |
| `hit_bone` | A blow lands on a skeleton (the humanoids of the crypt, the graveyard and the desert ruins). | Dry bone clacks and a hollow knock. | fight, 4 at once, 28 ms apart |
| `hit_stone` | A blow lands on a golem or the Stone Warden. | A stone knock: a dull thunk, grit and chips. | fight, 4 at once, 28 ms apart |
| `hit_shell` | A blow lands on a bug. | A chitin crunch. | fight, 4 at once, 28 ms apart |
| `hit_wood` | A blow lands on a plant, a pumpkin or one of the farm’s scarecrows. | A hollow wooden knock and a rustle. | fight, 4 at once, 28 ms apart |
| `hit_ghost` | A blow passes through a ghost or a wisp; a ghost lets its homing wisps go (quieter, higher). | An airy whoosh and a faint wail. | fight, 4 at once, 28 ms apart |
| `crit` | A critical hit, on top of the blow’s own sound (one auto attack in ten, most skill hits). | A sharp crack, a steel ring and a heavier punch. | key, 2 at once, 55 ms apart, ducks the fight to 70% |
| `lucky_hit` | A LUCKY hit (the upgrade map’s Lucky Strike). | A bright double ping. | key, 1 at once, 120 ms apart |

## Knights

Your squad.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `knight_hurt` | A knight takes a hit: yours louder (the fight dips under it), your squadmates’ quieter; a heavier hit deeper and longer. | An armored thud, a clink and a grunt. | key, 2 at once, 70 ms apart, ducks the fight to 60% |
| `knight_block` | A knight takes a hit with a shield up (Iron Skin, Aegis, Titan’s Wrath, Rallying Taunt, the Guardian’s roll). | A shield clang. | fight, 2 at once, 80 ms apart |
| `knight_down` | A knight falls. | A long slide down, a heavy thud and armor clattering. | always, 1 at once, 250 ms apart, ducks the fight to 40%, dips the music |
| `knight_dodge` | A plain roll: the Ranger’s, dashing at a foe (its Power Shot sounds as it looses), and a skill’s leap. | A cloth whoosh and a soft landing. | background, 2 at once, 60 ms apart |
| `dash_bash` | The Guardian’s dash, Shield Bash: a shield-first charge. | A heavy rush of air and a shield’s scrape. | fight, 2 at once, 80 ms apart |
| `dash_bash_hit` | A foe the Shield Bash runs into, knocked aside. | A shield’s clang on a body and a dull thud. | fight, 2 at once, 60 ms apart |
| `dash_shot` | The Ranger’s dash at a foe: the Power Shot it looses as the roll ends. | A heavy bowstring crack and a rising whistle. | fight, 2 at once, 80 ms apart |
| `dash_snare` | The Ranger’s dash away from the foes: the snare it leaves where it started. | A backflip’s whoosh and a trap set with a clack. | background, 2 at once, 80 ms apart |
| `snare_snap` | A Ranger’s snare snapping shut on a foe. | Iron jaws snapping shut and a rope’s creak. | fight, 2 at once, 80 ms apart |
| `dash_shadow` | The Blade’s dash, Phantom Dash (Kevin’s too). | A dark, breathy swish. | background, 2 at once, 50 ms apart |
| `dash_bless` | The Cleric’s dash, Blessed Step: the holy circle it leaves. | A soft whoosh into a warm chime. | background, 2 at once, 80 ms apart |
| `dash_blink` | The Arcanist’s dash, Blink, and the arcane burst where it left. | A quick zip, a sparkle and a soft arcane pop. | background, 2 at once, 60 ms apart |
| `dash_lunge` | The Lancer’s dash, Spear Lunge. | A fast rising rush and the spear’s sharp fwip. | fight, 2 at once, 80 ms apart |
| `perfect_roll` | A PERFECT! roll: a hit (a bullet, a lunge, a blast, a boulder) goes through a rolling knight, once a roll. Yours cuts through the fight; a squadmate’s is a soft chime. | A quick zip up into three bright bells and a sparkle (a squadmate’s: one soft bell). | key, 1 at once, 90 ms apart, ducks the fight to 80% |
| `revive` | A knight gets back up: revived, Second Wind, the end of a Rewind. | A rising chime. | key, 1 at once, 300 ms apart |
| `heal` | HP healed (Holy Orbs, Sanctuary’s glow, Blessing): one every 0.14 s at most. | A soft shimmer. | background, 1 at once, 140 ms apart |

## Attacks

Each class’s auto attack, and where its shots land.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `atk_sword` | The Blade’s Cleave. | A whoosh and a steel slash. | fight, 3 at once, 40 ms apart |
| `atk_shield` | The Guardian’s Shield Sweep. | A dull metal thunk on wood. | fight, 3 at once, 40 ms apart |
| `atk_spear` | The Lancer’s thrust. | A short, sharp fwip and the shaft’s rattle. | fight, 3 at once, 40 ms apart |
| `atk_bow` | The Ranger’s Longshot; a foe archer’s dart (quieter, higher). | A bowstring twang and the arrow’s whistle. | fight, 3 at once, 40 ms apart |
| `arrow_thunk` | An arrow or a spear strikes a foe or a wall. | A woody thunk. | background, 3 at once, 30 ms apart |
| `atk_arcane` | The Arcanist’s Arcane Bolt; each spark of an elite caster’s beam (quieter, higher). | A sparkly zap. | fight, 3 at once, 40 ms apart |
| `arcane_pop` | An Arcane Bolt or a Magic Missile bursts on impact; a foe’s seed or mine bursts into its pips. | A magical pop. | fight, 2 at once, 45 ms apart |
| `atk_holy` | The Cleric’s Holy Orb. | A bright holy chime. | fight, 3 at once, 40 ms apart |

## Explosions

Blasts by kind and size: the boom carries a low thump (with a soft clip, for phone speakers) and debris.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `boom_small` | A small blast: a caster’s circle or a boss’s falling circle going off, Excalibur’s line, Smite’s pillar, a ring of Arrow Nova, Miracle’s light on each foe. | A punchy boom and a crackle. | fight, 3 at once, 55 ms apart |
| `boom_big` | A big blast: a bomber blowing itself up, the demon unmasked, Excalibur’s last blast, Singularity’s burst. | A boom: a low thump, a roar and debris. | key, 2 at once, 90 ms apart, ducks the fight to 60% |
| `boom_bomb` | A bomb: Kamikaze’s, Wild Magic’s fireball. | A pop, a boom, a fizz and debris. | key, 2 at once, 80 ms apart, ducks the fight to 70% |
| `boom_meteor` | A meteor lands (Meteor, Meteor Storm, Wild Magic), or a Lancer comes down from Skyfall. | A crash, a deep thump, a rumble, debris and crackling fire. | key, 3 at once, 70 ms apart, ducks the fight to 60% |
| `boom_slam` | A slam: a golem’s or a boss’s, an ogre’s boulder or its leap coming down, a boss landing a leap, Titan’s Wrath’s aftershocks, Snare’s net landing. (A skill’s own slam as it fires, Ground Pound’s say, is that skill’s sound.) | A ground thump, a rumble and gravel. | fight, 2 at once, 70 ms apart |
| `shockwave` | A shockwave ring that isn’t a skill’s own: Wild Magic’s Shockwave (the upgrade map). | A deep whoomp. | fight, 2 at once, 90 ms apart |
| `zap` | Lightning: each of Chain Lightning’s jumps on from its first foe. | An electric crackle and a snap. | fight, 3 at once, 45 ms apart |

## Foes

Foes falling and attacking: their wind-ups (the telegraph to dodge by) and their moves going off.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `death_flesh` | A foe of flesh falls (an elite deeper, a boss deeper still). | A thud, a last breath and the body hitting the ground. | fight, 3 at once, 40 ms apart |
| `death_slime` | A slime pops; a slime’s lobbed glob lands (quieter, higher). | A wet splat and bubbles. | fight, 3 at once, 40 ms apart |
| `death_bone` | A skeleton falls apart. | Bones clattering down. | fight, 3 at once, 40 ms apart |
| `death_stone` | A golem or the Stone Warden crumbles. | A deep thump and rocks tumbling. | fight, 3 at once, 40 ms apart |
| `death_shell` | A bug is squashed. | A crunch and a squeak. | fight, 3 at once, 40 ms apart |
| `death_wood` | A plant, a pumpkin or a scarecrow is felled. | A crack and a rustle. | fight, 3 at once, 40 ms apart |
| `death_ghost` | A ghost fades away. | A fading wail. | fight, 3 at once, 40 ms apart |
| `kill_chime` | Each kill after the first in a wave (2.5 s or less since the last): a step up the scale each time. | A bell climbing the scale. | background, 2 at once, 60 ms apart |
| `mob_bite` | A beast, a slime, a bug, a bat or a farm animal bites (hit or miss), or pounces or hops at a knight. | A snapping bite. | background, 3 at once, 45 ms apart |
| `mob_swipe` | A goblin, a skeleton, an orc or a ghost swings at a knight; any foe dashes at one (a goblin’s stab, an orc’s shoulder charge, a bat’s swoop); an ogre hurls a boulder; a goblin’s knife, a skeleton’s bone or an orc’s axe is thrown (and any new kind of attack without a sound of its own). | A weapon whoosh. | background, 3 at once, 45 ms apart |
| `mob_shot` | A foe shoots or spits: a volley’s aimed shot, fan, burst, ring or curving pair, and its spit, spores, seeds, globs, mines and pellets (bigger for three or more); a boss’s ring or fan of shots (bigger). | A spit and a puff. | background, 3 at once, 50 ms apart |
| `mob_cast` | A caster raises its circle (its 0.5 s wind-up; the circle bursts later, as boom_small). | A rising magic hum ending in a whomp. | fight, 2 at once, 120 ms apart |
| `mob_charge_windup` | A charger (a boar, a rhino, a ram, a hog) paws the ground before it charges. | A snort, hooves scraping, a growl. | fight, 2 at once, 150 ms apart |
| `mob_charge` | A charger, or a boss, charges; a boss leaps. | Galloping thuds and rushing air. | fight, 2 at once, 120 ms apart |
| `mob_slam_windup` | A golem raises its fists before a slam, crouches to leap and slam, or heaves up a boulder to throw (the slam and the boulder coming down are boom_slam). | A heavy creak and a strain. | fight, 2 at once, 150 ms apart |
| `mob_fuse` | A bomber lights up, 0.6 s before it blows. | A fuse hissing, ticking faster. | fight, 2 at once, 120 ms apart |
| `boss_windup` | A boss winds up a move: a ring or a fan of shots, a charge, a slam, a summons, a rain of circles. | A deep growl. | key, 1 at once, 300 ms apart |
| `boss_summon` | A boss calls up minions. | A dark whoosh and a drone. | key, 1 at once, 400 ms apart |
| `boss_enrage` | A boss goes ENRAGED at half its HP. | A roar over a deep thump. | always, 1 at once, 1000 ms apart, ducks the fight to 40%, dips the music |

## Skill roll

A knight’s skill reel: every knight’s, yours loudest, each from where it stands.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `skill_roll_start` | A knight’s skill roll starts spinning (yours louder; your squadmates’ quieter, from where they stand). | A lever clack and a whirr. | fight, 3 at once, 60 ms apart |
| `skill_roll_spin` | Each skill passing the line as a knight’s skill reel spins: ticks that slow down as it brakes, climbing toward a rare result (with a shimmer under an Epic or better). | A reel tick. | fight, 12 at once |
| `skill_roll_land_common` | A knight’s skill reel lands on a Common skill; the skill’s own sound follows. | A reel’s clunk into place. | key, 2 at once, 60 ms apart |
| `skill_roll_land_uncommon` | A knight’s skill reel lands on a Uncommon skill; the skill’s own sound follows. | A clunk and a two-note chime. | key, 2 at once, 60 ms apart, ducks the fight to 75% |
| `skill_roll_land_rare` | A knight’s skill reel lands on a Rare skill; the skill’s own sound follows. | A clunk, a rising three-note chime and a whoosh. | key, 2 at once, 60 ms apart, ducks the fight to 70% |
| `skill_roll_land_epic` | A knight’s skill reel lands on a Epic skill; the skill’s own sound follows. | A slam, a chord stab and a run of bells. | key, 2 at once, 60 ms apart, ducks the fight to 60%, dips the music |
| `skill_roll_land_legendary` | A knight’s skill reel lands on a Legendary skill; the skill’s own sound follows. | A heavy impact, a brass chord, a cascade of bells and a cymbal. | always, 2 at once, 60 ms apart, ducks the fight to 50%, dips the music |
| `skill_roll_land_jackpot` | A knight’s skill reel lands on the jackpot (a signature, like Rewind); the skill’s own sound follows. | A fanfare: brass in rhythm, timpani, bells, coins and a cymbal swell. | always, 1 at once, 60 ms apart, ducks the fight to 35%, dips the music |

## Skills

Each skill’s own sound as it fires, after the reel lands. Its hits, blasts and later beats sound on their own (through the rows above).

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `skill_shield_slam` | The Guardian’s Shield Slam (Common) fires. | A shield swung hard: a whoosh, a metal clang and a heavy thump. | key, 2 at once, 100 ms apart |
| `skill_iron_skin` | The Guardian’s Iron Skin (Common) fires. | Armor hardening: a clank, a metallic shimmer rising and a low hum. | key, 2 at once, 100 ms apart |
| `skill_ground_pound` | The Guardian’s Ground Pound (Uncommon) fires. | A ground-shaking thump, a rumble and gravel. | key, 2 at once, 100 ms apart |
| `skill_rallying_taunt` | The Guardian’s Rallying Taunt (Rare) fires. | A war shout, a drum hit and a shockwave whoomp. | key, 2 at once, 100 ms apart |
| `skill_aegis` | The Guardian’s Aegis (Epic) fires. | A golden dome: a deep bwom, a chord swelling and a shimmer. | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_titans_wrath` | The Guardian’s Titan's Wrath (Legendary) fires. | A huge quake: a rumble rising into a massive impact and a low brass stab (the aftershocks are boom_slam). | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_twin_slash` | The Blade’s Twin Slash (Common) fires. | Two quick sword slashes, the second higher. | key, 2 at once, 100 ms apart |
| `skill_battle_cry` | The Blade’s Battle Cry (Common) fires. | A shout, a double drum hit and a rising horn. | key, 2 at once, 100 ms apart |
| `skill_shadowstep` | The Blade’s Shadowstep (Uncommon) fires. | A dark whoosh, a teleport zip and a stab in the back. | key, 2 at once, 100 ms apart |
| `skill_whirlwind` | The Blade’s Whirlwind (Rare) fires. | A two-second spinning swoosh loop, circling left and right. | key, 2 at once, 100 ms apart |
| `skill_thousand_cuts` | The Blade’s Thousand Cuts (Epic) fires. | A blade drawn, then a flurry of ten slashes and a sheathe. | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_excalibur` | The Blade’s Excalibur (Legendary) fires. | A holy sword: a choir chord, a bright ring and a whoosh along the line (its blasts are boom_small and boom_big). | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_power_shot` | The Ranger’s Power Shot (Common) fires. | A heavy twang and the arrow cracking the air. | key, 2 at once, 100 ms apart |
| `skill_fan_shot` | The Ranger’s Fan of Arrows (Common) fires. | A fan of arrows: a strummed chord of twangs and a wide whoosh. | key, 2 at once, 100 ms apart |
| `skill_snare` | The Ranger’s Snare Shot (Uncommon) fires. | A twang and a whistling arrow (the net is boom_slam). | key, 2 at once, 100 ms apart |
| `skill_arrow_rain` | The Ranger’s Arrow Rain (Rare) fires. | A volley of twangs, whistles falling and two seconds of patter. | key, 2 at once, 100 ms apart |
| `skill_arrow_nova` | The Ranger’s Arrow Nova (Epic) fires. | A flip and two rings of arrows bursting out. | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_thousand_arrows` | The Ranger’s Thousand Arrows (Legendary) fires. | A huge volley: a roll of twangs, a swarm of whistles and three seconds of patter. | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_mend` | The Cleric’s Mend (Common) fires. | A soft harp run up and a warm shimmer. | key, 2 at once, 100 ms apart |
| `skill_smite` | The Cleric’s Smite (Common) fires. | A high bell, a holy whoosh and the light striking. | key, 2 at once, 100 ms apart |
| `skill_blessing` | The Cleric’s Blessing (Uncommon) fires. | A bright chord swelling and sparkles. | key, 2 at once, 100 ms apart |
| `skill_sanctuary` | The Cleric’s Sanctuary (Rare) fires. | A three-second choir pad, a low bell and sparkles. | key, 2 at once, 100 ms apart |
| `skill_guardian_angel` | The Cleric’s Guardian Angel (Epic) fires. | Wings beating, an angelic chord and a harp sweep. | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_miracle` | The Cleric’s Miracle (Legendary) fires. | A choir swell, a bright chord, a cascade of bells and a shimmer. | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_magic_missiles` | The Arcanist’s Magic Missiles (Common) fires. | Six sparkly pews in a quick volley. | key, 2 at once, 100 ms apart |
| `skill_frost_nova` | The Arcanist’s Frost Nova (Common) fires. | An icy crack, a cold whoosh and a crystal shimmer. | key, 2 at once, 100 ms apart |
| `skill_chain_lightning` | The Arcanist’s Chain Lightning (Uncommon) fires. | A big electric crackle and a buzz (each jump is zap). | key, 2 at once, 100 ms apart |
| `skill_meteor` | The Arcanist’s Meteor (Rare) fires. | A meteor’s roar falling for 0.9 s (its impact is boom_meteor). | key, 2 at once, 100 ms apart |
| `skill_singularity` | The Arcanist’s Singularity (Epic) fires. | A vortex: a low drone and a sucking whoosh rising for 2.5 s (its burst is boom_big). | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_meteor_storm` | The Arcanist’s Meteor Storm (Legendary) fires. | A rumbling roar and seven whistles falling, one onto each meteor’s landing. | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_javelin` | The Lancer’s Javelin (Common) fires. | A heavy throw: a whoosh and the spear’s spinning thrum. | key, 2 at once, 100 ms apart |
| `skill_sweep` | The Lancer’s Sweep (Common) fires. | A wide circling swoosh and the shaft’s whirr. | key, 2 at once, 100 ms apart |
| `skill_impale` | The Lancer’s Impale (Uncommon) fires. | A hard thrust and a crunch. | key, 2 at once, 100 ms apart |
| `skill_dragon_lunge` | The Lancer’s Dragon Lunge (Rare) fires. | A dragon’s growl and a rushing dash. | key, 2 at once, 100 ms apart |
| `skill_wyrm_rush` | The Lancer’s Wyrm Rush (Epic) fires. | A growl and three rushing dashes. | key, 2 at once, 100 ms apart, ducks the fight to 65% |
| `skill_skyfall` | The Lancer’s Skyfall (Legendary) fires. | A leap up and a whistle falling into the landing (boom_meteor). | key, 2 at once, 100 ms apart, ducks the fight to 50%, dips the music |
| `skill_rewind` | The signature Rewind (Jackpot) fires. | Time running backwards: a falling warble, a clock ticking back and a reversed whoosh landing in the past. | key, 2 at once, 100 ms apart, ducks the fight to 40%, dips the music |

## Dungeon

Older sounds (from Dumpster Legend), played as they always were.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `coin` | Gold picked up, the upgrade map’s repeat buys (each coin a step higher through a run of them), and paying for a roll at the tinker’s (and a free one coming back). | A coin’s ping. | — |
| `pickup` | Something picked up off the floor. (Not played by the game yet.) | A bag’s rustle and a bell. | — |
| `potion` | A Luck Potion picked up. | Three gulps, then the long jingle. | — |
| `xp` | XP reaching a bar. (Not played by the game yet.) | A soft upward blip. | — |
| `level_up` | A knight levels up (its hero sheet). | The jingle, the music dipping under it. | — |
| `portal` | A floor is cleared: the portal opens; and the squad swirling into it, on its way down. | Rising bells and a swirling whoosh. | — |
| `floor_start` | A new floor starts. | A whoosh in and a horn call. | — |
| `boss_warn` | A boss telegraphs an attack. (Not played by the game yet.) The fight plays boss_windup. | Two low warning blips. | — |
| `boss_roar` | A boss floor starts. | A deep boom, a low brass growl and a roar. | — |
| `boss_down` | A boss falls (the music’s victory sting carries the fanfare). | A boom and a shower of coins. | — |
| `wipe` | The squad is wiped. | Four notes sliding down, the last one wobbling. | — |
| `treasure` | A chest or a treasure room. (Not played by the game yet.) | A sparkle of bells. | — |
| `title_start` | Setting off: down the hub’s steps into the dungeon, or the warden’s button. Recorded (`title_start.mp3`, gain 0.164). | A punchy press, a run up the chord and sparkles. | — |
| `rebirth` | A rebirth. | Two pickup notes, the chord, bells and a shower of coins. | — |

## Altar

The Summoning Altar.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `lock_tap` | A tap on a new game’s sealed altar (the seal jolts); a merchant’s ware you can’t afford. Recorded (`lock_tap.mp3`, gain 0.384). | A heavy metal clank. | — |
| `lock_break` | The altar’s seal cracks and its bindings fall off (with glow_up). Recorded (`lock_break.mp3`, gain 0.496). | A ping, a crash and clatter. | — |
| `reel_start` | The altar spins (quiet when the altar isn’t on screen), and a roll at the tinker’s or the sage’s. | A lever clack and a short whirr. | — |
| `reel_tick` | A cell clicking past an altar reel’s line (the altar on screen) or a keeper’s roll’s, and the reveal’s odds counting. | A tick that climbs as the reel slows. | — |
| `reel_creep` | A rare find crawling the last few cells toward the line (the altar, a keeper’s roll). Recorded (`reel_creep.mp3`, gain 0.1). | Notches climbing a step each. | — |
| `reel_land` | An altar reel or a keeper’s roll lands, heavier for rarer finds. Recorded (`reel_land.mp3`, gain 0.018). | A thud and a bell. | — |
| `glow_up` | A teased find’s glow climbs a tier (the altar, a keeper’s roll); the altar’s seal breaking. Recorded (`glow_up.mp3`, gain 0.06). | An upward flick and two bells. | — |
| `rattle` | The build-up before a reveal: the reel shakes. Recorded (`rattle.mp3`, gain 0.113). | Rattling beats with a heartbeat. | — |
| `riser_short` | A teased find’s short build-up. Recorded (`riser_short.mp3`, gain 0.064). | A rising tone. | — |
| `riser_long` | The long build-up before a reveal (HYPER RARE’s summoning too). Recorded (`riser_long.mp3`, gain 0.114). | A tone that seems to keep rising. | — |
| `token` | A luck token lands, a step higher for each in a chain. Recorded (`token.mp3`, gain 0.102). | A leafy shimmer and a chime. | — |
| `respin` | A reel spins up again after a token. | A quick upward whoosh. | — |
| `combo` | A token combo: the reels’ numbers fly together. | Two glides meeting in a thump, a bell per reel. | — |
| `find_pop` | An everyday find worth a little sound (Uncommon and up, as rare for your luck). | A quick pop and a bell in its rarity. | — |

## Reveal

The full-screen reveal of a big find.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `blackout` | The screen goes dark for a big find. (Not played by the game yet.) | A deep boom, the music dropping out. | — |
| `heartbeat` | A heartbeat in the reveal’s dark. Recorded (`heartbeat.mp3`, gain 0.09). | Lub-dub, higher and louder each beat. | — |
| `emerge` | The knight rising out of the dark. (Not played by the game yet.) | A shimmering swell. | — |
| `count_tick` | The reveal’s “1 in X” counting up. (Not played by the game yet.) | A tick climbing in pitch. | — |
| `tier_pass` | The count passing a rarity’s odds. (Not played by the game yet.) | A bright chime. | — |
| `slam` | A reveal lands (BIG, HUGE, INSANE), and an Exalted or rarer knight joining the squad. Recorded (`slam.mp3`, gain 0.229). | A slam, a crash and a chord stab. | — |
| `reveal_sting` | The rarity sting after a reveal (one file for every rarity). | Bells for the commoner finds; an orchestral hit, a choir and coins from Legendary up; a fanfare from Astral up. | — |
| `hyper_intro` | HYPER RARE’s summoning. (Not played by the game yet.) | A swelling rumble, the long riser and an alarm. | — |
| `hyper_boom` | HYPER RARE bursts open. (Not played by the game yet.) | A huge boom and crash, a big chord and sparkles. | — |
| `firework` | Fireworks after an INSANE or HYPER RARE reveal. | A pop and a crackle. | — |
| `stamp` | A seal stamped down (a rarity stamp, NEW!), an Epic or better skill landing on the HUD, and an Epic or better roll at a keeper’s. | A thump, a paper slap and a small ring. | — |

## Menus

Knights, the hub’s counters and the buttons.

| Sound | When it plays | Placeholder | Mix |
| --- | --- | --- | --- |
| `jingle` | A new knight joins; a lucky spin; a double roll at the tinker’s; the signature three notes. Recorded (`jingle.mp3`, gain 0.198). | Three bells up the chord. | — |
| `jingle_long` | Bigger wins: a token combo, a Luck Potion, a boss down without the music’s sting. Recorded (`jingle_long.mp3`, gain 0.217). | Five bells up the chord. | — |
| `dupe` | A duplicate lands at the altar (on screen), and the hero sheet’s mutate button. | A small soft pop and a swish. | — |
| `mutation` | A better mutation. | A shimmer up and a sparkle. | — |
| `break_down` | Duplicates broken into shards. | A crunch, glass flying, crystals tinkling down. | — |
| `sell` | Duplicates sold. | A ka-ching and coins. | — |
| `haul` | A big haul of gold. (Not played by the game yet.) Recorded (`haul.mp3`, gain 0.136). | A ka-ching and coins pouring in. | — |
| `buy` | An upgrade bought. | A coin, a bright arpeggio up and a sparkle. | — |
| `equip` | A knight takes its place in the squad (Best squad, choosing your knight). | A thump and a clank, a chime climbing with its rarity. | — |
| `perk` | A perk rolled at the sage’s (fuller for a Rare or Epic one). | A sweep up into a chord. | — |
| `unlock` | Something new opens up (a special upgrade, a Legendary roll at the tinker’s). | A rising sparkle. | — |
| `collect` | Earnings collected. (Not played by the game yet.) | A cascade of coins and a ka-ching. | — |
| `ding` | An upgrade maxed out. | A bright ding. | — |
| `tap` | A button press. Recorded (`tap.mp3`, gain 0.15). | A pop, a semitone higher each tap through quick taps. | — |
| `panel_open` | A panel or a talk opens. | A whoosh up, a wooden knock and a little bell. | — |
| `panel_close` | A panel closes. | A whoosh down and a lower knock. | — |

## Old recordings

`hit.mp3` (Dumpster Legend’s blow) is no longer played: a blow is `hit_<material>` now. Rename it to one of those names to use it, or delete it.
