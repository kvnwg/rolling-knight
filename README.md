# Rolling Knight

A top-down (3/4 view) pixel action roguelite with a rolling game on top, in the style of Dumpster
Legend. A free Summoning Altar rolls knights forever; you field a squad of three in endless,
procedurally generated dungeons (hamlets, a farm, dark forests, tundra, a dungeon keep, crypts, bogs, desert ruins,
graveyards, lava caves, crystal grottoes, moonlit shrines), control one knight and let the other two
fight by their class. The fighting is twin-stick, after Enter the Gungeon: you aim with the mouse
(or let the game aim for you on a phone), swing or shoot along the aim while you keep moving, cut
foes' bullets out of the air, and dodge with your class's own dash; in a fight each knight keeps
rolling a random skill from its class's list, firing it and rolling the next at once (no cooldowns).
Between dives
you walk round the hub, a lamplit square before the Gilded Reel, where each keeper runs one counter:
the Oracle's altar (summons, the odds and the Codex), the tinker's upgrades on two tabs (Luck,
bought on a honeycomb map, and Combat, rolled for gold on a reel: Strength, Vitality, Attack Speed,
Move Speed, Quick Roll for faster skill rolls, chance upgrades like Ricochet and Double or Nothing,
and rare one-offs), the sage's perks (rolled for sigils), the rebirth shrine, the notice board, and Warden Tobb by the steps down,
who picks the three you send down, levels them up and reforges them: one job each, nothing twice. Talk to a keeper and their screen opens with them big at their counter, lamplit
among the things of their trade, and their wares below as cards on beige paper: a picture, a level,
a number or two and a price, the details a tap away. Above all of them, at 1 in 2.5 billion, sits the Absolute tier and its one knight: Kevin, a
black-haired normal guy and the strongest in the game by far. A knight you already have turns
straight into gold; gold levels your knights. You start on ordinary rolls: no scripted finds. Rebirth
for permanent luck and power; perks from the first rebirth change how a run plays. Folk on the floors
keep a set-up of their own off the fighting (a market stall, a tent by a campfire, a candlelit shrine)
and hand out jobs, and one of them may be a demon in disguise.

How every system works, with its numbers: [`DESIGN.md`](DESIGN.md). Art sources and licenses:
[`CREDITS.md`](CREDITS.md). Every sound by name, when it plays, and how to replace it with a
recording: [`docs/SOUNDS.md`](docs/SOUNDS.md).

## The look

- The knights and most mobs come from PixelForge, the game's character pipeline: chibi sprites in
  one palette with a 1 px plum outline, drawn in four directions with real attacks, dodges, hurts,
  deaths and victories (`src/render/pf/`). Each class has a silhouette of its own: the Guardian in a
  great helm, pauldrons and a cloak, the Blade with spiky hair and a scarf streaming behind, the
  Ranger an elf in a wide feathered hat and cloak, the Cleric in a mitre and cloak over a white robe,
  the Arcanist a bearded wizard in a pointed hat, the Lancer in a winged helm with twin tails. They
  breathe standing (a six-frame idle, a blink on its rest frame), walk on eight frames when slow and
  run at a knight's pace (the run is drawn for it, so the feet stay planted); the Blade and the
  Guardian cleave (a coil, a blur and a wide arc across the body), and the Whirlwind is a real spin
  through every view, looped while it lasts. Each knight's class sheet is recolored at runtime
  for its rarity (iron and undyed cloth at Common, then bronze, steel, violet silver, gold, rose
  steel, verdigris, crimson steel, star-silver, aurora steel, white gold, obsidian, and cycling
  colors at Primordial, with cloth dyed in the rarity's color through the class's own values: the
  Cleric's robe stays white under a dyed cloak, the Blade's scarf is the vivid part over a dark
  tunic, the Lancer's helm a second metal), with capes from Epic (the cloaked classes wear their
  cloak dyed instead), halos from Celestial and the mutations (Gilded, Shadow, Radiant, Void). Mobs
  map by body plan (bats, wolves that howl as they wake, goblins, goblin archers and chiefs, orcs,
  skeletons, ogres that roar as they wake; from floor 36 a chaser's elite is the Ashen Duelist, a tall
  quick glaive fighter) and wear their floor's colors. The bosses are the Stone Warden, a forest
  guardian of boulders with an antlered skull and a leafy mane in each place's stone and leaves (its
  leaves autumn red at half HP), and in the Ember Depths the Cinderwyrm, a big slow dragon in
  obsidian scales (dark against the lava; its embers show at half HP) that breathes a fan of
  fireballs, roars up rings of them, lunges to bite and sweeps its tail. Monsters
  swing with PixelForge's white trails. The slimes (a green blob with a face) and the undead of the dark
  biomes (a skeleton with a sword, one with a scythe and a robed vampire, their attacks with their
  own slash smears) come from supplied packs, side views turned to face their targets, played by the
  same sim-driven animator. The farm's animals, ghosts, pumpkins, bugs, plants, casters and the
  demon keep the game's own sprites (built on Snoblin's prototype mannequin or painted from shapes).
- Attacks are drawn by code on the pixel grid (`src/render/vfx/`). The melee knights swing solid
  white smears in the classic pixel-art way: on the hit, one wedge sweeps from behind the head far
  out in front to a crisp point, then a thin streak, then it's gone (the Guardian's a heavy chop, the
  Lancer's a spike to its reach). Arrows are hand-drawn in 16 directions; the arcane bolt twinkles
  with sparks orbiting it, the holy orb turns in a halo, foes' bullets are big glossy danger balls
  with an ink outline; each shot ends in an impact sized to the hit. Commons stay white; each tier
  tints, edges and layers the smears in its color, up to Primordial's rainbow and Absolute's black
  and white. Like every attack effect they're crisp and flat: nothing glows or lights the scene.
  (PixelForge paints a white trail on every swing too; the knights' sheets are imported without it,
  so a knight's stroke is the game's alone: aimed at its target, as long as its reach, and dressed in
  its rarity.)
- The Grimstone Dungeon (floors 21 to 25, before the crypt) is built tile by tile from supplied packs:
  each floor is purple-brown stone (thin walls, a brick face to the north) or blue stone (thick mauve
  caps, a cobbled rim round the floor), dressed with torches that light it, banners, cell doors,
  cobwebs, heaps of barrels, crates and pots, chests, candles, flasks and pedestals. Its traps are real
  hazards: spikes, fire vents, a saw running along its slot and pressure plates that flip to their
  spiked side, each with a tell (and a red glow) before it strikes; a dodge roll carries you through,
  and they hurt mobs too. The crypt has a few.
- The look follows Firefly Garden turned into pixels: bright, readable places edge to edge. The
  hamlet is a town of half-timbered houses, fenced lots, hedges, a market square with striped stalls,
  a fountain and string lights, and a canal with a bridge; trees stand in clumps on the lawns
  (oaks, maples, apples and blossom trees with crowns of round leaf clumps, reddish forked trunks and
  spreading roots; dark pines), each throwing its shadow down and to the right. The ground is
  painted once per floor (cobbles with mortar, flagstones, snow, sand, mud, basalt, water with banks,
  lava, and lawns: lush and sunlit patches with dithered edges, blade texture, tufts in three sizes,
  clover, flower clumps in each biome's colors, moss cushions, leaf litter and petals, fairy rings,
  blades breaking over the edges of paths, curbs and walls), with about 30 kinds of decals and every
  standing thing's shadow baked in. The tundra's ice crystals stand in faceted clusters in snow
  drifts. Fireflies, butterflies and mist drift over it.
- Cinematic light: the scene is multiplied by each biome's ambient (cool and dim, or warm), torches,
  lanterns, braziers, lava, crystals, spells and the knights themselves light it in stepped bands
  with bloom, then a grade and a vignette. Daylight is lifted near white; out in the open each floor
  rolls its weather (clear, overcast, or rain with splashes, rings on water and a rain sound), and
  cloud shadows drift over sunny floors, with shafts of sunlight slanting down through the air in
  daylight (never in the dark places, indoors or in rain). Weather per biome too: fireflies, snow, embers, petals, fog.
- Tilt-shift: the picture goes soft above and below the band your knight stands in (trees, props and
  all, the ground most), so the dungeon looks like a miniature; a soft glow lets every light bleed a
  little into the shadows round it. Gentler indoors (crypts, lava caves); the hub is softer and
  glowier still. A switch in Settings turns the tilt-shift off.
- One pixel size: everything is drawn at art resolution (about 270 art pixels on a desktop's short
  side, about 230 across a phone, 150 at the hub) and scaled up by a whole number. The camera follows on a critically damped spring and scrolls
  by sub-pixels in the shader, so the world glides while every sprite stays on the grid.
- The UI wears the medieval pack's materials, painted in code at startup (`src/ui/skin.ts`): bevelled
  wooden, brass, crimson, steel and arcane buttons with a lip; dark plates with iron bolts; the pack's
  copper-rimmed bars; parchment cards; chunky wooden action keys (plank tops, corner nails, an inlay
  that turns brass when ready) that sink into their blocks when pressed; wax
  seals for difficulty. The keepers' screens (`src/ui/keeper/`) are lighter: beige paper in a dark
  brown border with torn corners, green tabs and buttons, slots pressed into the paper and dark brown
  pixel text. Each counter says in a line what it's for, every number says what it is ("Luck x1.20",
  "Shards 4/10"), every button says what it does ("LEVEL UP 1.2K", "ADD TO SQUAD"), and an offer's
  whole story is a tap away. On a phone the text is bigger (about 130 art pixels across the screen
  for the UI) and the categories run across the top so the cards get two columns. Each keeper's scene across the top is
  painted and lit in code (`src/render/art/keepers/`: the keeper's bust from their hub look, their
  trade round them, lamps, candles, coals and glowing glass in stepped pools of warm light), at a
  whole number of screen pixels per art pixel; `keepers-preview.html` shows them all.

## The sound

- Music: recorded tracks by Kevin MacLeod, one per mood (`src/audio/tracks.ts`, credits in
  [`CREDITS.md`](CREDITS.md) and Settings): a lute and guitar by the tavern's fire at the hub, a
  medieval village consort in the hamlet and at the shrine, a lively inn dance on the farm, Celtic
  dulcimer and harp in the forest and the bog, a dark Renaissance dance with choir in the graveyard
  and the crypt, a wintry fairy tale on celesta in the tundra and the crystal caves, dulcimer and
  hand drums in the desert, taiko drums in the ember depths, a full orchestra for bosses, and an
  orchestral sting when one falls. Each loops seamlessly (whole bars, crossfaded where the music
  repeats itself), and scenes crossfade (`src/audio/music.ts`). Tracks are decoded when a scene
  first wants one, the last two kept.
- Under it, each place's own sounds, synthesized: the hub's fire and crickets, birdsong, an owl,
  frogs, wind, drips, lava, glints and chimes in the track's key (`src/audio/ambience.ts`).
- Sound effects: Dumpster Legend's recordings and synthesized sounds (`src/audio/sfx.ts`), all of
  it silent until the first tap and brought back by a watchdog if a phone knocks the audio out
  (`src/audio/engine.ts`).

## Play

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Keyboard: WASD or arrows to move. At the hub, E or Enter talks to the
keeper you're standing by; walk down the steps at the foot of the square to go into the dungeon (or
tell the warden you're ready). In the dungeon: the mouse aims (a crosshair takes the cursor's place);
hold the left mouse button (or J) to attack along the aim at your class's pace, moving at full speed;
Space or Shift for your class's dash (Shield Bash, Shadowstep, Shot or Snare, Blessed Step, Blink,
Spear Lunge: toward where you're moving, or the aim when you stand still); every knight's skill rolls
and fires by itself in a fight, one after another (E or Q rolls yours when there's no fight); Enter
or F to talk to someone, 1 2 3 to take control of a knight, T for Auto attack (your knight aims and
fires by itself; moving and dodging stay yours), Esc to head back up to the hub. Touch: drag to move
(anywhere at the hub; on the left side in a fight); hold the Attack button and it aims for you (at
the foe ahead of where you're walking, else the nearest in reach, and it stays on that one: corner
brackets mark it), or drag from the Attack button to aim by hand like a second stick; the dodge
button, named for your class's dash, and the others do the rest. Your other two knights attack on
their own whenever something is in range (and yours too, on Auto attack).

Dev shortcuts by URL: `?floor=16` starts on that floor with a ready squad, `&squad=mythic` sets its
rarity, `&classes=arcanist,guardian,cleric` its classes, `&auto` hands your knight to a dev bot
that plays by itself (moving and dodging too), `&gold=100000`;
`&camp` stays at the hub and `&hub` skips choosing a knight, `&sky=rain` (or `clear`, `overcast`) sets
every floor's weather, `&design=maze` the next floor's design (`src/world/designs.ts`; then the deck
as usual). `?fresh` starts a new game. The game is on
`window.__game`, the renderer on `window.__renderer`.

## Tests, balance and art previews

```bash
npm test
```

368 tests: the rarity odds (exact and over 20,000 rolls), tokens, chains, combos and floors, spin
timing, extra reels, the start's ordinary quick spins, bad-luck protection, Lucky Spins, duplicates
turning into gold, gold-only levels and reforging, old saves' spares cashed in, Humble Beginnings' 3x,
rebirth; every biome's floors fully
connected with spawns reachable and deterministic by seed, mob and boss design, a squad clearing a
floor on its own, the fighting (attacks along the aim, melee arcs that only hit in front, foes'
bullets cut and sent back, auto-aim's choice and how it sticks, a knight's moment of safety after a
hit, hit-stop that plays the same at any frame rate, every class's dash), dodge invulnerability,
skill rolls one after another and their odds, Rewind, the balance
curve and the first floors' edge; how monsters fight: every kind with a lunge or a gun, their
bullets slower than a knight's, each volley's pattern (aimed, fans, bursts, rings, curving shots)
and the tell before it, dashes and leaps that hit a knight standing in them and go straight through
one rolling, an ogre throwing a boulder across water at a knight it can't reach (and at one that
keeps away) onto the ring it marked, quake rings, the spawn-in, perfect rolls marked once per roll,
the squad's AI seeing a lunge's lane or landing ring, the lunges' crouch, arc and squash and the red
wind-up warning; the camera, the weather, the hub's map and keepers, folk and quests, the Luck
map, the combat and perk rolls (their odds, prices, doubles and free rolls; a full pool rolls nothing),
Attack Speed, Quick Roll and every chance upgrade in a fight, the keepers' scenes and cards, a full game
starting up; and the PixelForge art: every sheet holding what the game plays in four directions, the
body plan to monster mapping (the Cinderwyrm in the Ember Depths, the Ashen Duelist's elites), the
material recolors, every rarity's and mutation's ramps (each class's outfit dressed in them, its
second tones too), the knights drawn without PixelForge's swing trails, and the animations the
sim's state picks (attacks on the hit's tick, the Cleave and the Whirlwind's spin, windups over the
mobs' telegraphs, the bosses' moves, a wolf's howl as it wakes, dodges, walks and runs stepped by
distance, the idle's blink, deaths and revives); and the music: a track for every scene and
floor, each one's file, credit and loop points, the 5 MB budget; the Dungeon: its floors valid in
both stones, every prop drawn from the packs, its traps warning before they strike, rolled through
untouched, hurting mobs; the packs' monsters having every animation the sim asks for, striking on
the frame their smear lands, facing the way the sim says; the economy: every price scaling per
rebirth, a night away paying about an hour of the fights' gold, duplicates worth a few kills.

```bash
npx tsx tools/music.ts
```

Checks the music files too: each one's length and loudness (with ffmpeg installed).

```bash
npm run econ -- --hours 6 --seed 1
```

The economy's pace, played out: several runs with spending, rebirths and nights away, and what each
run took, earned, bought and owned. docs/ECONOMY.md has the design and the current results.

```bash
npm run sim -- --minutes 40
```

The real game logic with a dev bot at the controls (it moves, aims and dodges too) that levels,
buys Luck upgrades, rolls combat upgrades and perks, and rebirths. Current result over seeds 1 to 8
(`--seed N`): floor 5 at about 4 minutes (3 to 4.5), floor 10 at about 8 (7 to 9.5), the first
rebirth at about 13 (11 to 15) and the second at about 32 (29 to 34), with one wipe in the eight runs
and about 60 perfect rolls in 40 minutes.

```bash
npx tsx tools/preview.ts knights shots/knights.png
```

```bash
npx tsx tools/preview.ts mobs shots/mobs.png
```

```bash
DESIGN=loop npx tsx tools/preview.ts floor shots/floor.png forest 12 1234
npx tsx tools/preview.ts designs shots/floors_designs.png hamlet,forest,crypt,desert,ember 8 1234 4 tundra
```

A floor (any design; `RAW=1` without the biome's light, `SOFT=1` with it softened), and a contact
sheet of every floor design in a few biomes with a row of boss floors.

```bash
npx tsx tools/vfxPreview.ts shots
```

Every attack effect by tier and frame on grass, stone, a crypt, sand and snow (`shots/vfx_*.png`);
`tools/vfxSmearCheck.ts` draws the melee smears in eight directions.

## Build

```bash
npm run build
```

```bash
npm run build:artifact
```

The second writes `artifact/rolling-knight.html`, one self-contained page (fonts, art and code
inlined). A playable copy is published as a private claude.ai artifact:
https://claude.ai/artifact/3h8iQEex8H8z78bq9GtUSQ (saves live in that page's browser storage).

## Packs

Regenerating the art from the packs (paths to the unzipped packs):

```bash
python3 -I tools/packs/mannequin.py "<Snoblin>/Characters/Prototype_Character/Default" src/render/packs/mannequin.ts
```

```bash
python3 -I tools/packs/ui.py "<MediavelFree.png>" "<UiCozyFree.png>"
```

```bash
python3 -I tools/packs/fx.py "<Gigapack>/PNG" "<Mini Pack 1>/PNG" src/render/packs/fx.ts
```

The Dungeon's tiles, props and traps, and the packs' monsters (the undead and the slime):

```bash
python3 -I tools/packs/dungeon.py "<2D Pixel Dungeon Asset Pack>" "<DungeonAssets>/Pack" "<Craftpix dungeon objects>/PNG" src/render/packs/dungeonArt.ts
```

```bash
python3 -I tools/packs/enemies.py "<Enemy_Animations_Set>" "<DungeonAssets>/Pack" src/assets/packs
```

The PixelForge sheets (`src/assets/pf/`), from a PixelForge checkout after `pf build --all` and
`pf fx build --all`. First the knights again without PixelForge's swing trails (the game draws its
knights' swings itself), with PixelForge's own Python; it writes `<pixelforge>/out/bare/`:

```bash
"<pixelforge>/.venv/bin/python" -I tools/packs/pixelforge_bare.py "<pixelforge>"
```

Then the import (it keeps the animations the game plays, each distinct frame once, as indexed PNGs
with every color's material and shade, for the runtime recolors; it checks the knights' trail-free
build matches the full one):

```bash
python3 -I tools/packs/pixelforge.py "<pixelforge>" src/assets/pf
```

Contact sheets of the result as the game paints it (every class in every rarity and mutation, each
class's moves frame by frame, the monsters and bosses in each biome's colors):

```bash
npx tsx tools/pfPreview.ts knights shots/pf_knights.png
npx tsx tools/pfPreview.ts moves shots/pf_moves.png legendary blade
npx tsx tools/pfPreview.ts mobs shots/pf_mobs.png
```

The music loops (`src/assets/music/`), from a folder of the original MP3s, named as downloaded from
the sources in [`CREDITS.md`](CREDITS.md) (needs numpy and ffmpeg; the loop points are in the
script):

```bash
python3 -I tools/packs/music.py "<folder of mp3s>" src/assets/music
```
