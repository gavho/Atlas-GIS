# ORD ALP: requirements (FR-ORD)

A planner-facing app for reading the O'Hare Airport Layout Plan, built on the Atlas engine. It explains what everything is, what changes, what conflicts, and whether a new idea fits.

## Build
- **Generated file:** `dist/ORD-ALP.html` is generated: `node scripts/build-ord-app.mjs` combines `dist/Atlas-GIS.html` with `ord/`. **Never edit the output.** Edit Atlas (shared engine) or `ord/` (ORD only), then re-run the script.
- **The seam:** Atlas reads an optional `window.ATLAS_EXT`, defined in the CONFIG section of `dist/Atlas-GIS.html`:
  - `brand` (name, title, mark, icon), `defaultView` (a built-in view), `tours(baseTours)`, `empty` (start-screen text), `autosaveKey`, `readOnlyHint`;
  - `hooks.filter`, `hooks.dim`, `hooks.paint`, `hooks.visible`, `hooks.legend`, `hooks.legendClick`;
  - `hooks.describe`, `hooks.inspector`, `hooks.editable`, `hooks.drawTarget`;
  - `onBoot(api)`.
  Without it, Atlas is unchanged.
- **Sources:**
  - `ord/dictionary.js`: CAD layer → plain language;
  - `ord/ord-logic.js`: pure logic, unit-tested in `tests/ord.test.mjs`;
  - `ord/ord.js`: UI;
  - `ord/ord.css`: design tokens only.
- **Data:** the ORD package comes from `scripts/build-ord-alp-package.mjs`. The synthetic test sample is `samples/ord_alp_sample.atlas.json` (`node scripts/make-ord-sample.mjs`).
- **Tests:** `node --test tests/` and `node scripts/build-ord-app.mjs && node tests/smoke.ord.mjs`.
- **Client folder:** `node scripts/build-client-folder.mjs --app dist/ORD-ALP.html --project <ORD-Future-ALP.atlas.zip> --out "<folder>" --changes-only` writes `Open ORD ALP.html`, `project.js` and a client README (FR-ORD-9).

## Phase 1: shell and click-to-explain (done)
- **FR-ORD-1** Branding: the app is titled "ORD ALP". Its start screen asks for the ORD ALP package. It autosaves under its own key (`ord-alp-autosave`), separate from Atlas.
- **FR-ORD-2** The ALP layers are read-only.
  - **Blocked:** every data edit (fields, values, delete, explode, edit shape) shows "read-only" and does nothing. The inspector shows values read-only, without edit or delete actions, and the Target badge is hidden on those layers.
  - **Drawing:** a layer the planner created (or imported) takes new shapes when it is the highlighted layer. Otherwise shapes go to **My proposals**, a group with one layer each for polygons, lines and points (fields name, type, height_ft, notes), created on first use.
  - **Editable:** everything except the CAD-derived ALP layers.
- **FR-ORD-3** Explain anything:
  - **Hover:** the tip shows the plain name and the status and drawing ("Runway Object Free Area · Future · FUT-RWY-AREAS").
  - **Inspector card:** status chip, theme, code, *what it is*, *why it matters* (with the FAA reference), source drawing, CAD layer and block, and **Show all N like this**. That button selects every feature on the same CAD layer and focuses its layer.
  - **Unknown layers:** these say "isn't in the ORD dictionary yet", so gaps can be reported.
- **FR-ORD-4** Status from CAD naming:
  - **Removal words:** DEMO → *To be demolished*; RELOCATED/_RELO → *Relocated*; UNUSEABLE → *Closed / unusable*; PAST_ → *Superseded*.
  - **Existing:** `-EX`/`EXIST` → *Existing*.
  - **Future:** a `FUT` layer or drawing, or `NEW` → *Future*.
  - **Otherwise:** *Existing*.
- **Coverage:** on the October 2026 ORD package, the dictionary names 99.98% of features.

## Phase 2: lenses and plan views (done)
- **FR-ORD-5** Views panel (above the layer tree): *Everything*, *Airfield*, *Safety areas*, *Imaginary surfaces*, *NAVAIDs*, *Buildings*, *Landside*, *Security & property*.
  - **Counts:** each shows its feature count and a one-line description.
  - **Filtering:** a lens shows only features whose dictionary theme belongs to it. Runway, taxiway and apron pavement stays as faint grey context.
  - **Scope:** it filters features, not layers (`hooks.filter`/`hooks.dim`), and labels follow.
- **FR-ORD-6** Plan-view switch in the top bar:
  - **As drawn:** the delivered layer visibility.
  - **Existing:** existing, demolished, relocated and closed features; no future.
  - **Future:** future and retained existing; no demolished, relocated or closed.
  - **Changes:** new = `--success`, removed = `--danger`, unchanged = grey.
  - **Removal layers:** the hidden "Removed / demolition" layers appear in Existing and Changes, and never in Future (`hooks.visible`).
- **FR-ORD-7** Legend: while a lens or plan view is active, the on-map legend opens and lists plain-language categories (Changes: its three colors) instead of CAD layer names (`hooks.legend`).
- **FR-ORD-8** Top bar: the ORD app hides *Set GIS area* (the package sets it), and the brand never collapses.
- **FR-ORD-9** Client folder: double-clicking `Open ORD ALP.html` opens the bundled project (`project.js` = `window.ATLAS_BUNDLE`, the .atlas.zip as base64).
  - **Autosave:** the full session (delivered ALP plus client layers) is saved in browser IndexedDB under `ord-alp-autosave`; later launches of the same bundle resume it.
  - **Save changes:** *Save changes* / Ctrl+S writes an `.atlas.json` changes file containing every layer not in the delivered bundle, including imported layers and sketches regardless of their names. It excludes the delivered ALP layers. The client sends that file back to the project team.
  - **Open changes:** opening a workspace in a bundled ORD app asks whether to add its layers to the open ALP or replace the project; adding is the default. Duplicate layer IDs are skipped.
  - **New delivery:** the bundle id is a content hash.
  - **Start over:** *More → Reload the original project*.
  - **Real ORD package:** the first launch takes about 6 s, a relaunch about 3 s, and switching views about 1 s.

## CDA theme, categories and tours (done)
- **FR-ORD-10** Categories: under the Views grid, a "Categories" list shows every plain-language category in the current view and plan mode, with feature counts.
  - **Toggles:** unticking hides that category across every drawing at once.
  - **Show only:** double-clicking a category shows only it.
  - **Revert:** *Show all* reverts; *Hide all* clears the view.
  - **Per view:** each view remembers its own choices (`lensPlan(..., off)`).
- **FR-ORD-11** CDA theme (`ord/ord.css`): token overrides for dark (navy) and light (white/navy), in the CDA palette (navy #0C2742, blue #2385C7, sky #3EB3E3, red #E91D2C).
  - **Selection:** amber.
  - **Branding:** the red/blue banner strip, the CDA mark in the top bar, the Chicago-star favicon, and the start screen on the tower photo (`ord/assets/hero.jpg`, inlined by the generator).
  - **No new hard-coded UI colors:** everything goes through tokens.
- **FR-ORD-12** Guided tours for this layout: *Read the ALP*, *Sketch a proposal*, *Navigate the map* (without the GIS-area step), *Layers & groups* and *Save & share*. They are supplied through `EXT.tours`.

- **FR-ORD-13** Restyle from the legend.
  - **Legend contents:** the on-map legend always lists plain-language categories (up to 60; the Changes view lists its three colors).
  - **Click a category** to get a menu: *New color*, *Choose color…*, *Solid / Dashed lines*, *Thicker / Thinner*, *Stronger / Lighter fill*, *Hide this category*, *Show only this*, *Reset this style* and *Reset all category styles*.
  - **Scope:** a change applies to every feature of that category in every drawing, through Atlas's `hooks.paint` → `{ color, width, fillOpacity, dash }`, which replaced `hooks.color`. The Changes colors take precedence.
  - **Storage:** styles are kept in this browser (`localStorage['ord-alp-symbology']`). They are a viewer preference and are not saved into the project.
- **FR-ORD-18** No sample data: the app has no sample-data button, menu item or command. Test data lives under `samples/` for tests only.
- **FR-ORD-14** Name and logo: the app is **ORD ALP**. Its logo is the CDA flag square, Chicago star and CDA wordmark. The client-folder page is `Open ORD ALP.html`.

- **FR-ORD-15** Layers panel follows the view. While a view, plan mode or category filter is active, the Layers panel highlights the drawings it uses and fades the rest (`hooks.layerState` → `{ on, n }`).
  - **Highlighted rows** show the in-view feature count.
  - **Groups** that contain any used drawing are highlighted too.
- **FR-ORD-16** Delivered folder launch.
  - **Loading card:** while the bundled project opens or resumes, the start screen is replaced by a "Loading the ORD ALP…" card with a progress bar (`EXT.loading`), and the Layers panel says "Loading the project…".
  - **No file toasts:** the per-file loading toast is suppressed during this load (`handleFiles(..., { quiet })`).
- **FR-ORD-17** Color by, from the legend: *One color*, *CAD layer*, *Source drawing* or *Plan status*.
  - **Stable colors:** each value gets a color that stays the same across all drawings.
  - **Legend:** the values are listed under the category (up to 12).

- **FR-ORD-19** Default view: **O’Hare airfield** is a built-in view (`EXT.defaultView`, bbox `[-87.94, 41.946, -87.87, 42.009]`, the runways, taxiways and terminals).
  - **Launch:** the app opens zoomed to the airfield.
  - **Views menu:** it is first, labelled "(default)", and has no delete control. It is not stored in `S.presets`, so a user's own saved views can't remove it.
  - **Home:** the Home key and the map's home button return to it. It is also the first stop in Present and appears in the command palette.
- **FR-ORD-20** No camera lock. The app has no GIS-area lock (its button is hidden), so a package or an older session that carries one has it dropped on load. The built-in default view also releases any lock that doesn't contain it, with a "Camera lock released" toast, so panning can never be clamped to one direction.

## Next phases (approved plan)
- **Phase 3 — Conflict checker:** future structures, pavement and fences checked against RSA/OFA/RPZ/TOFA/POFA/critical areas, the BRL, and Part 77 footprints (2D only). The results list zooms to and explains each conflict.
- **Phase 4 — Plan & test a proposal:** a live ALP check for each "My proposals" shape (areas touched, distance to the runway and taxiway centerlines, acres), plus a change-summary tab.
