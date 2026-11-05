# Rolling Knight

A top-down (3/4 view) pixel action roguelite with a rolling game on top, in the style of Dumpster
Legend. A free Summoning Altar rolls knights forever; you field a squad of three in endless,
procedurally generated dungeons (hamlets, dark forests, tundra, crypts, bogs, desert ruins,
graveyards, lava caves, crystal grottoes, moonlit shrines), control one knight and let the other two
fight by their class. Duplicates become shards or gold; shards level your knights. Rebirth for
permanent luck and power; perks from the first rebirth change how a run plays.

How every system works, with its numbers: [`DESIGN.md`](DESIGN.md). Art sources and licenses:
[`CREDITS.md`](CREDITS.md).

## The look

- Every character is built on Snoblin's prototype mannequin, dressed in code: class helmets in three
  views (a Guardian's great helm, a Blade's plumed sallet, a Ranger's hood, a Cleric's mitre, an
  Arcanist's hat, a Lancer's winged helm), rarity armor, capes from Epic, halos from Celestial,
  cycling colors at Primordial, and mutations (Gilded, Shadow, Radiant, Void). Humanoid mobs use the
  same skeleton; other mobs are painted from shapes at their own size.
- The ground is painted once per floor: cobbles, grass tufts, flagstones, snow, ice, sand, mud,
  basalt; walls and cliffs with their front faces; water with banks and foam, lava, chasms; ambient
  occlusion where floor meets wall. Trees are rounded leaf clumps lit from the top left.
- Cinematic light: the scene is multiplied by each biome's ambient (cool and dim, or warm), torches,
  lanterns, braziers, lava, crystals, spells and the knights themselves light it in stepped bands
  with bloom, then a grade and a vignette. Weather per biome: fireflies, snow, embers, petals, fog.
- One pixel size: everything is drawn at art resolution (about 216 art pixels on the screen's short
  side) and scaled up by a whole number.
- The HUD is the supplied medieval UI: hanging wooden boards, plank signs, wooden buttons, framed HP
  bars, parchment cards.

## Play

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Keyboard: WASD or arrows to move, Space or Shift to dodge roll, E or Q
for the special, 1 2 3 to take control of a knight, T for Auto, M for the menu (R altar, K knights,
U upgrades, Esc to close). Touch: drag on the left half to move; the buttons do the rest. Your knights
attack on their own whenever something is in range.

Dev shortcuts by URL: `?floor=16` starts on that floor with a ready squad, `&squad=mythic` sets its
rarity, `&classes=arcanist,guardian,cleric` its classes, `&auto` plays itself, `&gold=100000`.
`?fresh` starts a new game. The game is on `window.__game`.

## Tests, balance and art previews

```bash
npm test
```

27 tests: the rarity odds (exact and over 20,000 rolls), tokens, chains, combos and floors, spin
timing, extra reels, the tutorial's scripted rolls, bad-luck protection, Lucky Spins, duplicates,
shards, selling and levels, Humble Beginnings' 3x, rebirth; every biome's floors fully connected with
spawns reachable and deterministic by seed, mob and boss design, a squad clearing a floor on Auto,
auto attacks, dodge invulnerability, Rewind, and a full game starting up.

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
