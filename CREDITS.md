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

## Music

All by Kevin MacLeod. Each track is cut into a seamless loop of whole bars (crossfaded at the loop
point), normalized to -18 LUFS and re-encoded as AAC by `tools/packs/music.py`, into
`src/assets/music/`; the victory sting is 6.4 s of its piece, from its third note through its last
chord. The in-game credit is in Settings (built from `src/audio/tracks.ts`).

| Track | Composer | License | Where it plays | Source |
| --- | --- | --- | --- | --- |
| Midnight Tale | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The hub (camp) | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Midnight%20Tale.mp3 |
| Village Consort | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The hamlet, the shrine | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Village%20Consort.mp3 |
| Dancing at the Inn | Kevin MacLeod | Public domain (CC0), from FreePD.com (closed in 2025) | The farmland | https://archive.org/download/freepd/misc/Dancing%20at%20the%20Inn.mp3 (FreePD's archive: https://archive.org/details/freepd) |
| Celtic Impulse | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The forest, the swamp | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Celtic%20Impulse.mp3 |
| Angevin B | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The graveyard, the crypt | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Angevin%20B.mp3 |
| The Snow Queen | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The tundra, the crystal grotto | https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Snow%20Queen.mp3 |
| Desert City | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The desert | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Desert%20City.mp3 |
| Mountain Emperor | Kevin MacLeod (incompetech.com) | CC BY 4.0 | The ember depths | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Mountain%20Emperor.mp3 |
| Death and Axes | Kevin MacLeod (incompetech.com) | CC BY 4.0 | Boss floors | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Death%20and%20Axes.mp3 |
| Discovery Hit | Kevin MacLeod (incompetech.com) | CC BY 4.0 | A boss falling (the victory sting) | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Discovery%20Hit.mp3 |

The CC BY 4.0 attribution, as incompetech asks for it: "Midnight Tale", "Village Consort", "Celtic
Impulse", "Angevin B", "The Snow Queen", "Desert City", "Mountain Emperor", "Death and Axes",
"Discovery Hit" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0
License, http://creativecommons.org/licenses/by/4.0/. Changes: cut into loops and a sting,
crossfaded at the loop points, loudness-normalized and re-encoded. A credit this full belongs
wherever the game lists its credits (Settings does).

## Made in code

Everything else (the remaining mobs; terrain, walls, water,
trees and props; folk and their portraits; the UI skin; lighting, weather and the reels) is drawn in
code for the game, and the synthesized sound effects and the places' sounds under the music (the
fire, crickets, birds, wind, frogs, drips...) are made in code (`src/audio/sfx.ts`,
`src/audio/ambience.ts`).

Not used: the MV Icons sheet, the modern clothes pack and the side-view character animation pack.

Before any public release: confirm the packs marked **No license** above, and keep this repository
private (the Snoblin and unTied licenses forbid redistributing their art outside a game).
