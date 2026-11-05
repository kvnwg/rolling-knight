# Credits and art licenses

Pack art is copied 1:1 into generated TypeScript modules or PNGs by the scripts in `tools/packs/`;
the raw packs are not in this repository. The in-game credits are in Settings.

| Art | Where it's used | Source and license |
| --- | --- | --- |
| PixelForge v1.0 (the game's own character pipeline) | The knights (all six classes, recolored per rarity and mutation), the bat, wolf, goblins, goblin archer and chief, orc, skeleton (the desert's), ogre and the Stone Warden boss (its slime is retired: the DungeonAssets slime below took its place), and a few of its FX (death poofs, bone crumble, stun stars, rock shards). `src/assets/pf/`, made by `tools/packs/pixelforge.py`. | Made for this game by the same author. |
| Snoblin, *Pixel RPG Prototype Characters* (the gray Default mannequin) | The skeleton of the characters PixelForge doesn't draw (cultists, monks, scarecrows, ghosts, pumpkin-heads, the demon) and of the old knight art, kept as a fallback. `src/render/packs/mannequin.ts`, made by `tools/packs/mannequin.py`. | Commercial and non-commercial use and editing allowed; **no redistributing or reselling the assets, even modified**. Attribution appreciated. |
| *Medieval* UI sheet (`MediavelFree.png`) | The HUD: the hanging wooden board and chains, wooden buttons, the plank sign, the framed HP bar, candles, daggers, corner brackets. `src/assets/ui/`, cut by `tools/packs/ui.py`. | **No license text in the download.** Check the pack's page before release. |
| *Cozy* UI sheet (`UiCozyFree.png`) | The parchment cards in the menus. `src/assets/ui/`. | **No license text in the download.** Check the pack's page before release. |
| Will Tice / unTied Games, *Super Pixel Effects Gigapack* (Free) v3.2.0 and *Super Pixel Effects Mini Pack 1* | Battle effects: hits, crits, slashes, fireballs, smoke, splats, sparkles, fireworks, lightning, heal, death, shockwaves, electric bursts, explosions. `src/render/packs/fx.ts`, made by `tools/packs/fx.py` (Dumpster Legend's tool, extended). | Commercial use allowed with credit **"Pixel Art Assets - Will Tice / unTied Games"** (shown in Settings). Bundling in a game is fine; no distributing the pack on its own. Not for AI training. |
| *2D Pixel Dungeon Asset Pack* v2.0 (most likely Pixel_Poem's on itch.io: the name and the art match) | The Dungeon's purple-brown stone: walls, faces, rims, floors and cell doors; its torches and side torches, candlesticks, the red shield banner, rings, cobwebs, chests, crates, flasks, coins, bones, rubble; the spikes trap. `src/render/packs/dungeonArt.ts`, made by `tools/packs/dungeon.py`. | Supplied by the user, **no license file in the download: license to confirm**. |
| *Enemy Animations Set* (skeleton1, skeleton2, vampire; the same characters, palette and outline as the pack above's monsters, so most likely its animated companion by the same author) | The undead of the dark biomes (the dungeon, the crypt, the graveyard): the skeleton with a sword, the one with a scythe and the robed vampire, idle, walking, attacking with their own slash smears, hurt and dying, mirrored for the other facing. `src/assets/packs/pk_skeleton`, `pk_reaper`, `pk_vampire` (.png, .json), made by `tools/packs/enemies.py`. | Supplied by the user, **no license file in the download: license to confirm**. |
| *DungeonAssets* (`Pack/`: Doors, DungeonWalls, Ground Tiles, Objects, Slime-Sheet...; author unknown) | The Dungeon's blue stone (caps, the brick face, the floor's cobbled rim, the doors) and its barrels, pots, cabinet, candles and swords (`dungeonArt.ts`); the slime with a face that replaces PixelForge's slime everywhere, recolored per biome (`src/assets/packs/pk_slime`, made by `tools/packs/enemies.py`; its hop and lunge are its idle frames moved). | Supplied by the user, **no license file in the download: license to confirm**. |
| Craftpix, *Free Pixel Art Dungeon Objects Asset Pack* (craftpix.net freebies) | The Dungeon's fire vent, the saw on its track and the flip plate (traps), its tall banners, armor, pedestals and the dragon skull. `dungeonArt.ts`, made by `tools/packs/dungeon.py`. | Craftpix's license (https://craftpix.net/file-licenses/): free to use in commercial and personal projects; **not to be redistributed or resold as assets**, even modified. |
| Pig and sheep Aseprite sheets | The farmland's Hog and Ram mobs. `src/render/packs/farm.ts`, as Dumpster Legend made them. | **No license or author in the download.** Find the source and its terms before release. |
| Dumpster Legend's sound recordings (17 clips: reel lands, tokens, heartbeats, the reveal slams, hauls, taps...) | Every recorded sound effect. `src/assets/sounds/`, played by `src/audio/`. | From Dumpster Legend, by the same author; no separate license note there either. |
| Pixelify Sans | All UI text | SIL Open Font License, via @fontsource/pixelify-sans. |
| Bitmap font, pixel helpers | In-world numbers and text | From Dumpster Legend (`src/render/pixel/`). |

Everything else (the remaining mobs; terrain, walls, water,
trees and props; folk and their portraits; the UI skin; lighting, weather and the reels) is drawn in
code for the game, and the music (eight themes and a victory sting) and the synthesized sounds are
composed in code (`src/audio/songs.ts`, `src/audio/instruments.ts`).

Not used: the MV Icons sheet, the modern clothes pack and the side-view character animation pack; from the
dungeon packs, the 2D Pixel Dungeon Asset Pack's small idle monsters and priests and its interface arrows, DungeonAssets'
HP ring and indicator, and Craftpix's supply shelves and weapon racks.

Before any public release: confirm the packs marked **No license** or **license to confirm** above, and keep this repository
private (the Snoblin, unTied and Craftpix licenses forbid redistributing their art outside a game).
