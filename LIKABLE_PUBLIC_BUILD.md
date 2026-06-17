# The Likable Public — Claude Code Build Brief

## Context

You are working inside a VS Code project folder that already contains `likable_public_canvas.html` — an earlier prototype with an infinite pannable/zoomable canvas of civic room tiles. You need to build `likable_public_v3.html` in the same folder, replacing the old two-tab layout with a new three-column layout described below.

Do not delete or modify the original file. Build the new one alongside it.

---

## What to build

A single self-contained HTML file called `likable_public_v3.html`.

No build tools. No frameworks. No external JS libraries. One file: HTML + CSS + vanilla JS.

The only external resources are Google Fonts (loaded via `<link>`):
- `IBM Plex Mono` (weights 400, 500, 700, italic 400)
- `Cormorant Garamond` (weights 300, 400, 600, italic versions of each)
- `Inter` (weights 300, 400, 500)

---

## Layout

The page is a **fixed three-column stage** that fills the full viewport below a fixed topbar. No page scroll — the essay column scrolls internally.

```
┌──────────────────────────────────────────────────────────────┐
│  TOPBAR (fixed, 48px tall)                                   │
│  brand left · subtitle center · warmth% + minted right      │
├─────────────────┬──────────────────┬─────────────────────────┤
│  LEFT CANVAS    │   ESSAY CENTER   │   RIGHT CANVAS          │
│  ~33% width     │   380px fixed    │   remaining width       │
│                 │                  │                          │
│  lived-in tiles │  scrollable text │  looked-at tiles        │
│  (cold, grey)   │  + inline        │  (warm, terracotta)     │
│                 │  interactions    │                          │
│  pannable       │                  │  pannable               │
│  zoomable       │  essay footer    │  zoomable               │
│                 │  (fixed bottom)  │                          │
└─────────────────┴──────────────────┴─────────────────────────┘
```

Use CSS Grid on `.stage`: `grid-template-columns: 1fr 380px 1fr`.

`.stage` is `position: fixed; top: 48px; left: 0; right: 0; bottom: 0`.

---

## CSS custom properties (theme tokens)

Define these on `:root`. They are mutated by adding body classes as the user scrolls.

```css
:root {
  --paper: #ededea;
  --ink: #181816;
  --terra: #b6573a;
  --sage: #7a8c73;
  --radius: 0px;
  --font-display: 'IBM Plex Mono', monospace;
  --font-body: 'IBM Plex Mono', monospace;
  --font-accent: 'Cormorant Garamond', serif;
  --warmth-tint: rgba(182,87,58,0);
  --canvas-bg-l: #e8e5e0;
  --canvas-bg-r: #ede8e2;
}
```

### Warm stages — applied as body classes `w1` through `w5`

| Class | `--paper` | `--ink` | `--radius` | `--warmth-tint` | `--font-body` | `--font-display` |
|---|---|---|---|---|---|---|
| `w1` | `#f0ede6` | `#1c1b16` | 0px | — | IBM Plex Mono | IBM Plex Mono |
| `w2` | `#f4f0e7` | `#201d12` | 0px | `rgba(182,87,58,0.03)` | IBM Plex Mono | IBM Plex Mono |
| `w3` | `#f7f2ea` | `#241e0f` | 4px | `rgba(182,87,58,0.06)` | Inter | IBM Plex Mono |
| `w4` | `#faf5ee` | `#2a1e0d` | 9px | `rgba(182,87,58,0.09)` | Inter | IBM Plex Mono |
| `w5` | `#fdf8f2` | `#321e0a` | 16px | `rgba(182,87,58,0.12)` | Inter | Cormorant Garamond |

Also update `--canvas-bg-l` and `--canvas-bg-r` in `w4` and `w5` to slightly warmer values.

All transitions on `body`: `background 0.7s, color 0.7s`. All UI elements that use `var(--paper)`, `var(--ink)`, `var(--radius)` will transition automatically.

Add a `body::before` full-viewport overlay with `background: var(--warmth-tint)`, `pointer-events: none`, `z-index: 5`, `transition: background 0.7s` — this is the warm amber wash that bleeds in as the user reads.

---

## Topbar

Fixed, 48px height, `z-index: 200`, `border-bottom: 1.5px solid var(--ink)`.

Three items spaced with flexbox space-between:
- **Left:** brand name "The Likable Public" — IBM Plex Mono, 12px, 700, uppercase, 0.14em tracking
- **Centre:** "scroll the essay · the corpus flanks you" — IBM Plex Mono, 9px, uppercase, 0.14em tracking, 40% opacity
- **Right:** "Likability `<b id="warmth-pct">0%</b>` · Likes minted `<b id="top-minted">0</b>`" — IBM Plex Mono 9px, `<b>` elements in `var(--terra)`

---

## Canvas columns (left and right)

Both columns are `position: relative; overflow: hidden; cursor: grab; touch-action: none`.

Left column background: `var(--canvas-bg-l)` with `border-right: 1.5px solid var(--ink)`.
Right column background: `var(--canvas-bg-r)` with `border-left: 1.5px solid var(--ink)`.

Inside each column, a `.canvas-world` div positioned `absolute top:0 left:0`, with `transform-origin: 0 0; will-change: transform`. The world is transformed via `translate(ox, oy) scale(s)`.

Each column has a `.col-label` — absolutely positioned at the bottom centre, IBM Plex Mono 8px uppercase, 30% opacity, pointer-events none. Left says "lived-in", right says "looked-at" in `var(--terra)`.

### Pan and zoom

Both columns are independently pannable. Implement pointer events (pointerdown / pointermove / pointerup + setPointerCapture) for drag-to-pan. On `wheel`, zoom toward cursor — clamp scale between 0.25 and 2.5.

Track: `lOx, lOy` for left; `rOx, rOy` for right; shared `cScale`.

Single `applyTransforms()` function that sets both worlds simultaneously.

### Focus system

When a section of the essay enters the viewport, call `setFocus(row)`. This:
1. Adds class `has-focus` to both canvas columns
2. Marks tiles with `data-focus-row === row` as `.focused`, removes it from others
3. Pans both canvases to centre the focused cluster

CSS: `.col-canvas.has-focus .tile:not(.focused) { opacity: 0.18; transition: opacity 0.5s; }` — everything else dims.

`setFocus(-1)` releases focus and removes the dimming.

---

## Tiles

### Data

Generate 49 tiles (7 columns × 7 rows) with deterministic pseudo-random values. Use a hash function on the tile index to get stable values across reloads:

```js
const seed = (n) => {
  let x = n * 2654435761 | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b | 0;
  return (x >>> 0) / 0xffffffff;
};
```

For each tile `i`:
- `name`: cycle through the ROOMS array (20 civic room names — see below)
- `before`: `4 + Math.floor(seed(i*3) * 44)` — the original likes (4–48)
- `after`: `7800 + Math.floor(seed(i*7) * 11000)` — the performed likes (~7k–19k)
- `hasExt`: `seed(i*11) < 0.32` — whether it has a fire extinguisher (left column only)
- `x`: `col * 256 + (seed(i*5) - 0.5) * 2 * 55 + (row % 2) * 44`
- `y`: `row * 198 + (seed(i*13) - 0.5) * 2 * 55`
- `focusRow`: `Math.floor(i / 14)` — groups tiles into focus clusters (0–3)

ROOMS array (20 names):
```js
["Holding room","Clinic bay","Reading room","Pharmacy counter","Public toilets",
 "Waiting bay","Records office","Stairwell","Vaccination booth","Registry desk",
 "Interview suite","Triage corner","Locker room","Service corridor","Day room",
 "Intake desk","Observation bay","Filing room","Staff kitchen","Assessment room"]
```

### Tile HTML structure

```html
<div class="tile" style="left:Xpx; top:Ypx" data-idx="N" data-done="0" data-before="B" data-after="A" data-focus-row="R">
  <div class="tile-flag">lived-in</div>
  <div class="tile-room">
    <div class="wall"></div>
    <div class="floor"></div>
    <div class="fix"></div>
    <div class="lamp"></div>
    <!-- only in left tiles, only if hasExt: -->
    <div class="ext" title="Exempt from refit"></div>
    <div class="plant">🪴</div>
  </div>
  <div class="tile-foot">
    <span class="tile-name">Room name</span>
    <span class="tile-likes">23</span>
  </div>
</div>
```

### Tile CSS

Width: 180px. `border: 1.5px solid var(--ink)`. `border-radius: var(--radius)`. `background: #fafaf6`. `position: absolute`. `cursor: pointer`.

`.tile-room` height: 110px. Overflow hidden. Background `#c2bcb3`.

Interior elements (all `position: absolute`):
- `.wall`: full inset, background `#b4aea6`
- `.floor`: bottom 34%, full width, background `#827c73`
- `.fix` (the fixture/furniture): 38% wide, 46% tall, bottom 34%, left 31%, background `#676058`, border `1.5px solid #4c4740`
- `.lamp`: top 5px, horizontally centred, 5px wide × 20px tall, background `#4c4740`
- `.plant`: bottom 34%, right 8%, font-size 16px emoji, `opacity: 0`, `transition: opacity 0.6s`
- `.ext` (fire extinguisher): bottom 34%, left 7%, 9px wide × 24px tall, background `#c0392b`, border `1.5px solid #7a2417`, z-index 4

`.tile-foot`: flex row space-between, padding `6px 9px`, `border-top: 1.5px solid var(--ink)`, transitions on border-color.

`.tile-name`: IBM Plex Mono, 8px, uppercase, 0.08em tracking, 55% opacity.

`.tile-likes`: IBM Plex Mono, 700, 12px. Transitions colour.

`.tile-flag`: absolute, top 5px left 5px, IBM Plex Mono 7px uppercase, background `var(--ink)`, color `var(--paper)`, padding `2px 5px`, z-index 5, `border-radius: var(--radius)`.

### Tile states

**`.tile.cafe`** (lived-in → looked-at transformation):
- `border-radius: calc(var(--radius) + 12px)`
- `.tile-room` background: `#e6d2bc`
- `.wall` background: `#d9c6ae`
- `.floor` background: `#c0906a`
- `.fix` background: `#cfaa7a`, border-color: `#a07048`, border-radius: `28px 28px 4px 4px`
- `.lamp` background: `#a07048`, border-radius: `3px`
- `.plant` opacity: `1`
- `.tile-likes` color: `var(--terra)`
- `.tile-flag` background: `var(--terra)`, text: "looked-at"

**`.tile.prelooked`** (right column tiles — start partially warm):
Same colour overrides as `.cafe` on the interior elements, plus `.tile-likes` in `var(--terra)` and `.tile-flag` background `var(--terra)`. Right column tiles should show a likes value partway between `before` and `after` on load: `before + Math.floor((after - before) * 0.35)`.

### Refit function

```js
function refitPair(idx) {
  // refit lTiles[idx] (left) and rTiles[idx] (right)
  // Left tile: add .cafe, animate likes from before → before + 12% of gap
  // Right tile: add .cafe, animate likes from current → after (full jump)
  // Animate with cubic-ease-out over 900ms using requestAnimationFrame
  // On right tile completion: add to mintedTotal, increment refittedCount, update all displays
}
```

---

## Essay column

`position: relative; display: flex; flex-direction: column; background: var(--paper); z-index: 20; transition: background 0.7s`.

Inner `.essay-scroll`: `flex: 1; overflow-y: scroll; overflow-x: hidden; padding: 52px 36px 160px`. Thin custom scrollbar (3px, 20% opacity).

Footer `.essay-footer`: `border-top: 1.5px solid var(--ink); padding: 8px 16px; display: flex; justify-content: space-between; align-items: center`. IBM Plex Mono 8px uppercase. Contains "Liked rooms" label, `.minted-num` (font-size 13px, color `var(--terra)`) showing total, "likes minted" label.

### Essay typography

**Kicker** (above title): IBM Plex Mono, 8px, 0.22em tracking, uppercase, 35% opacity, margin-bottom 28px.

**Title** (`h1.essay-title`): `font-family: var(--font-display)`, size clamp(22px, 3.2vw, 36px), weight 700, line-height 1.1, `transition: font-family 1.4s ease`. This element visibly shifts from Mono → Garamond at warm stage 5.

**Section number** (`.section-num`): IBM Plex Mono, 8px, 0.22em tracking, uppercase, 30% opacity, margin-bottom 14px, display block.

**Body text** (`.essay-body`): `font-family: var(--font-body)`, 14.5px, line-height 1.9. `transition: font-family 1s ease`. Paragraphs margin-bottom 1.1em.

**Pull quote** (`.pullquote`): `font-family: var(--font-accent)`, italic, weight 300, clamp(17px, 2.2vw, 24px), line-height 1.45, `border-left: 2px solid var(--ink)`, padding `10px 0 10px 20px`, margin `28px 0`.

**Source tag** (`.source`): IBM Plex Mono, 8px, 0.1em tracking, uppercase, 35% opacity, display block, margin-top 5px.

---

## Essay content and structure

The essay has five sections separated by four interaction moments. Each section and each moment has two data attributes:

- `data-warm="N"` (1–5) — triggers warmth class when this element scrolls into the upper 70% of the viewport
- `data-focus-row="N"` (0–5) — triggers canvas focus on a cluster of tiles

### Sections

**Section I · The Question** (`data-warm="1"`, `data-focus-row="0"`)
- Three paragraphs about worked vs. performed space
- Pull quote: *"The aesthetic of our moment is the smooth: polished, frictionless, made to be liked."* — Byung-Chul Han, Saving Beauty
- Paragraph about Han's smooth as social logic, not style

**Section II · The Spectacle Set in Plaster** (`data-warm="2"`, `data-focus-row="2"`)
- Two paragraphs on Debord. Quote ends: *"this will photograph well."* in `<em>`.

**Section III · The Estate, Mid-Performance** (`data-warm="3"`, `data-focus-row="3"`)
- Berger paragraph (the gap between living and appearing)
- Paragraph describing the canvas: left = rooms doing jobs, right = rooms performing them

**Section IV · What the Room Does to Itself** (`data-warm="4"`, `data-focus-row="5"`)
- Paragraph introducing the word "inviting"
- Pull quote: *"The spectacle is not a collection of images, but a social relation among people, mediated by images."* — Guy Debord, The Society of the Spectacle
- Paragraph about the fire extinguisher — exempt from refit, but in the real building it moves

**Section V · Who Is It For** (`data-warm="5"`, `data-focus-row="5"`)
- Two paragraphs concluding the essay
- Final line (small, 35% opacity, IBM Plex Mono 11px): "Rooms refitted: `<span id="refitted-count">0</span>` of 49 · Likes minted this session: `<span id="bot-minted">0</span>`"

---

## Interaction moments

Each is a `.moment` block with `border: 1.5px solid var(--ink); border-radius: var(--radius); margin: 28px 0; overflow: hidden; transition: border-color 0.7s, border-radius 0.7s`.

Has a `.moment-header` (IBM Plex Mono, 8px, 0.18em tracking, uppercase, 45% opacity, flex row space-between, padding `9px 14px`, border-bottom `1px solid rgba(26,26,22,.12)`) and a `.moment-body` (padding `16px 14px`).

### Moment 1 — LoRA Strength Slider
Placed **between Section I and Section II**. `data-moment="slider"`, `data-focus-row="1"`.

Header: "Drag to watch a room stop working and start performing" · `<span id="slider-state">lived-in</span>`.

Body:
- A flex row with label "LoRA strength", a horizontal range input `id="lora-slider"` min 0 max 100 value 0, and a readout span `id="lora-readout"` showing "0.00"
- Below: flex row with labels "lived-in" (left) and "looked-at" (right) at 40% opacity
- Small paragraph explaining the slider maps to LoRA strength in the ComfyUI workflow

**Range input style** (class `h-slider`): `-webkit-appearance: none; height: 2px; background: linear-gradient(to right, var(--ink) var(--fill,0%), rgba(26,26,22,.15) var(--fill,0%)); flex: 1`. Update `--fill` CSS variable on `input` events. Thumb: 14px × 14px, background `var(--ink)`, `border-radius: var(--radius)`.

**Slider JS behaviour:**
- On input: update readout to `(value/100).toFixed(2)`; update `--fill` style; update `#slider-state` text ("lived-in" < 0.1, "transforming…" middle, "looked-at" > 0.85)
- Progressively add `.cafe` to right-side tiles based on slider position: `threshold = Math.floor(v * rTiles.length)`, refit all tiles below threshold
- Dim left tiles: `lTiles.forEach(t => t.style.opacity = 1 - v * 0.4)`

### Moment 2 — Prompt Panel
Placed **between Section II and Section III**. `data-moment="prompt"`, `data-focus-row="2"`.

Header: "Describe the room you want" · "prompt → canvas".

Body:
- **Chips row** (`.prompt-chips`): five `.chip` elements — "terrazzo counter", "arched openings", "trailing pothos", "exposed conduit", "linoleum floor". Two of the warm chips get class `warm-chip`. Clicking toggles `.active` and appends the chip's descriptor text to the textarea.
- **Prompt wrap**: flex row with a `<textarea id="prompt-input">` (64px tall, pre-filled with `"public waiting room,"`) and an `<button class="prompt-send" onclick="applyPrompt()">apply →</button>`
- Small note: "The canvas on the right will reframe around rooms matching this description."

**Chip CSS**: IBM Plex Mono, 8px, uppercase, 0.1em tracking, `border: 1px solid rgba(26,26,22,.25)`, padding `4px 9px`, `border-radius: var(--radius)`, cursor pointer. `.active` and `:hover`: background `var(--ink)`, color `var(--paper)`. `.warm-chip.active`: background `var(--terra)`.

**`applyPrompt()` JS**: check textarea value for warm keywords (`arch|plant|terra|pothos|sage|warm|light|pendant|marble`). If matched, cascade-refit right tiles 0–7 with 80ms stagger between each.

### Moment 3 — Highlight → Replace
Placed **between Section II and Section III** (after the prompt moment). `data-moment="replace"`, `data-focus-row="3"`.

Header: "Click the paragraph — watch the writing perform" · `<span id="replace-badge">honest</span>`.

Body:
- `.replace-block` div (`cursor: pointer`, `font-size: 13.5px`, `line-height: 1.7`) containing the honest paragraph
- `.replace-hint` below: IBM Plex Mono, 8px, "↑ click to overwrite with performed copy"

**Honest text**: *"The public waiting room has never been designed for the person waiting. It has been designed against waiting — against the body that fidgets, the child who climbs, the person who needs to lie down. Its chairs are bolted to discourage loitering. Its lighting is punitive. It says: you are here, but you should not be here for long."*

**Performed text**: *"A civic waiting room is an opportunity to design toward something more than function. These are the spaces where people find themselves between things — a moment that, handled with care, can be genuinely restorative. The right material palette, the right quality of light, the right seat that doesn't announce itself as institutional: these are not luxuries. They are the difference between a room that works and a room that works beautifully."*

**`doReplace()` JS**: toggle `replaced` bool. Fade block to opacity 0, swap text, add/remove `.swapped` class (which sets `color: var(--terra)`), update hint text and badge, fade back to opacity 1. When swapping to performed: also refit one unrefitted right-side tile.

`.replace-block.swapped { color: var(--terra); }`

### Moment 4 — Counter Feed
Placed **between Section III and Section IV**. `data-moment="feed"`, `data-focus-row="4"`.

Header: "Rooms that simply are" · "counter-feed".

Body: A `.feed-list` with three `.feed-row` items, each containing:
- `.feed-thumb`: 44×32px, containing an inline SVG rendering the grey room (wall/floor/fixture in the cold palette)
- `.feed-meta`: `.feed-name` (IBM Plex Mono, 8.5px, uppercase) and `.feed-sub` (10px, 40% opacity description)
- `.feed-count`: IBM Plex Mono, 700, 12px, 35% opacity (tiny numbers: 7, 2, 3)

Three rooms:
1. "Stairwell · Block C" · "Used 2,300 times last month. No natural light." · 7 likes
2. "Service corridor · Level 2" · "Serves 14 departments. Never photographed." · 2 likes
3. "Locker room · Staff" · "The only private space in the building." · 3 likes

---

## Scroll observer

Attach a scroll listener to `#essay-scroll` (the internal scrollable div — not `window`).

On each scroll event:
1. Query all `[data-warm]` elements. For each, check `el.offsetTop - scrollTop < vpHeight * 0.7`. Track the max warm level visible.
2. Apply body classes `w1`–`w5` based on max warm level. Update `#warmth-pct`.
3. Query all `[data-focus-row]` elements. Find the one whose top is `< vpHeight * 0.65` and whose bottom is `> 0`. Track the highest focus-row value visible. Call `setFocus(activeFocus)`.

Call the scroll handler once on page load to initialise.

---

## Minted counter updates

Maintain `mintedTotal` (number). All four display elements update together:
- `#top-minted` (topbar)
- `#footer-minted` (essay footer)
- `#bot-minted` (essay section V)

Also maintain `refittedCount` → updates `#refitted-count`.

Animate the counter with cubic-ease-out over 900ms whenever a tile is refitted.

---

## Files to produce

Just one file: `likable_public_v3.html`

Place it in the same folder as `likable_public_canvas.html`.

Open with Live Server in VS Code (or `python -m http.server 8000` then `localhost:8000/likable_public_v3.html`) — do not open as `file://` because of how browsers handle local HTML references.

---

## Checklist before finishing

- [ ] Three columns fill the full viewport, no outer page scroll
- [ ] Essay scrolls internally and drives warmth classes on `body`
- [ ] Both canvases are independently pannable and zoomable
- [ ] Left tiles are cold/grey; right tiles start in a partial warm state
- [ ] Tapping a tile refits the pair (left bumps slightly, right jumps to full likes)
- [ ] setFocus dims non-focused tiles and pans to the focused cluster
- [ ] LoRA slider progressively transforms right tiles and dims left tiles
- [ ] Prompt chips append text to textarea; applyPrompt cascade-refits right tiles
- [ ] Replace block swaps text on click with terracotta colour
- [ ] Counter feed displays small like counts for unheroic rooms
- [ ] Warmth tint overlay bleeds in across full page as user reads
- [ ] Title font transitions from IBM Plex Mono to Cormorant Garamond at w5
- [ ] Minted counter animates smoothly across all four display elements
- [ ] `var(--radius)` affects tile corners, moment borders, chip corners, and slider thumb simultaneously
