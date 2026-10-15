# CLAUDE.md — build rules for Atlas

Read **PRD.md** (requirements, IDs FR-*) and **DESIGN.md** (tokens and component recipes) before making changes.

## Hard rules
- **Single file.** The app is `index.html` (HTML + one `<style>` + one `<script type="module">`). No bundler, no npm runtime deps, no build step. Node is fine for dev scripts only (`scripts/`, `tests/`).
- **Must run from `file://`** by double-click. Workers come from inline Blob URLs. Don't use `fetch()` for local files.
- **Pinned CDN versions** from PRD §6.1 (jsDelivr). Don't upgrade unless asked. If you upgrade, update PRD §6.1.
- **No user data leaves the machine.** No analytics or telemetry, no uploads, no geocoding. The only network traffic allowed is CDNs, basemap, terrain and font tiles.
- **UI follows DESIGN.md.** Use the CSS custom properties, never hard-coded colors. Dark is the default and light must also work. Lime fills use `--primary-fill` with `--on-primary` text.
- Keep the script sections and banner comments in PRD §6. State lives in `S`. Changes go through `changed()`/`emit()`, and the UI renders from state. `select()` is the only writer of the selection.
- Units: **US feet, miles and acres** in the UI. Store geometry in WGS84 (EPSG:4326).
- Every file or geometry operation is wrapped so that malformed input produces a toast, never a crash. Every data edit calls `recordUndo(layer)` first.
- **Performance matters.** Keep 3D terrain opt-in, keep animations CSS-only (off in performance mode and with reduced motion), and lazy-load heavy libraries with `needLib()` (jsPDF, shp-write) instead of adding `<script>` tags.
- **One renderer.** `syncLayer(layer, m, o)` draws a layer on the main map *or* a hidden print map (`openExportMap`). Don't fork styling logic. Sheet layouts (`drawSheet`) draw through a drawer API that targets both jsPDF and canvas.
- New outputs follow the wizard pattern (`wizard()` + `make*()` wrapped in `wireUpExport`), with defaults that produce a usable result without changes.

## Code style: Ponytail
The [Ponytail](../ponytail/skills/ponytail/SKILL.md) rules apply. Make the smallest complete change: reuse what's here, delete before adding, no speculative options. Never cut validation, data-loss handling, security or accessibility. Mark known limits with `shortcut: <limit>, <when to upgrade>`.

## Workflow
- Reference the FR IDs you implemented in your summary and commit messages, for example `FR-FLD-3: retype fields`.
- Run `node --test tests/` (field logic) and `node tests/smoke.browser.mjs` (real browser over `file://`, zero console errors) before saying something works. Look at the screenshots it writes.
- If Ponytail is installed, run `/ponytail-review` before each commit.
- Test data lives in `/samples` (synthetic). Never commit real data; `/private` is git-ignored.
- If a requirement is unclear or conflicts with another, ask, or propose a PRD edit. Don't invent behavior.
