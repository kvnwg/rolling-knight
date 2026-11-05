# Rolling Knight

A top-down (3/4 view) pixel action roguelite with a rolling game on top, in the style of Dumpster
Legend. A free Summoning Altar rolls knights forever; you field a squad of three in endless,
procedurally generated dungeons (hamlets, a farm, dark forests, tundra, crypts, bogs, desert ruins,
graveyards, lava caves, crystal grottoes, moonlit shrines), control one knight and let the other two
fight by their class; when its cooldown is up in a fight, each knight rolls a random skill from its
class's list and fires it. Between dives
you walk round the hub, a lamplit square before the Gilded Reel, where each keeper runs one counter:
the Oracle's altar, the smith, the junk dealer, the quartermaster, the tinker's upgrades on two tabs,
Luck and Combat (with chance upgrades like Ricochet and Double or Nothing, and Quick Roll for faster
skill rolls), the sage, the rebirth shrine, the notice board, and the warden by the steps down: walk
down them to dive. Talk to a keeper and their screen opens with them big at their counter, lamplit
among the things of their trade, and their wares below as cards on beige paper: a picture, a level,
a number or two and a price, the details a tap away. Above all of them, at 1 in 2.5 billion, sits the Absolute tier and its one knight: Kevin, a
black-haired normal guy and the strongest in the game by far. Duplicates become shards or gold;
shards level your knights. Rebirth
for permanent luck and power; perks from the first rebirth change how a run plays. Folk on the floors
hand out jobs, and one of them may be a demon in disguise.

How every system works, with its numbers: [`DESIGN.md`](DESIGN.md). Art sources and licenses:
[`CREDITS.md`](CREDITS.md).

## The look

- The knights and most mobs come from PixelForge, the game's character pipeline: chibi sprites in
  one muted palette with a 1 px plum outline, drawn in four directions with real attacks, dodges,
  hurts, deaths and victories (`src/render/pf/`). Each knight's class sheet is recolored at runtime
  for its rarity (iron and undyed cloth at Common, then bronze, steel, violet silver, gold, rose
  steel, verdigris, crimson steel, star-silver, aurora steel, white gold, obsidian, and cycling
  colors at Primordial, with cloth dyed in the rarity's color), with capes from Epic, halos from
  Celestial and the mutations (Gilded, Shadow, Radiant, Void). Mobs map by body plan (slimes, bats,
  wolves, goblins, goblin archers and chiefs, orcs, skeletons, ogres; the Stone Warden is the boss)
  and wear their floor's colors. The farm's animals, ghosts, pumpkins, bugs, plants, casters and the
  demon keep the game's own sprites (built on Snoblin's prototype mannequin or painted from shapes).
- The look follows Firefly Garden turned into pixels: bright, readable places edge to edge. The
  hamlet is a town of half-timbered houses, fenced lots, hedges, a market square with striped stalls,
  a fountain and string lights, and a canal with a bridge; trees stand in clumps on the lawns
  (blossom trees, maples, dark pines), each throwing its shadow down and to the right. The ground is
  painted once per floor (cobbles with mortar, grass with flowers, flagstones, snow, sand, mud,
  basalt, water with banks, lava), with about 30 kinds of decals and every standing thing's shadow
  baked in. Fireflies, butterflies and mist drift over it.
- Cinematic light: the scene is multiplied by each biome's ambient (cool and dim, or warm), torches,
  lanterns, braziers, lava, crystals, spells and the knights themselves light it in stepped bands
  with bloom, then a grade and a vignette. Daylight is lifted near white; out in the open each floor
  rolls its weather (clear, overcast, or rain with splashes, rings on water and a rain sound), and
  cloud shadows drift over sunny floors. Weather per biome too: fireflies, snow, embers, petals, fog.
- Tilt-shift: the picture goes soft above and below the band your knight stands in (trees, props and
  all, the ground most), so the dungeon looks like a miniature; a soft glow lets every light bleed a
  little into the shadows round it. Gentler indoors (crypts, lava caves); the hub is softer and
  glowier still. A switch in Settings turns the tilt-shift off.
- One pixel size: everything is drawn at art resolution (about 270 art pixels on the screen's short
  side) and scaled up by a whole number. The camera follows on a critically damped spring and scrolls
  by sub-pixels in the shader, so the world glides while every sprite stays on the grid.
- The UI wears the medieval pack's materials, painted in code at startup (`src/ui/skin.ts`): bevelled
  wooden, brass, crimson, steel and arcane buttons with a lip; dark plates with iron bolts; the pack's
  copper-rimmed bars; parchment cards; octagonal iron ability slots that turn brass when ready; wax
  seals for difficulty. The keepers' screens (`src/ui/keeper/`) are lighter: beige paper in a dark
  brown border with torn corners, green tabs and buttons, slots pressed into the paper, dark brown
  pixel text, and icons and numbers instead of sentences. Each keeper's scene across the top is
  painted and lit in code (`src/render/art/keepers/`: the keeper's bust from their hub look, their
  trade round them, lamps, candles, coals and glowing glass in stepped pools of warm light), at a
  whole number of screen pixels per art pixel; `keepers-preview.html` shows them all.

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
tell the warden you're ready). In the dungeon: Space or Shift to dodge roll; every knight's skill rolls and
fires by itself once it's ready in a fight (E or Q rolls yours early); Enter or F to talk to someone, 1 2 3 to take control of a knight, T for Auto, Esc to head back up to the
hub. Touch: drag to move (anywhere at the hub; on the left side in a fight); the buttons do the rest. Your knights attack on their own whenever
something is in range.

Dev shortcuts by URL: `?floor=16` starts on that floor with a ready squad, `&squad=mythic` sets its
rarity, `&classes=arcanist,guardian,cleric` its classes, `&auto` plays itself, `&gold=100000`;
`&camp` stays at the hub and `&hub` skips choosing a knight, `&sky=rain` (or `clear`, `overcast`) sets
every floor's weather. `?fresh` starts a new game. The game is on
`window.__game`, the renderer on `window.__renderer`.

## Tests, balance and art previews

```bash
npm test
```

150 tests: the rarity odds (exact and over 20,000 rolls), tokens, chains, combos and floors, spin
timing, extra reels, the tutorial's scripted rolls, bad-luck protection, Lucky Spins, duplicates,
shards, selling, levels and reforging, Humble Beginnings' 3x, rebirth; every biome's floors fully
connected with spawns reachable and deterministic by seed, mob and boss design, a squad clearing a
floor on Auto, auto attacks, dodge invulnerability, skill rolls and their odds, Rewind, the balance
curve, the camera, the weather, the hub's map and keepers, folk and quests, the two upgrade maps, Quick Roll and every
chance upgrade in a fight, the keepers' scenes and cards, a full game starting up; and the PixelForge art: every sheet holding what
the game plays in four directions, the body plan to monster mapping, the material recolors, every
rarity's and mutation's ramps, and the animations the sim's state picks (attacks on the hit's tick,
windups over the mobs' telegraphs, dodges, walks stepped by distance, deaths and revives).

```bash
npm run sim -- --minutes 40
```

The real game logic on Auto with a bot that shards, levels, buys upgrades and perks and rebirths.
Current result: floor 10 at about 7 minutes, the first rebirth at about 12.

```bash
npx tsx tools/preview.ts knights shots/knights.png
```

```bash
npx tsx tools/preview.ts mobs shots/mobs.png
```

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

The PixelForge sheets (`src/assets/pf/`), from a PixelForge checkout after `pf build --all` and
`pf fx build --all` (it keeps the animations the game plays, each distinct frame once, as indexed
PNGs with every color's material and shade, for the runtime recolors):

```bash
python3 -I tools/packs/pixelforge.py "<pixelforge>" src/assets/pf
```
