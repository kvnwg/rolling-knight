# Credits and art licenses

Pack art is copied 1:1 into generated TypeScript modules or PNGs by the scripts in `tools/packs/`;
the raw packs are not in this repository. The in-game credits are in Settings.

| Art | Where it's used | Source and license |
| --- | --- | --- |
| PixelForge v1.0 (the game's own character pipeline) | The knights (all six classes, recolored per rarity and mutation), the slime, bat, wolf, goblins, goblin archer and chief, orc, skeleton, ogre and the Stone Warden boss, and a few of its FX (death poofs, bone crumble, stun stars, rock shards). `src/assets/pf/`, made by `tools/packs/pixelforge.py`. | Made for this game by the same author. |
| Snoblin, *Pixel RPG Prototype Characters* (the gray Default mannequin) | The skeleton of the characters PixelForge doesn't draw (cultists, monks, scarecrows, ghosts, pumpkin-heads, the demon) and of the old knight art, kept as a fallback. `src/render/packs/mannequin.ts`, made by `tools/packs/mannequin.py`. | Commercial and non-commercial use and editing allowed; **no redistributing or reselling the assets, even modified**. Attribution appreciated. |
| *Medieval* UI sheet (`MediavelFree.png`) | The HUD: the hanging wooden board and chains, wooden buttons, the plank sign, the framed HP bar, candles, daggers, corner brackets. `src/assets/ui/`, cut by `tools/packs/ui.py`. | **No license text in the download.** Check the pack's page before release. |
| *Cozy* UI sheet (`UiCozyFree.png`) | The parchment cards in the menus. `src/assets/ui/`. | **No license text in the download.** Check the pack's page before release. |
| Will Tice / unTied Games, *Super Pixel Effects Gigapack* (Free) v3.2.0 and *Super Pixel Effects Mini Pack 1* | Battle effects: hits, crits, slashes, fireballs, smoke, splats, sparkles, fireworks, lightning, heal, death, shockwaves, electric bursts, explosions. `src/render/packs/fx.ts`, made by `tools/packs/fx.py` (Dumpster Legend's tool, extended). | Commercial use allowed with credit **"Pixel Art Assets - Will Tice / unTied Games"** (shown in Settings). Bundling in a game is fine; no distributing the pack on its own. Not for AI training. |
| Pig and sheep Aseprite sheets | The farmland's Hog and Ram mobs. `src/render/packs/farm.ts`, as Dumpster Legend made them. | **No license or author in the download.** Find the source and its terms before release. |
| Dumpster Legend's sound recordings (17 clips: reel lands, tokens, heartbeats, the reveal slams, hauls, taps...) | Every recorded sound effect. `src/assets/sounds/`, played by `src/audio/`. | From Dumpster Legend, by the same author; no separate license note there either. |
| Pixelify Sans | All UI text | SIL Open Font License, via @fontsource/pixelify-sans. |
| Bitmap font, pixel helpers | In-world numbers and text | From Dumpster Legend (`src/render/pixel/`). |

Everything else (the remaining mobs; terrain, walls, water,
trees and props; folk and their portraits; the UI skin; lighting, weather and the reels) is drawn in
code for the game, and the music (eight themes and a victory sting) and the synthesized sounds are
composed in code (`src/audio/songs.ts`, `src/audio/instruments.ts`).

Not used: the MV Icons sheet, the modern clothes pack and the side-view character animation pack.

Before any public release: confirm the packs marked **No license** above, and keep this repository
private (the Snoblin and unTied licenses forbid redistributing their art outside a game).
