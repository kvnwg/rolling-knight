# The hub's keepers: a PixelLab sprite brief

This brief is for an assistant making sprites in PixelLab (pixellab.ai). Read **The look** and
**Settings for every character** once. Then work through the characters in order: create each one,
add its animations, and download everything at the end (see **Export**).

## The look

Rolling Knight is a top-down (3/4 view) pixel action roguelite. Between dives the player walks round
the hub: a small court of warm flagstones at night in front of a timber shop called the Gilded Reel.
It has string lights, a few ball lamps and fireflies, and leaves frame it on every side. Each keeper
runs one counter. They have to look like they belong next to the player's knights: tiny chibi figures
with big heads, a 1 px dark plum outline, bright saturated colours and soft shading. The mood is cozy
and a little funny, never grim.

`knight-style-ref.png` (next to this file) shows two of the game's knights at actual size. If PixelLab
offers a style or reference image, give it that file.

## Settings for every character

- **Canvas:** 32 × 32 px, the same as the knights. The character stands about 22 to 24 px tall and
  is centred, with the feet about 4 px above the bottom edge. Don't make them bigger: a keeper is a
  knight's height.
- **View:** low top-down (3/4).
- **Directions:** 4 (south, east, north, west). South faces the camera. Each character lists the
  directions the game actually uses. Generate all 4 anyway so they can turn later.
- **Body:** humanoid, with chibi proportions (the head is about 40 to 45% of the height).
- **Outline:** single-colour outline in dark plum (#3a263a). If only black is offered, use black.
- **Shading:** medium. **Detail:** medium. **Light:** from the top left.
- **Colours:** plain daylight colours. The game darkens and warms them for night by itself, so don't
  bake in darkness, glow halos or a ground shadow. Use a transparent background.
- **Eyes:** small dark chibi eyes, like the knights'. The Oracle is the one exception: her eyes glow
  gold.
- Each keeper keeps exactly the same colours in every animation and every direction.

## Animation rules (every character)

- Nobody walks. Every animation plays in place with the feet planted, and seated characters stay
  seated.
- Idles loop seamlessly (the last frame flows into the first) and stay subtle: moves of about 1 px.
  Save the big motions for the one-shot actions.
- Idles keep the eyes open, because the game plays a separate blink over them now and then.
- One-shot actions start and end on the idle's first pose, so the game can cut straight back to it.
- The frame counts below are what I'd like. If PixelLab only offers fixed counts, take the nearest.
- The text under **Prompt** is what to type into PixelLab's custom animation (animate with text)
  box. If a built-in template fits better (for example *breathing idle*), use it.

---

## 1. Oracle Vesper, keeper of the Gilded Reel

**Where she is:** standing in the shop's open doorway at the top of the court, facing you. She runs
the summoning altar, where knights are rolled. Warm and theatrical, she calls you "dear". Her lines:
"The reels never stop." / "Hm. I sense a Legendary in your future. Or soup."

**Directions used:** S (the others are nice to have).

**Description**

```
Chibi fortune-teller woman in a deep violet hooded robe that reaches the ground, the hood pulled up and edged in gold, a gold shawl across her shoulders. Her face is in the shadow of the hood, with two glowing golden eyes and a small warm smile, and a few strands of white hair fall at her cheeks. In her right hand she holds a tall wooden staff topped with a glowing lavender crystal orb in a gold claw setting. Mysterious but kind.
```

**Colours** (for touch-ups): robe and hood `#2c1640 #4a2466 #6e3a8e` · gold trim and shawl
`#b8862a #f0c850` · glowing eyes `#ffd84a` · skin `#b07a5a #d8a07a #f4c8a0` · white hair
`#c8c4d4 #f2f0f8` · orb `#6a3ab8 #9a6af0 #d0b0ff #fff4ff` · staff wood `#62401e #9a6a3a`

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| idle | 6 | loop | all | Gentle breathing idle: the robe rises and falls, the hem sways a pixel, the orb on the staff pulses brighter then dimmer once per loop. Feet planted, staff upright. |
| blink | 2 | once | S, E, W | The glowing eyes in the hood narrow to a thin line, then open again. |
| greet | 6 | once | S | Tilts her head and bows slightly toward the viewer, her free hand opening palm-up in welcome, then back to standing. |
| foresee | 8 | once | S | Lifts the staff a little and the orb flares bright, two or three tiny sparkles float up from it and her eyes glow brighter, then she lowers the staff. |

*In the game:* **greet** plays when you talk to her. **foresee** plays when a spin starts building
toward a rare knight.

---

## 2. Tinker Pell, outfitter

**Where he is:** in the shop's right wing in front of his shelves of bottles and gadgets, facing you.
He sells upgrades for gold. He's eager, fidgety and a bit scatterbrained. His lines: "A gear here, a
spring there..." / "Don't touch that. Or do. It's fine."

**Directions used:** S (the others are nice to have).

**Description**

```
Chibi young inventor with warm brown skin and short messy black hair, round brass-rimmed glasses, a big grin and raised eyebrows. Teal work shirt with the sleeves rolled up, a tan canvas apron with pockets full of little tools, dark brown trousers, brown shoes. A big silver wrench in his right hand. Energetic and cheerful.
```

**Colours:** skin `#7a4a30 #9a6440 #be8458` · hair `#141016 #2a2430 #443c4a` · shirt
`#16404a #1e6070 #2e8a96` · apron `#8a7a5a #b8a67a` · trousers `#2a2018 #43342a #5e4a3a` · shoes
`#2e2018 #4a3424` · wrench `#e6e8f0 #9aa2b2 #5a6072`

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| idle | 6 | loop | all | Bouncy idle: bobs on his toes and taps the wrench against his open left palm in time. |
| blink | 2 | once | S, E, W | Eyes close behind the glasses and open again. |
| tinker | 8 | once | S | Holds up a small brass gear in his left hand and tightens it with quick twists of the wrench. A tiny yellow spark pops off on the last turn and he looks pleased. |
| eureka | 6 | once | S | Pushes his glasses up his nose with one finger, then throws the wrench up in triumph with a big grin. |

*In the game:* **tinker** plays now and then while you browse his upgrades. **eureka** plays when
you buy one.

---

## 3. Sage Orrin, reader of sigils

**Where he is:** sitting in a high-backed armchair on the right of the court, turned sideways to face
left, with two teal-glowing sigil stones beside him. He sells perks to players who have been reborn.
He's old and slow and speaks in few words: "Mm." / "Sit. Listen. The stones are talking."

**The chair is drawn by the game.** Draw him sitting on nothing: a seated pose, knees bent forward,
feet on the floor, with no chair or stool. Create him standing first (that gives a consistent design
in every direction), then make the seated idle an animation. If PixelLab lets you set a seated base
pose instead, use that.

**Directions used:** W (the game mirrors it for E) and S.

**Description**

```
Chibi old sage, bald, with a very long white beard down to his belly, bushy white eyebrows, calm half-closed pale blue eyes and a flat, patient mouth. Long deep teal-green robe to the floor with an ochre-gold shawl over the shoulders, brown shoes peeking out. He holds a plain gnarled wooden staff in his right hand. Wise, sleepy, kind.
```

**Colours:** skin `#c88a6a #eab08a #ffd4b0` · beard and brows `#8a8698 #c8c4d4 #f2f0f8` · robe
`#143a34 #1e5a4e #2e7e6a` · shawl `#8a6a2a #c8a048` · staff `#62401e #9a6a3a` · sigil glow: teal

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| sit idle | 6 | loop | W, S | Sitting on an unseen chair, knees forward, the staff standing upright beside him in his hand. Slow deep breathing, the beard sways one pixel, eyes half shut. |
| blink | 2 | once | W, S | A slow, heavy-lidded blink. |
| stroke beard | 8 | once | W, S | Still seated, strokes his long beard slowly downward with his free hand, twice, thinking. |
| sigil | 8 | once | W, S | Still seated, raises his free hand palm-up. A small glowing teal rune appears above the palm, hovers, then fades, and the hand lowers. |
| doze | 10 | once | W, S | Still seated, his head slowly nods forward as he drifts off, then jerks back up awake, blinking. |

*In the game:* **sigil** plays when you choose a perk. **stroke beard** and **doze** play now and
then while nobody is talking to him.

---

## 4. Sister Maren, priestess of the shrine

**Where she is:** standing at her little candle shrine on the left of the court (a rose-gold rising
sun in a stone niche, with flowers round it), side-on and facing right toward it. She handles
rebirth. Calm and warm, with a gentle joke: "Every ending is a door." / "The flame never goes out. I
check."

**Directions used:** E (the game mirrors it for W) and S.

**Description**

```
Chibi young priestess with warm brown skin, gentle amber eyes and a soft smile. A white hood with gold trim covers her hair. She wears a long cream-white robe to the floor with a gold tabard hanging down the front, and pale shoes. In her right hand, at chest height, she holds a short white candle with a small orange flame in a little brass holder. Serene and kind.
```

**Colours:** skin `#7a4a30 #9a6440 #be8458` · hood `#9a94a8 #cfc8da #f4f0f8` · robe
`#a89c88 #d8ceb8 #f6efe0` · gold `#b8862a #f0c850` · shoes `#6a5a48 #8a7a64` · candle `#f4ead2` ·
flame `#fff2a8 #ff9a3a` · holder `#e0b040 #8a5a1a`

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| idle | 6 | loop | E, S | Calm breathing. The candle flame flickers and leans, changing shape a little every frame, and the robe hem sways a pixel. |
| blink | 2 | once | E, S | Eyes close softly and open again. |
| tend flame | 6 | once | E | Cups her free hand round the candle flame to shield it from a breeze. The flame steadies and brightens, then the hand lowers. |
| prayer | 8 | once | E, S | Bows her head and holds the candle in both hands in front of her, eyes closed, while the flame grows a little taller. Then she looks up again. |
| blessing | 10 | once | S | Lifts the candle high overhead with both hands. A ring of rose-gold light and small sparkles spreads out around her, then she lowers it. |

*In the game:* **blessing** plays on a rebirth. **prayer** plays when you talk to her. **tend
flame** plays now and then.

---

## 5. Warden Tobb, keeper of the stairs

**Where he is:** on the landing beside the dark stone steps down to the dungeon, at the foot of the
court, side-on and facing left across the steps. He picks the squad of three, levels them up and
sends them down. A gruff old soldier with a soft spot: "Stairs go down. Monsters come up." / "Back
in one piece, I hope."

**Directions used:** W (the game mirrors it for E) and S.

**Description**

```
Chibi sturdy town guard with dark brown skin, short black hair, a thick black mustache and stern eyebrows. He wears a round iron kettle helmet with a wide brim, a green padded gambeson with grey chain-mail sleeves, a gold tabard down the front, dark brown trousers and black boots. He holds a tall wooden spear with a steel tip upright in his right hand, its butt resting on the ground. Gruff but dependable.
```

**Colours:** skin `#5a3420 #784830 #9a6444` · hair and mustache `#141016 #2a2430` · helmet
`#3e4450 #6e7684 #a4acb8` · gambeson `#1a3a22 #285a32 #3a7e46` · mail `#4a4e5a #7a808e #a8aeba` ·
gold `#b8862a #f0c850` · trousers `#2e2620 #4a3e32 #62564a` · boots `#1e1a1e #38303a` · spear shaft
`#62401e #9a6a3a` · spear tip `#eef0f6 #aab2c2 #6a7082`

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| guard idle | 6 | loop | W, S | Standing guard: slow breathing, weight shifting slightly from one foot to the other, spear upright and still. The mustache twitches once. |
| blink | 2 | once | W, S | Eyes close under the helmet brim and open again. |
| peer down | 8 | once | W | Leans forward and peers down the stairs in front of him, shading his eyes with his free hand, then straightens up. |
| send-off | 6 | once | W, S | Thumps the spear butt on the ground once and gives a firm nod. |
| yawn | 8 | once | W, S | A big yawn as he stretches his free arm, then snaps back to attention, a little embarrassed. |

*In the game:* **send-off** plays when the squad heads down. **peer down** and **yawn** play now
and then.

---

## 6. The traveller, resting his feet

**Where he is:** a regular, not a keeper. He sits on a stool at the round table on the left of the
court with his back to you (we see him from behind), a mug in his hand. His lines: "Long day." /
"Best pie this side of the dungeon."

**The stool is drawn by the game.** Draw him sitting on nothing, as with the sage.

**Directions used:** N (from behind). S is optional.

**Description**

```
Chibi tired wanderer with light skin and short brown hair under a wide straw hat with a red band. He wears a blue shirt, brown trousers and worn brown shoes, and carries a big brown leather backpack. In his hand is a wooden mug of something frothy. Dusty and content.
```

**Colours:** skin `#b07a5a #d8a07a #f4c8a0` · hair `#2a1a14 #4a2e20 #6e4630` · hat
`#8a6a2a #c8a048 #ecd078` · hat band `#6a2a1a #a8402a` · shirt `#22304a #34507a #5076a6` · trousers
`#2a2018 #43342a #5e4a3a` · shoes `#2e2018 #4a3424` · backpack `#3a2414 #6a4426 #9a6a3a` · mug: wood
`#62401e #9a6a3a` with cream froth `#f4ead2`

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| sit idle | 6 | loop | N, S | Sitting on an unseen stool, slumped and relaxed. His shoulders rise and fall with slow breathing and the hat brim bobs a pixel. |
| sip | 8 | once | N, S | Lifts the mug to his mouth and drinks, then lowers it with a satisfied sigh, shoulders dropping. |
| stretch | 8 | once | N, S | Stretches both arms up overhead and rolls his neck, then slumps back down. |
| hat tip | 6 | once | S | Tips his straw hat toward the viewer with two fingers. |

---

## 7. (Optional) The shop cat

**Where it is:** a small black cat lying by the shop door, facing left. Purely for atmosphere.

**Settings:** quadruped, on the smallest canvas PixelLab allows (the cat is only about 12 px long and
8 px tall). Otherwise the same settings as above.

**Directions used:** W.

**Description**

```
Tiny black cat with bright yellow eyes, lying down in a loaf with its paws tucked under and its tail curled along one side. Sleepy and smug.
```

| Animation | Frames | Plays | Directions | Prompt |
| --- | --- | --- | --- | --- |
| idle | 4 | loop | W | Lying in a loaf, breathing slowly, with the tail tip flicking once. |
| slow blink | 3 | once | W | A slow, contented cat blink. |
| ear twitch | 3 | once | W | One ear twitches. |
| stretch | 10 | once | W | Gets up, stretches front paws forward with its back arched, then turns once and settles back into a loaf. |

---

## (Optional) The off-duty keepers

Three more keepers already have looks in the game, and their furniture is still in the court (the
anvil and forge, the curio cabinet, the round table), but nobody stands there now. Make them only if
you want the court busier. Use the same settings and the same kinds of animation (idle loop, blink,
and one or two actions).

- **Brannoc, the smith** (at the anvil): `Chibi burly smith with tan skin, bald with a full ginger
  beard and a big grin, a dark grey shirt with bare tanned forearms, a heavy brown leather apron,
  dark trousers and black boots, a hammer in his right hand.` Actions: wipes his brow; strikes the
  anvil with a burst of sparks.
- **Rusty Mags, the junk dealer** (at the curio cabinet): `Chibi old junk-dealer woman with pale
  skin, grey hair in a bun under a rusty-orange kerchief, round glasses, an olive-green shirt, a brown
  leather vest and blue trousers, holding iron tongs.` Actions: holds up a trinket and squints at
  it; polishes it on her vest.
- **Quartermaster Hilde** (at the round table): `Chibi quartermaster woman with a blond bob, a navy
  beret with a gold badge, a crimson shirt, a navy vest and trousers and black boots, holding a red
  leather ledger.` Actions: flips the ledger's pages; ticks something off with a quill.

---

## Export

- Download every animation of every character as PNG frames or sprite sheets: 32 × 32 px per
  frame, transparent, not scaled up.
- Name each file `<character>_<animation>_<direction>.png`, for example `oracle_idle_s.png` or
  `sage_sit-idle_w.png`. Use these character names: `oracle`, `tinker`, `sage`, `sister`, `warden`,
  `traveller`, `cat`.
- Put everything in one folder (or zip) and hand it back to the user.

*For wiring them into the game later:* as with the knights, the feet sit at pixel (15, 27) of each
32 × 32 frame. Idles hold their first frame longest (about 360 ms, then 100 to 260 ms a frame), and
one-shots run at about 100 ms a frame.
