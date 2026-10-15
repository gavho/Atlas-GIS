# DESIGN — Atlas

Lime on neutral, with a dark default and a light mode. The look borrows from **Watermelon UI** (lime primary, motion, sliding pills, dock, islands) and **Cult UI** (texture cards, halo glass, cosmic button, dynamic island, rolling numbers). Those are React + Tailwind + Framer Motion libraries. Atlas ports their techniques to plain CSS (no build, no runtime dependencies).

**Rule:** the map is the hero. Chrome is quiet neutral. Lime marks only what is *active, selected or primary*.

## 1. Tokens (`:root` in `index.html`)
Use the custom properties and never hard-code UI colors. Data colors for layers come from `CFG.palette`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--canvas` | `#09090b` | `#fafafa` | page and map background |
| `--surface-1…4` | `#0f0f11 → #232327` | `#fff → #e6e6e9` | panels → hovers |
| `--hairline / -strong / -tertiary` | `#232327 / #2f2f34 / #3d3d43` | `#e4e4e7 / #d4d4d8 / #c4c4c9` | borders |
| `--ink / -muted / -subtle / -tertiary` | `#fafafa … #5f5f68` | `#0a0a0b … #9f9fa8` | text |
| `--primary` | `#7ccf00` (Watermelon `oklch(76.8% .233 130.85)`) | `#5ea500` | lime text, lines, map selection, focus |
| `--primary-hover` | `#9ae600` | `#497d00` | hover, map hover |
| `--primary-fill / -fill-hi` | `#7ccf00 / #9ae600` | same | **filled** faces (buttons, active tool). Always dark text (`--on-primary`) |
| `--on-primary` | `#0a0f00` | `#0a0f00` | text on lime fills (contrast > 9:1) |
| `--island / --island-ink / --island-sub` | `#000 / #fafafa / #a1a1aa` | same | dynamic-island pills, map tooltips |
| `--glass` | `rgba(15,15,17,.78)` | `rgba(255,255,255,.82)` | floating panels, menus, toasts |
| `--glow` | lime ring + 22px bloom | softer | primary hover, active tool, brand mark |
| `--danger / --warn / --success` | `#f87171 / #fbbf24 / #7ccf00` | `#dc2626 / #b45309 / #5ea500` | toasts, destructive actions |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | | dock, pills, theme switch |
| `--ease-island` | `cubic-bezier(.32,.72,0,1)` | | islands, modals, menus |

In light mode, lime **text** uses the darker `--primary` (AA on white), and lime **fills** stay bright with dark text.

## 2. Type and shape
- Inter 400/500/600/700 for UI. JetBrains Mono for numbers, coordinates and table cells (`.mono`, tabular figures).
- Sizes: 13px for UI and 12px for secondary text. Headings: 16px for the inspector, 17px for modals, 26px/700 for the empty-state hero with a lime `<em>`.
- Radii: `--r-sm` 7, `--r-md` 9, `--r-lg` 14. Modals 18, islands 22, dock 18.

## 3. Component recipes
| Component | Source | Recipe |
|---|---|---|
| **Cosmic CTA** `.btn.cta` (Open) | Cult `cosmic-button` | A `::before` conic gradient of lime fills spinning 3 s linear at `inset:-200%`. A `::after` face inset 1.5px with a vertical fill gradient, plus `--glow`. Use on **one or two** CTAs only. |
| **Primary** `.btn.primary` (Save, OK) | Cult `neumorph-button` | A vertical `--primary-fill-hi → --primary-fill` gradient, inset top highlight and bottom lip, glow on hover. |
| **Shimmer** `.btn.shimmer` (Export) | Watermelon `shimmer-button` | A light band at `translateX(-110%)` that sweeps to `110%` over 700 ms on hover. |
| **Dock** `#draw-toolbar` | Watermelon/Cult `dock` | A glass column (radius 18). Items nudge `translateX(2px) scale(1.08)` on hover. The active tool has a lime fill, `scale(1.1)`, glow and a 3px lime bar. Spring easing. |
| **Sliding pill** `.seg .ind` (2D/3D) | Watermelon `fluid-tabs` | One absolutely positioned indicator. `segIndicator()` sets left/width from the active button, with spring easing. |
| **Theme switch** `.tswitch` | Watermelon `switch-mode` | A track with a knob sliding 24px. The sun/moon icon rotates 90°. |
| **Dynamic island** `#measure-chip`, `#edit-bar`, `#present-bar`, map tooltip | Cult `dynamic-island` | A black pill (radius 22) that animates in from `scale(.55,.8)` with `--ease-island`. Content fades in from `blur(4px)`. Values in lime mono. |
| **Glass** `.glass`, `.floating`, `.menu`, `.toast` | Cult `halo-*` | `--glass` + `backdrop-filter: blur(24px) saturate(1.5)` + `--shadow` (inset highlight + layered drop). |
| **Texture card** `.texture` (empty state, modals, metric strip, export cards) | Cult `texture-card` | A vertical surface gradient + inset top highlight + inset hairline + outer dark hairline. |
| **Progress ring** `.ring` | Watermelon `scroll-island` | A conic gradient to `--p` with a radial mask ring. `.busy` spins a quarter arc. |
| **Rolling number** (status bar feature count) | Cult `rolling-number` | `rollTo()` tweens with ease-out-expo over 700 ms. Instant in performance mode. |
| **Dot grid** `#map` background | Cult `bg-*-dot-grid` | A static `radial-gradient` of 1px dots at 18px. It shows only while tiles load. Not animated (for performance). |
| **Target layer** `.lrow.active` | — | Surface-2 card, a 3px glowing lime bar at left, and a "TARGET" tag. |

## 4. Map styling
- Each layer gets its own palette color (lime first). Fill opacity 0.3, outline 1.6px.
- **Selection:** fill and outline switch to `--primary`. **Hover:** outline `--primary-hover`.
- GIS Area: the outside is dimmed with `--canvas` at 60% (dark) / 45% (light), with a dashed lime boundary.
- Prints always use the light print palette (`PRINT()`), whatever the screen theme.

## 5. Motion and performance
- All motion is CSS transforms or opacity. No JS physics.
- `prefers-reduced-motion` and **performance mode** (`body.perf`) turn off every animation and transition, and performance mode also drops blur (glass over a WebGL map costs GPU).

## 6. Don't
- Don't put lime on large surfaces or body text.
- Don't add a second accent color to the chrome. Status uses `--warn` / `--danger` dots only.
- Don't add JS UI libraries. Port the technique instead.
