# The keepers' portraits: a PixelLab brief

This brief is for an assistant making sprites in PixelLab (pixellab.ai). Read **What these are**,
**Settings for every portrait** and **Animation rules** once. Then work through the five keepers in
order: make the portrait, add its animations, and download everything at the end (see **Export**).

## What these are

Rolling Knight is a pixel-art roguelite. Between dives the player walks round a small lamplit court
at night, where five keepers each run a counter. Talking to a keeper opens their screen, and across
the top of it is a portrait: the keeper seen from the waist up, standing behind their counter and
facing the player. Behind them is a painted backdrop of their trade, lit by lamps and candles.

These portraits are drawn up close in an **anime pixel style**:
- natural proportions (not chibi)
- big anime eyes with a heavy upper lash line, an iris that is dark under the lid and light at its
  foot, a pupil and a white glint
- thin brows that carry the mood, a nose of one shadow pixel, a small mouth and a soft blush
- hair in locks, each lit on the side facing the light, with a band of shine across the crown
- cloth in soft folds
- every material cel-shaded in a few hue-shifted steps (cool shadows, warm lights), lit from the
  top left
- a coloured outline round the figure (a darker shade of each material, not black), lighter where
  the light catches the edge

The game draws the backdrop and the counter. You only make the keeper.

**Reference images** are in `portraits/`, next to this file: `oracle.png`, `tinker.png`,
`sage.png`, `sister.png` and `warden.png`. Each is the keeper's current portrait at actual size,
64 × 64. Use each one as the reference or starting image for its keeper, so the new version is the
same person in the same clothes, only better drawn and animated. (`all-current-x4.png` is all five
side by side, enlarged, for a quick look.)

## Settings for every portrait

- **Tool:** this is a single image facing the camera, not a walking character. Use PixelLab's
  create-image tool (from text, with the reference image if the tool takes one), not the
  4-direction character creator. Then animate the image with PixelLab's animation tool
  (animate with text). If the tools have other names now, use the closest ones.
- **Frame size:** 64 × 64 px, with a transparent background.
- **Framing:**
  - The keeper faces the viewer and is cut off at the waist by the **bottom edge of the image**,
    which is the top of the counter.
  - The top of the head sits about 6 to 8 px below the top edge. A hood, hat or spear tip may reach
    the top row.
  - The head is about 20 px wide and 24 px tall, and the shoulders about 40 px wide, centred.
  - The hands rest on the counter, on the bottom rows of the image.
  - A held staff or spear stands upright on the right of the picture.
- **Outline:** selective (coloured) outline, not plain black.
- **Shading:** a few cel steps per material, hue-shifted, light from the top left. Detail: high.
- **Colours:** clean, plain colours. The game adds the warm lamplight and makes glowing bits glow by
  itself, so don't bake in a dark background, glow halos or coloured light. Keep the things that
  glow (the Oracle's eyes and orb, candle flames, the sage's rune) as bright, clean colours.
- Keep every keeper's colours and design exactly the same in all their animations.

## Animation rules (every portrait)

- The keeper stays behind the counter and keeps facing the viewer: no turning away, no stepping
  back, no zooming.
- The bottom edge (the counter line) never moves. Hands may lift for an action but go back to the
  same spot.
- Idle loops are subtle (moves of about 1 px) and loop seamlessly (the last frame flows into the
  first). Idles keep the eyes open, because blink is its own animation.
- One-shot actions start and end on the idle's first frame, so the game can cut straight back to it.
- The frame counts below are what I'd like. If PixelLab only offers fixed counts, take the nearest.
- The text under **Prompt** is what to type into the animation tool.

Every keeper gets the same four basics plus actions of their own. The basics:

| Animation | Frames | Plays | What it's for in the game |
| --- | --- | --- | --- |
| idle | 6 | loop | Always, while the screen is open |
| blink | 3 | once | Every few seconds over the idle (open, half shut, shut) |
| talk | 4 | loop | While their line of dialogue is showing |
| happy | 6 | once | When you buy something from them |

The prompts for these basics are written into each keeper's table below.

---

## 1. Oracle Vesper, keeper of the Gilded Reel

**Her counter:** the summoning altar, where knights are rolled. Behind her (drawn by the game) are
violet velvet curtains, crystal balls on shelves, candles and drifting stars. Warm and theatrical,
she calls you "dear". Her lines: "The reels never stop." / "Hm. I sense a Legendary in your future.
Or soup."

**Reference:** `portraits/oracle.png`

**Description**

```
Waist-up portrait of an ageless fortune-teller woman facing the viewer, anime pixel art style. A deep violet hooded robe, the hood up and edged with a broad gold band that frames her face. Silver-white hair with a soft fringe under the hood, big glowing golden eyes with long lashes, a small knowing smile. A gold stole hangs down both sides of her front, with a gold sash at the waist. On the right of the picture her hand grips a tall wooden staff topped with a glowing violet crystal orb; her other hand rests on the counter edge. Mysterious, warm, a little theatrical.
```

**Colours** (for touch-ups): robe and hood `#2c1640 #4a2466 #6e3a8e` · gold `#b8862a #f0c850` ·
eyes (glowing) `#ffd84a` · skin `#b07a5a #d8a07a #f4c8a0` · hair `#8a8698 #c8c4d4 #f2f0f8` · orb
`#3a1a6a #6a3ab8 #9a6af0 #d0b0ff #fff4ff` · staff `#4a2c18 #6e4426 #946a40`

| Animation | Frames | Plays | Prompt |
| --- | --- | --- | --- |
| idle | 6 | loop | Slow breathing, the shoulders and stole rising and falling a pixel. The orb on her staff pulses brighter and dimmer once per loop, and her eyes keep their soft glow. |
| blink | 3 | once | The glowing eyes close (half, then shut, the glow going out) and open again. |
| talk | 4 | loop | Speaking warmly: her mouth opens and closes with a slight tilt of her head, still smiling. |
| happy | 6 | once | Delighted: her eyes close into happy arcs, she gives a little laugh with a shoulder lift, and the orb flares once. |
| foresee | 8 | once | She leans in a little and her eyes glow brighter. The orb flares bright and two or three tiny sparkles float up from it, then everything settles back. |
| hush | 6 | once | Raises a finger to her smiling lips (a playful "shh, the reels are speaking") and lowers it again. |

*In the game:* **foresee** plays when a spin starts building toward a rare knight. **hush** plays
now and then while a spin runs.

---

## 2. Tinker Pell, outfitter

**His counter:** upgrades for gold. Behind him (drawn by the game) are plank walls, shelves of
coloured bottles and jars, a slate board of painted upgrades, brass gears and lanterns. He's eager,
fidgety and a bit scatterbrained. His lines: "A gear here, a spring there..." / "Don't touch that.
Or do. It's fine."

**Reference:** `portraits/tinker.png`

**Description**

```
Waist-up portrait of an excitable young inventor facing the viewer, anime pixel art style. Warm brown skin, wild spiky black hair, big round brass-rimmed glasses with bright amber eyes behind them, raised eyebrows and a wide toothy grin. A teal long-sleeved work shirt and a tan canvas apron with a chest pocket holding a red and a yellow pencil. On the right of the picture he holds a big steel wrench upright; his other hand rests on the counter edge. Energetic and a bit scatterbrained.
```

**Colours:** skin `#7a4a30 #9a6440 #be8458` · hair `#141016 #2a2430 #443c4a` · eyes `#e0902a` ·
glasses rims: brass · shirt `#16404a #1e6070 #2e8a96` · apron `#8a7a5a #b8a67a` · wrench
`#e6e8f0 #9aa2b2 #5a6072`

| Animation | Frames | Plays | Prompt |
| --- | --- | --- | --- |
| idle | 6 | loop | Fidgety idle: a small bounce, the wrench tapping lightly against his shoulder in time, his spiky hair bobbing a pixel. |
| blink | 3 | once | Eyes close behind the glasses and open again. |
| talk | 4 | loop | Talking fast and excitedly: mouth opening and closing with his grin, eyebrows bobbing. |
| happy | 6 | once | Eureka: throws the wrench up beside his head in triumph with a huge grin, and a white glint flashes across his glasses. |
| tinker | 8 | once | Holds up a small brass gear and tightens it with quick twists of the wrench. A tiny yellow spark pops off on the last turn and he nods, pleased. |
| sheepish | 6 | once | Scratches the back of his head with his free hand and gives an awkward grin. |
| glint | 4 | once | A white shine sweeps across the lenses of his glasses as he pushes them up his nose with one finger. |

*In the game:* **tinker** and **glint** play now and then while you browse. **sheepish** plays when
you can't afford something.

---

## 3. Sage Orrin, reader of sigils

**His counter:** perks, for players who have been reborn. He sits in a high-backed green armchair
(drawn by the game) in front of teal curtains, with glowing rune stones and candles round him. He's
old and slow and speaks in few words: "Mm." / "Sit. Listen. The stones are talking."

**Reference:** `portraits/sage.png`

**Description**

```
Waist-up portrait of an ancient, gentle sage facing the viewer, seated (no chair drawn), anime pixel art style. Pale skin, a bald shining head with tufts of white hair at the sides, heavy-lidded calm pale-blue eyes with smile lines, bushy white brows, a flat patient mouth, and a huge flowing white beard that covers his chest down to the counter. A deep teal-green robe with an ochre-gold shawl. On the right of the picture he holds a gnarled wooden staff with a crooked top; his other hand rests on the counter edge. Wise, sleepy, kind.
```

**Colours:** skin `#c88a6a #eab08a #ffd4b0` · beard and hair `#8a8698 #c8c4d4 #f2f0f8` · eyes
`#6a92c8` · robe `#143a34 #1e5a4e #2e7e6a` · shawl `#8a6a2a #c8a048` · staff `#4a2c18 #6e4426 #946a40`
· rune glow: bright teal

| Animation | Frames | Plays | Prompt |
| --- | --- | --- | --- |
| idle | 6 | loop | Slow, deep breathing; the long beard sways a pixel and his eyelids stay heavy and calm. |
| blink | 3 | once | A slow, heavy blink. |
| talk | 4 | loop | Speaking slowly: the beard moves a little with his mouth, and he gives a small nod. |
| happy | 6 | once | A slow, approving nod with his eyes closed contentedly, the beard lifting with a faint smile. |
| sigil | 8 | once | Lifts his free hand palm-up. A small glowing teal rune appears above the palm and his eyes glint teal, then the rune fades and the hand lowers. |
| beard stroke | 8 | once | Strokes his long beard slowly downward with his free hand, twice, thinking. |
| doze | 10 | once | His head slowly nods forward as he drifts off, then jerks back up awake, blinking. |

*In the game:* **sigil** plays when you roll a perk. **beard stroke** and **doze** play now and
then. **happy** plays when you take a perk.

---

## 4. Sister Maren, priestess of the shrine

**Her counter:** rebirth. Behind her (drawn by the game) is a warm brick wall lined with rows of
candles, and an arched niche with a rose-gold rising sun whose rays spread over her head. Calm and
warm, with a gentle joke: "Every ending is a door." / "The flame never goes out. I check."

**Reference:** `portraits/sister.png`

**Description**

```
Waist-up portrait of a serene young priestess facing the viewer, anime pixel art style. Warm brown skin, black hair with a blue sheen parted under a white hood trimmed with gold, gentle amber eyes with long lashes, a soft smile. A cream-white robe with a long gold tabard down the front marked with a small orange rising-sun emblem, and a gold cord belt. Both hands rest on the counter edge; the hand on the right of the picture holds a short white candle with a small flame in a little brass holder. Calm, warm, quietly funny.
```

**Colours:** skin `#7a4a30 #9a6440 #be8458` · hair `#141016 #2a2430 #443c4a` · eyes `#d8962a` ·
hood `#9a94a8 #cfc8da #f4f0f8` · robe `#a89c88 #d8ceb8 #f6efe0` · gold `#b8862a #f0c850` · candle
`#f4ead2` · flame `#fff2a8 #ff9a3a` · holder `#e0b040 #8a5a1a`

| Animation | Frames | Plays | Prompt |
| --- | --- | --- | --- |
| idle | 6 | loop | Calm breathing; the candle flame flickers and leans, changing shape a little every frame. |
| blink | 3 | once | Eyes close softly and open again. |
| talk | 4 | loop | Speaking gently: her mouth opens and closes with a soft smile and a slight tilt of her head. |
| happy | 6 | once | Presses her hands together under her chin and smiles warmly with her eyes closed. |
| prayer | 8 | once | Bows her head, eyes closed, and cups the candle in both hands as its flame grows a little taller. Then she looks up again. |
| blessing | 10 | once | Lifts the candle up before her with both hands. A ring of rose-gold light and small sparkles spreads out round her, then she lowers it. |
| tend flame | 6 | once | Shields the candle flame with her free hand as if from a draught; the flame steadies and brightens. |

*In the game:* **blessing** plays on a rebirth. **prayer** plays when you open her screen.
**tend flame** plays now and then.

---

## 5. Warden Tobb, keeper of the stairs

**His counter:** the squad. He picks the three knights who go down, levels them up and reforges
them. Behind him (drawn by the game) is a dark stone wall with a violet-glowing archway (the stairs
down to the dungeon) and two lamps on posts. A gruff old soldier with a soft spot: "Stairs go down.
Monsters come up." / "Back in one piece, I hope."

**Reference:** `portraits/warden.png`

**Description**

```
Waist-up portrait of a gruff, sturdy veteran guard facing the viewer, anime pixel art style. Dark brown skin, short black hair under a round iron kettle helmet with a wide riveted brim, stern drawn-down eyebrows, amber-brown eyes, a thick black mustache and a flat mouth. A green padded gambeson with grey chain-mail sleeves, a long gold tabard down the front with a small red emblem, and a brown leather belt. On the right of the picture he holds a tall spear upright, with a steel tip and a little red tassel; his other hand rests on the counter edge. Stern on the outside, soft-hearted underneath.
```

**Colours:** skin `#5a3420 #784830 #9a6444` · hair and mustache `#141016 #2a2430` · eyes `#b8742a` ·
helmet `#3e4450 #6e7684 #a4acb8` · gambeson `#1a3a22 #285a32 #3a7e46` · mail
`#4a4e5a #7a808e #a8aeba` · gold `#b8862a #f0c850` · spear shaft `#4a2c18 #6e4426 #946a40` · spear
tip `#e6e8f0 #b0b0c2 #4c4c5c` · tassel: red

| Animation | Frames | Plays | Prompt |
| --- | --- | --- | --- |
| idle | 6 | loop | Standing guard: slow breathing, the spear upright and still, the mustache twitching once. |
| blink | 3 | once | Eyes close under the helmet brim and open again. |
| talk | 4 | loop | Speaking gruffly: the mustache moves with his mouth, and he gives a short nod. |
| happy | 6 | once | A rare grin under the mustache and a firm nod, his free hand giving a thumbs-up. |
| inspect | 8 | once | Squints and leans in a little, stroking his mustache with his free hand, sizing someone up, then straightens up. |
| send-off | 6 | once | Thumps the spear butt down once and gives a firm salute with his free hand. |
| unimpressed | 6 | once | Raises one eyebrow and lets out a short huff through the mustache. |

*In the game:* **happy** plays when a knight levels up. **inspect** plays when you put a knight in
the squad. **send-off** plays as you close his screen with a full squad. **unimpressed** plays when
you can't afford something.

---

## Export

- Download every animation of every keeper as PNG frames or sprite sheets: 64 × 64 px per frame,
  transparent, not scaled up.
- Name each file `<keeper>_<animation>.png`, for example `oracle_idle.png` or
  `warden_send-off.png`. Use these keeper names: `oracle`, `tinker`, `sage`, `sister`, `warden`.
- Also save the still portrait of each keeper on its own as `<keeper>_still.png`.
- Put everything in one folder (or zip) and hand it back to the user.

*For wiring them into the game later:* each frame's bottom row sits on the counter top. Idles run
at about 180 to 360 ms a frame (the first held longest), talk at about 120 ms, and one-shots at
about 100 ms.
