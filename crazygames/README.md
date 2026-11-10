# Roll a Knight!: Idle RPG on CrazyGames

Everything a CrazyGames submission asks for, and where it comes from.

| What | File |
| --- | --- |
| The game, zipped for upload | `crazygames/build/roll-a-knight-crazygames.zip` (built by `npm run build:crazygames`; not in git) |
| Cover, landscape 16:9 (1920x1080) | [`covers/cover-landscape-1920x1080.png`](covers/cover-landscape-1920x1080.png) |
| Cover, portrait 2:3 (800x1200) | [`covers/cover-portrait-800x1200.png`](covers/cover-portrait-800x1200.png) |
| Cover, square 1:1 (800x800) | [`covers/cover-square-800x800.png`](covers/cover-square-800x800.png) |
| Preview video, landscape (1920x1080) | [`video/trailer-landscape-1920x1080.mp4`](video/trailer-landscape-1920x1080.mp4) |
| Preview video, portrait 2:3 (1080x1620) | [`video/trailer-portrait-1080x1620.mp4`](video/trailer-portrait-1080x1620.mp4) |
| Title, description, controls, tags | [The listing](#the-listing), below |

## Build and upload

```bash
npm install
```

```bash
npm run build:crazygames
```

That type-checks, builds `dist-crazygames/` with CrazyGames' SDK on the page, checks the bundle
against the portal's limits (SDK loaded first, relative paths only, at most 1500 files and 250 MB,
at most 50 MB before play) and writes the zip. Today: 58 files, 9.1 MB, of which 6.1 MB is music
and sounds fetched as they're needed: inside the 20 MB that the mobile homepage asks for.

In the [Developer Portal](https://developer.crazygames.com/): submit a new game, type **HTML5**,
upload the zip (`index.html` is at its root), then fill in the form from [the listing](#the-listing).
Two answers in the form matter to the game:

- **Progress save: "Yes, using the Data Module from the CrazyGames SDK".** The game keeps its save
  there. Leave it unticked and the SDK refuses every save call; the game then falls back to the
  browser's own storage, which only CrazyGames' automatic progress save can sync.
- **Orientation: landscape and portrait.** Both are laid out (the trailer shows each).

Then run the portal's **Preview / QA tool** on the upload: it plays the game as CrazyGames would
and lists every SDK call it saw. What it should see is in [What the SDK is told](#what-the-sdk-is-told).

To try the same build on your own machine, where the SDK stands in for the portal (ads are a grey
sheet for five seconds, saves stay in the browser):

```bash
npm run dev:crazygames
```

## The listing

**Name:** Roll a Knight!: Idle RPG

**Category:** Action (second choice: Adventure)

**Tags:** Idle, RPG, Roguelike, Pixel, Knight, Dungeon, Fantasy, Luck, Mouse, 1 Player

**Devices:** desktop, tablet, phone. **Orientation:** landscape and portrait. **Players:** 1.
**Age:** suits PEGI 12 (cartoon pixel fighting; no chat, no purchases, no links out).

**Description**

> Roll a Knight!: Idle RPG is a pixel action roguelite with a slot machine for a heart. A magic
> altar rolls knights for you, for free, forever, even while you're away. Most are Commons. One in
> 25,000 is a Mythic. One in 250 million is a Primordial. Every spin could be the one.
>
> Take three of your knights down into an endless dungeon and fight it yourself: aim with the
> mouse, cut enemy shots out of the air, and dash through whatever you can't cut. In a fight every
> knight keeps rolling skills of its own, from a plain Twin Slash to a Legendary that stops the
> screen: Excalibur, Meteor Storm, Thousand Arrows, Skyfall.
>
> Twelve places to fight through, from a sunny hamlet to lava caves and a crystal grotto, a boss
> every five floors, and a town of keepers between dives where gold becomes luck, levels and
> upgrades. Fall, come back stronger, and when the run has given all it has, be reborn with more
> luck for good.

**Features**

- An altar that never stops rolling: 78 knights in 13 rarities, with odds from 1 in 3 to 1 in 250 million
- Twin-stick fighting: aim, attack, cut shots out of the air, dash through the rest
- Six classes (Guardian, Blade, Ranger, Cleric, Arcanist, Lancer), each with six skills that roll themselves in a fight
- Twelve pixel-art places, ten floor designs, traps, merchants you can rob, and a boss every five floors
- Luck upgrades, combat upgrades, perks and rebirths that last
- It keeps rolling while you're away, and saves to your CrazyGames account

**Controls** (desktop)

- WASD or arrow keys: move
- Mouse: aim. Hold left click (or J): attack
- Space or Shift: dash
- E: roll your skill (in a fight it rolls itself)
- 1, 2, 3: switch knight
- T: auto battle on or off
- E or Enter at the hub: talk to a keeper. Enter or F in the dungeon: talk, buy
- Esc: back to camp (it asks first)

**Controls** (phone and tablet)

- Drag on the left: move
- Hold ATTACK: attack (it aims for you; drag it to aim by hand)
- The dash and SKILL buttons, AUTO and CAMP: tap

## What the SDK is told

All of it goes through `src/platform/` (`crazygames.ts` wraps the SDK, `portal.ts` is what the game
imports). In any other build there is no SDK on the page and every call is a no-op.

| When | Call |
| --- | --- |
| The page opens | `SDK.init()`, awaited before the save is read (9 s at most, then the game starts without it) |
| From then until the first frame is up | `game.loadingStart()` ... `game.loadingStop()` |
| PLAY on the title (one click from load to play) | `game.gameplayStart()`: the first one is where CrazyGames stops measuring the download |
| Settings open, the "back to camp?" question, the welcome-back report, the title | `game.gameplayStop()`, and `gameplayStart()` when it closes |
| A boss beaten for the first time in a run; a rebirth | `game.happytime()` |
| Each floor | `game.setGameContext({ floor, biome, rebirths })` and `game.reportGameCompletedPercentage()` (floor 60, once through all twelve places, is 100) |
| The portal's mute switch (`game.settings.muteAudio`, and its change listener) | The game's master volume goes to zero, above its own Sound and Music sliders |
| Saving and loading | `data.getItem` / `setItem` / `removeItem` under the key `rolling-knight-save` |
| A guest signs in mid-game (`user.addAuthListener`) | Saving stops and the page reloads onto the account's own save, so the account is never overwritten |
| Touch controls or keyboard hints | `user.systemInfo.device.type` (a touchscreen laptop is a desktop) |

### Ads

Only through the SDK, and the game plays the same when none come (an ad blocker, Basic Launch, no fill).

- **Midgame** (`ad.requestAd('midgame')`), asked for at two breaks, both with the screen already
  black: after a boss floor, between its portal and the next floor; and after a wipe, as the hub
  comes up. Never in a player's first four minutes. How often one actually shows is the SDK's call.
- **Rewarded** (`ad.requestAd('rewarded')`), two offers, both optional and both off the fight:
  - *Welcome back*: "GOLD x2, watch an ad" beside COLLECT, the same size. Pays the squad's gold
    from the time away a second time.
  - *Oracle's Favour*: in the Luck sheet at the hub, a Luck Potion (luck x2 for a minute) every
    ten minutes. The Luck pill shows a small "x2" while it's there to take.
- From the ask until the ad is over the game is paused and nothing in it can be pressed. Its sound
  is cut on `adStarted` and back on `adFinished` / `adError`, not on the ask.
- `adError` never pays a reward: "no ad right now, try again in a little while". On `adsDisabled`
  (Basic Launch) the rewarded offers disappear rather than sit there doing nothing.

To leave an ad out, each has one place: the `break` case in `src/ui/App.tsx` (midgame),
`canDouble` in `src/ui/WelcomeBack.tsx`, `Favour` in `src/ui/panels.tsx`.

## CrazyGames' requirements, one by one

| Requirement | Where the game stands |
| --- | --- |
| Download before play at most 50 MB (20 MB for the mobile homepage) | 9.1 MB in all |
| At most 250 MB and 1500 files | 9.1 MB, 58 files |
| Relative paths only | Vite `base: './'`; the pack step fails the build on an absolute one |
| Chrome, Edge, Safari | WebGL 1 and Web Audio; built for Safari 14, Chrome 90, Edge 90, Firefox 90 and up |
| Mouse, keyboard and touch | All three; touch controls by the portal's device type |
| Landscape on desktop | Yes, and portrait on phones |
| No page scroll, no text selection, no pinch zoom | `user-select: none`, `touch-action: none`, `overscroll-behavior: none`; arrows and Space don't scroll |
| Sound back after an iOS interruption | Every tap's end resumes the audio; a watchdog rebuilds a stuck context (`src/audio/engine.ts`) |
| Readable at 907x510, 821x462, 800x450 and up, at one device pixel per CSS pixel | Checked at each; the HUD now uses whole pixels on such a frame, and the welcome-back report fits without scrolling |
| The same at 60, 144 and 165 Hz | The game runs on elapsed time; hit-stop and timers are tested at several frame rates |
| English | Yes (English only) |
| No fullscreen button of its own | None |
| No links out, no cross-promotion | None; credits are plain text |
| PEGI 12 | Cartoon pixel fighting |
| Into play at once, or one click | One click: PLAY |
| Gameplay start and stop | See the table above |
| Ads through the SDK only, game paused and muted while one shows, fine with none | See Ads |
| Progress saved to the CrazyGames account | The SDK's data module (tick it in the form) |
| No logins of its own | None |
| Three covers and two preview videos | In this folder |

Not there and not asked for: banners, in-game purchases, multiplayer, leaderboards, a sitelock
(optional; if you add one, allow `*.crazygames.com` and the apps' origins).

## The covers

From the cover art in [`covers/source/`](covers/source/), by `tools/crazygames/covers.py`:

```bash
python3 -I tools/crazygames/covers.py
```

## The trailer

Two films of the same cut, 20 seconds, silent, opening on the cover: 1920x1080, and 1080x1620 from
a phone-sized screen with its touch controls. Every frame is the game itself, drawn at a sixtieth
of a second after the last (`tools/trailer/`): nothing is sped up.

The takes and what each is there to show are in `tools/trailer/shots.cjs`. To film them again and
cut the two videos (needs the dev server, `npm run dev`, plus Playwright and ffmpeg; about an hour
on a machine without a graphics card):

```bash
node tools/trailer/cut.cjs --base http://localhost:5173/
```
