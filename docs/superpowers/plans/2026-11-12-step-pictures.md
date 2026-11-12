# Step Pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make walkthroughs readable by looking. Each architecture box gets an icon, a labelled dot travels along each lit arrow, and a picture of the whole walkthrough is drawn under the architecture. The round-2 review fixes ship in the same change.

**Architecture:**
- All rendering stays in `kit/runtime.js`, inline SVG, with no dependencies.
- New spec fields are `node.icon`, `step.carry`, `arch.flowPicture` and `preset.expect`. `scripts/validate.mjs` checks them and a new `lint()` returns non-blocking warnings.
- `scripts/check.mjs` proves the pictures render and fit.
- A new `tests/` suite uses `node:test` plus Playwright: it builds small fixture specs and inspects the page.

**Tech Stack:** Node 22 ESM, vanilla browser JS (ES5 style, as in `kit/runtime.js`), inline SVG, `node:test`. Playwright is for tests only; it is preinstalled here, and the README says to `npm i -g playwright` elsewhere.

**Spec:** `docs/superpowers/specs/2026-11-11-step-pictures-design.md`

## Global Constraints

- Nothing new to install for users. Every page stays one self-contained HTML file: inline SVG, no external images.
- Icon set, exactly: `phone browser user server worker queue cache database storage batch lock globe search mail`.
- Default icon by `kind`: `clients` → `phone`, `cache` → `cache`, `store` → `database`, `queue` → `queue`, `kind` containing "batch" → `batch`, anything else → `server`.
- `step.carry` is at most 16 characters. Longer is a validator error. A missing `carry` on a step with two or more boxes is a lint WARN, and the label falls back to the first 3 words of `text`.
- Box height goes from 60 to 68 px. Box labels wrap to a second line at 13 px when one line at 14 px does not fit. Labels are never truncated.
- Boxes have no warning tint below 75% busy.
- Light and dark themes, phone width (390 px) and `prefers-reduced-motion` must all work. With reduced motion, the dot sits still at the middle of its arrow.
- `make.mjs` stays at about 1 to 2 s and checks at 1280 px only by default.
- "n/a" (with a `data-na` attribute) replaces NaN or `undefined` only in displayed values: rows, metrics, the click panel and chart legend. The simulator's inputs keep the 0 fallback.

## Review Focus

1. **A reply step whose path runs against the edges**, for example `["online", "api", "member"]`. The dots must travel from `online` to `member`, not from `member` to `online`. (Task 3, `token direction follows path order`.)
2. **A flow that visits the same box twice**, for example A→B then B→A. The picture must show one lifeline per box and two arrows. (Task 4, `revisited box has one lifeline`.)
3. **Clicking a preset or moving a slider during a walkthrough.** Repainting must keep the current step's dots and picture state. (Task 3, `tokens survive preset click`.)
4. **More than 5 boxes in one flow on a 390 px screen.** The picture scrolls sideways and the current step is in view. (Task 4, `wide picture scrolls current step into view`.)
5. **A `carry` with a symbol** ("▶ 2 new shows"). Its width is measured with `getBBox`, not by counting characters, so it is not reported as overflowing. (Task 5, `symbol carry does not falsely overflow`.)

---

## File Structure

- Modify `kit/runtime.js`:
  - Icon symbols and `iconFor(node)`.
  - Box layout (height, label wrap, no tint below 75%).
  - Tokens, inside the `arch` builder's walkthrough block.
  - New `flowPicture()` inside `arch`.
  - `shownVal()` for displayed values.
  - Click panel shows "down" for a dead node.
- Modify `kit/style.css`: icon, token, picture and `n/a` styles.
- Modify `scripts/validate.mjs`:
  - Rules for `icon`, `carry` length, `flowPicture` and `expect` in `validate()`.
  - New export `lint(spec): string[]`.
- Modify `scripts/build.mjs`: print `lint()` warnings as `warn   …` lines; they do not block.
- Modify `scripts/check.mjs`:
  - Token and picture checks, the overflow check, preset `expect`, and `n/a`.
  - Lanes widen to fit their label (in the runtime, but asserted here).
- Modify `scripts/make.mjs`: the skip message names the cause.
- Create `tests/helpers.mjs`, `tests/fixture.mjs` and five `tests/*.test.mjs` files (listed per task).
- Modify `references/spec-format.md`, `references/hld.md`, `SKILL.md` and `README.md`.
- Modify `examples/{news-feed,rate-limiter,netflix-recommendations}/spec.mjs`: `carry`, `icon` and `expect`.
- Modify `examples/consistent-hashing/spec.mjs`: the first step's result.

---

### Task 1: Test harness and fixture

**Files:**
- Create: `tests/helpers.mjs`, `tests/fixture.mjs`, `tests/harness.test.mjs`
- Modify: `README.md` (one line under "How it works": `node --test tests/` runs the tests; needs Playwright)

**Interfaces:**
- Produces:
  - `buildSpec(spec: object, name?: string): Promise<string>`. It writes `export default <JSON>` to a temp `.mjs`, calls `build()` from `scripts/build.mjs` and returns the HTML path. On spec problems it throws an Error listing them, instead of exiting.
  - `openPage(htmlPath: string, opts?: { width?: number, reducedMotion?: boolean }): Promise<{ page, close(): Promise<void>, errors(): Promise<string> }>`, using `require('playwright').chromium`. `errors()` returns `document.body.dataset.error || ''`.
  - `runCheck(htmlPath: string, args?: string[]): { code: number, out: string }`. It calls `spawnSync(node, ['scripts/check.mjs', …])` with `CHROME` set to `process.env.CHROME || chromium.executablePath()`.
  - `miniSpec(overrides?: object): object`. A valid `kind:"hld"` spec with:
    - one `estimation` (`users` input, `rps` row);
    - one `arch` with nodes `app` (clients, col 0), `api` (col 1, cap 1000, instances 2), `cache` (kind cache, hit 0.9, col 2) and `db` (store, col 3);
    - edges `app→api`, `api→cache` (call) and `cache→db` (miss);
    - one flow, "Open the page", with steps `["app","api"]` carry "GET /home", `["api","cache"]` carry "lookup", `["api"]` (no carry) and `["api","app"]` carry "page";
    - presets `[{label:"Normal",set:{}},{label:"Kill api",set:{apiInst:0}}]`, controls `apiInst` (value 2).
  - `overrides` is deep-merged into `sections[1]` (the arch).
- Build must not exit the process from a test: add an optional `{ throwOnProblems: true }` third parameter to `build(specPath, outPath, opts)` in `scripts/build.mjs`.

- [ ] **Step 1: Write the failing test** in `tests/harness.test.mjs`
  - `test("mini spec builds and loads without errors")`: `buildSpec(miniSpec())`, `openPage`, assert `await errors() === ""` and that `page.locator('.sim .node')` has count 4.
  - `test("build throws instead of exiting on a bad spec")`: `await assert.rejects(buildSpec({ title: "t" }), /kind must be/)`.
- [ ] **Step 2: Run** `node --test tests/harness.test.mjs`. Expected: FAIL, "Cannot find module './helpers.mjs'".
- [ ] **Step 3: Implement** `tests/helpers.mjs`, `tests/fixture.mjs` and the `throwOnProblems` option in `build()`.
- [ ] **Step 4: Run** `node --test tests/harness.test.mjs`. Expected: 2 passing.
- [ ] **Step 5: Commit** `git add tests scripts/build.mjs README.md && git commit -m "Add node:test harness with a mini fixture spec"`

### Task 2: Icons and box layout

**Files:**
- Modify: `kit/runtime.js` (the `h()` tag regex adds `symbol|use`; icon defs; node drawing; tint; panel), `kit/style.css`
- Test: `tests/icons.test.mjs`

**Interfaces:**
- Produces:
  - `ICONS` (an object of icon name → SVG inner markup for a 24×24 viewBox), inside the runtime IIFE.
  - `iconFor(node): string`, which applies the Global Constraints defaults.
  - Each box `<g class="node">` contains `<use class="ico" href="#ico-<name>">` at about 26 px, and the label in `<text class="nl">`. When the label wraps, it is two `<tspan>` lines at 13 px.
  - `NH` is 68.
  - The symbols live once per page in a `<defs>`, in the first arch SVG, with ids `ico-<name>`.

- [ ] **Step 1: Write the failing tests** in `tests/icons.test.mjs`:
  - `default icons follow kind`: on `miniSpec()`, the `href` of `.node .ico` for app, api, cache and db is `#ico-phone`, `#ico-server`, `#ico-cache` and `#ico-database`.
  - `icon override wins`: with `nodes[1].icon = "worker"`, api's href is `#ico-worker`.
  - `long label wraps, never truncates`: with `nodes[1].label = "Celebrity cache service"`, the api node's `.nl` has 2 tspans whose text joins to the full label, and its `getBBox().width` is at most the box width minus the icon space.
  - `no tint below 75%`: at the `Normal` preset (api 50% busy), the computed `--u` on api's `rect.box` is 0.
  - `dead node panel says down`: after clicking `Kill api` and then the api node, `.detail` contains "down" and not "900%".
- [ ] **Step 2: Run** `node --test tests/icons.test.mjs`. Expected: FAIL (no `.ico`).
- [ ] **Step 3: Implement** in `kit/runtime.js`:
  - The 14 icons in the mockup style (`.superpowers/brainstorm/*/content/pictures-v2.html`: 24×24 viewBox, 1.6 stroke, `var(--ink)` stroke, `var(--panel)` fill, one accent detail).
  - `iconFor`.
  - Label measuring: create the `<text>`, then `getComputedTextLength()`. If it exceeds `NW - 54`, re-render as two 13 px tspans split at the word nearest the middle.
  - Tint: `u < 0.75 ? 0 : …`.
  - Panel: `r.total === 0 ? "down" : …`.
  - The `aria-label` stays the full label, and the icons are `aria-hidden="true"`.
- [ ] **Step 4: Run** `node --test tests/icons.test.mjs tests/harness.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Architecture boxes get icons, wrapped labels, no tint at healthy load"`

### Task 3: Moving tokens on lit arrows

**Files:**
- Modify: `kit/runtime.js` (walkthrough `show()`, `stopWalk()`, `paintSel()`), `kit/style.css`
- Test: `tests/token.test.mjs`

**Interfaces:**
- Consumes: the `hlEdges` and `show()` from the existing walkthrough code in the `arch` builder.
- Produces:
  - `carryOf(step): string`: `step.carry`, or else the first 3 words of `step.text` with `**` removed.
  - For each lit edge, a `<g class="tok">` in a top layer. It holds a `<circle class="tokdot">` and a pill (`<rect class="tokpill">` plus `<text class="toklabel">`) about 14 px above the dot.
  - `data-from` and `data-to` on each `.tok` record the direction, in step path order.
  - Motion follows the edge path from the earlier path box to the later one, at about 2.4 s per hop, looping. Use a reversed path `d` when travel runs against the edge.
  - With reduced motion, there is no animation and the token sits at the arrow's midpoint.

- [ ] **Step 1: Write the failing tests** in `tests/token.test.mjs`:
  - `token per lit edge with carry label`: start the flow and go to step 1. There is one `.tok`, and its `.toklabel` text is "GET /home".
  - `one-box step shows no token`: at step 3, `.tok` count is 0.
  - `token direction follows path order`: at step 4 (`["api","app"]`), `.tok` has `data-from="api"` and `data-to="app"`. Its position 0.3 s and 1.2 s after showing moves from api's x toward app's x (the x decreases).
  - `fallback label from text`: with step 1's `carry` removed and its text "Your app asks for the page", the label is "Your app asks".
  - `tokens survive preset click`: at step 2, clicking preset `Normal` leaves 1 `.tok` with label "lookup".
  - `reduced motion keeps the token still`: open with `reducedMotion: true`. At step 1, the dot's position is the same at 0.2 s and 1.0 s, within 0.5 px.
  - `exit removes tokens`: clicking Exit leaves 0 `.tok`.
- [ ] **Step 2: Run** `node --test tests/token.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** with `requestAnimationFrame`, sharing the existing `frame()` loop. Do not use SMIL, so reduced motion and repaint are controlled in one place. `getPointAtLength` on a hidden reversed path when needed.
- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Walkthrough steps show a labelled token moving along each lit arrow"`

### Task 4: The walkthrough picture

**Files:**
- Modify: `kit/runtime.js` (new `flowPicture(flow)` in the `arch` builder, mounted between `walk` and `metricBar`), `kit/style.css`
- Test: `tests/flow-picture.test.mjs`

**Interfaces:**
- Consumes: `iconFor` and `carryOf` (Tasks 2 and 3). Change the walkthrough's `show()` to `show(i?: number)`, which sets `step = i` when given. Back, Next and the flow chips keep working.
- Produces:
  - `<div class="fpic">` holding an SVG.
  - Lifelines: one `<g class="fl" data-node=id>` per distinct box, in first-appearance order. Each has an icon, a label and a dashed line.
  - Per hop, one `<g class="fh" data-step=i>`, with an arrow and the label `"<i+1> · <carry>"`.
  - Per one-box step, one `<g class="fh note" data-step=i>`, a short note on that lifeline.
  - State classes on each `.fh`: `done`, `cur` or `todo`.
  - Clicking a `.fh` calls `show(i)`.
  - The picture is hidden (`display:none`) when no walkthrough is active, and also when `arch.flowPicture === false`.
  - Lifeline spacing is 130 px, and the picture scrolls sideways inside `.fpic` when it is wider than the card.
  - The SVG has `role="img"` and an `aria-label` made of the step texts in order, joined with " Then ". This is the text alternative the spec requires.

- [ ] **Step 1: Write the failing tests** in `tests/flow-picture.test.mjs`:
  - `picture appears with the walkthrough`: `.fpic` is hidden before the flow starts and visible after.
  - `one arrow per hop`: the mini flow has hops 1 + 1 + 0 + 1 = 3 arrows plus 1 note, so `.fh:not(.note)` count is 3 and `.fh.note` count is 1.
  - `lifelines in first-appearance order`: the `data-node` values in order are `app,api,cache`.
  - `revisited box has one lifeline`: steps `["app","api"]` then `["api","app"]` give 2 `.fl` and 2 arrows.
  - `states follow the current step`: at step 2, `.fh[data-step=0]` is `done`, `[data-step=1]` is `cur` and `[data-step=3]` is `todo`.
  - `clicking a step jumps to it`: clicking `.fh[data-step=3]` makes `.wcount` read "Step 4 of 4" and a `.tok` has `data-to="app"`.
  - `wide picture scrolls current step into view`: with a 7-box flow at width 390, the `.fh.cur` bounding box after step 6 is inside the `.fpic` bounds.
  - `flowPicture:false hides it`: with `{ flowPicture: false }`, `.fpic` stays hidden during the walkthrough.
  - `picture has a text alternative`: the `.fpic svg` `aria-label` contains each step's text in order.
- [ ] **Step 2: Run** `node --test tests/flow-picture.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** following mockup C in `pictures-v2.html`:
  - Done steps are drawn at 0.45 opacity and todo steps at 0.2.
  - The current step is in the accent colour with a soft highlight band.
  - Scrolling reuses the walkthrough's existing scroll-into-view code.
- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Draw the active walkthrough as one picture under the architecture"`

### Task 5: Validation, lint and checks

**Files:**
- Modify: `scripts/validate.mjs`, `scripts/build.mjs`, `scripts/check.mjs`, `scripts/make.mjs`, `kit/runtime.js` (`shownVal`, lane width)
- Test: `tests/check.test.mjs`, plus validator cases in `tests/harness.test.mjs`

**Interfaces:**
- Produces:
  - `validate()` errors:
    - an unknown `icon` (the message lists the 14 valid names);
    - `carry` longer than 16 characters;
    - `flowPicture` that is not a boolean;
    - `preset.expect` that is not an `=` string.
  - `lint(spec): string[]`: a missing `carry` on a step with two or more boxes gives `flow "<label>" step <n> has no carry; using "<fallback>"`.
  - `build()` prints each as `warn   <message>`.
  - `shownVal(expr, m)` in the runtime: like `val()`, but returns NaN for NaN or `undefined`. `fmt` then shows `n/a` inside `<span data-na>`. It is used for rows, custom metrics, the panel and the chart legend.
  - Lane rectangles widen to the label's `getBBox().width + 24` when that is wider than their nodes.
  - `check.mjs` adds:
    - FAIL `preset "<label>" expect <expr> is false`;
    - FAIL `<n> value(s) show n/a`;
    - FAIL `walkthrough "<label>" step <n> has no token`;
    - FAIL `walkthrough "<label>" picture has <a> arrows for <h> hops`;
    - FAIL `label "<text>" overflows its box` (also for lanes, tokens and the picture: `getBBox` against the container, or for tokens and the picture, against the SVG viewBox);
    - `ok   walkthrough "<label>": <n> steps, <h> hops pictured`.
  - `make.mjs`:
    - `skip   checks: CHROME=<path> does not exist` when `CHROME` is set to a missing path;
    - otherwise `skip   checks: no Chrome, Chromium or Edge found (set CHROME=/path/to/chrome)`.

- [ ] **Step 1: Write the failing tests:**
  - In `tests/harness.test.mjs`:
    - `validate rejects unknown icon`: `icon: "rocket"` gives an error matching `/icon "rocket".*phone, browser/`.
    - `validate rejects long carry`: a 17-character carry gives an error matching `/at most 16/`.
    - `lint warns on missing carry`: `lint(miniSpec())` has length 0. With step 1's `carry` deleted, it has length 1 and matches `/step 1 has no carry; using "/`.
  - In `tests/check.test.mjs`, using `runCheck`:
    - `false expect fails`: with preset `Kill api` and `expect: "=m.err < 0.01"`, the code is 1 and the output matches `/expect .* is false/`.
    - `true expect passes`: with `expect: "=m.err > 0.5"`, the code is 0.
    - `n/a fails`: a row `expr: "=0/0"` gives code 1 and `/show n\/a/`.
    - `missing picture arrow fails`: inject a test hook by setting `window.__sysdesign.breakPicture = true` before load. The runtime skips drawing one arrow when it is set. The output matches `/picture has 2 arrows for 3 hops/`.
    - `symbol carry does not falsely overflow`: `carry: "▶ 2 new shows"` gives code 0 and no `overflows` in the output.
    - `long lane label widens the lane`: a lane with a 40-character `note` gives code 0.
- [ ] **Step 2: Run** `node --test tests/`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** everything in this task's Interfaces list.
- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Validate icons and carry, lint missing carry, check expects, n/a, pictures and overflow"`

### Task 6: Examples and docs

**Files:**
- Modify: `examples/{news-feed,rate-limiter,netflix-recommendations}/spec.mjs`, `examples/consistent-hashing/spec.mjs`, `references/spec-format.md`, `references/hld.md`, `SKILL.md`, `README.md`
- Test: `tests/examples.test.mjs`

**Interfaces:**
- Consumes: every field from Tasks 2 to 5.

- [ ] **Step 1: Write the failing test** `tests/examples.test.mjs`. For each of the 5 examples:
  - `make.mjs <spec> --no-open` exits 0 with no `FAIL`, no `WARN` and no `warn` lines at width 1280.
  - The same holds at `--width 390`.
- [ ] **Step 2: Run** `node --test tests/examples.test.mjs`. Expected: FAIL (lint warns about missing carry).
- [ ] **Step 3: Update the examples:**
  - `carry` on every step with two or more boxes, at most 16 characters, saying what moves. For example "▶ finished ep." or "new rows".
  - Icon overrides where the default reads wrong: Netflix `member` → `phone`, `jobs` → `batch`, `nearline` → `worker`, `logs` → `storage`. News feed `workers` → `worker`. Rate limiter `bots` → `user`, `redis` → `lock`.
  - An `expect` on every preset that is not the baseline, encoding its note. For example, Netflix "Turn off nearline" gets `"=!p.nearlineOn && m.err < 0.001"`.
  - Consistent hashing: the first step gets `result: "3 servers, 300 points"`.
- [ ] **Step 4: Update the docs:**
  - `spec-format.md`: `icon` (the list and defaults), `carry`, `flowPicture`, `expect`. Also add the round-2 notes:
    - mark background sources `internal: true`;
    - requests a node cannot serve are dropped there;
    - one phrase per `m.nodes` field;
    - `mult` is load only.
  - `hld.md`: every walkthrough step that moves something gets a `carry`, and every preset gets an `expect`.
  - `SKILL.md`, the "Who is reading" bullet on walkthroughs: "each step says what moves (`carry`); the page draws it".
  - `README.md`: one line on icons and the walkthrough picture.
- [ ] **Step 5: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 6: Look.** `make.mjs examples/netflix-recommendations/spec.mjs --no-open --shots <scratch>` at 1280 and 390. Read the architecture section image mid-walkthrough in both themes, using a Playwright screenshot like `walk.cjs` that also captures `.fpic`. Fix anything that overlaps.
- [ ] **Step 7: Commit** `git commit -am "Examples and docs: carry, icons and expects; round-2 doc notes"`, then push the branch.
