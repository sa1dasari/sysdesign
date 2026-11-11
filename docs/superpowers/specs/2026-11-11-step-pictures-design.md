# Step pictures: icons, a moving token, and a picture of the whole walkthrough

Date: 2026-11-11
Status: waiting for approval (builder check done)

## Intent and why

The owner's words: a user "understands better if it's portrayed as an image visually than with words."

Today a walkthrough step lights up plain labelled boxes and shows one sentence. The learner has to read to know what happened. Nothing shows what travels (a request, an event, a list of titles), and nothing shows the whole story at once.

After this change, a learner should be able to follow a walkthrough mostly by looking. The words become a caption, not the main channel.

## What the owner chose

Mockups of three options were shown for one real moment (Netflix, "You finish an episode", step 3 of 4). The owner picked **B and C together**:

- **B. Pictures on the architecture.** Every box gets an icon for what it is (phone, queue, worker, cache, database). During a walkthrough, a labelled token (for example "▶ 2 new shows") slides along each lit arrow, and the rest of the system dims, as it does today.
- **C. The whole story in one picture.** Under the architecture, the current walkthrough is drawn as a picture of every step in order. Lifelines are headed by the same icons, with one arrow per hop, labelled with what moves. Done steps fade, the current step is lit, and the next ones wait.

The mockups are kept at `.superpowers/brainstorm/*/content/pictures-v2.html` (local, git-ignored).

## Approaches considered

| | What it is | Trade-off | Outcome |
|---|---|---|---|
| A | An illustrated scene per step (phone, then worker, then your row, with the data drawn) | The most picture-book-like. But every scene is drawn by hand per topic, so pages take longer to build and there is more to get wrong. | Not chosen |
| B | Icons on boxes, plus a labelled token on the lit arrow | One place to look. Icons come from each box's type, so authoring cost is near zero. | **Chosen** |
| C | The walkthrough drawn as one sequence picture | Generated from walkthrough data already in the spec. It looks more like a textbook figure. | **Chosen** |

B and C together keep page generation fast, because both come from data the spec already has, plus one short label per step. That matters because the original complaint about this skill was a 12-minute build.

## Goals

1. Every box in the architecture shows an icon that says what it is at a glance.
2. During a walkthrough, each lit arrow carries a moving token labelled with what travels.
3. Under the architecture, the active walkthrough appears as one picture of all its steps, in step with Back and Next. Clicking a step in the picture jumps to it.
4. A spec author adds at most one short label per step. Icons are automatic, with an override.
5. It works on a phone (390 px wide), in dark mode, and with reduced motion. With reduced motion, the token sits still at the middle of the arrow.
6. The check script proves the pictures are there: every multi-box step has a token, and each picture has one arrow per hop.

## Non-goals

- Per-step illustrated scenes (option A).
- Photos, raster images or external image hosting. Everything stays inline SVG in the one HTML file.
- Drawing the data itself, such as a list of titles as tiles. The token's label says what moves; drawing it is option A.
- Icons for class diagrams, state machines or the existing `sequence` section.

## Anti-goals (it fails even if it technically works)

- Pages take noticeably longer to generate, or spec authors have to draw anything.
- Labels overflow boxes, tokens or arrows, or the architecture becomes cluttered on a phone.
- The picture and the architecture disagree about which step is current.

## Constraints

- **Existing kit.** `kit/runtime.js` (vanilla JS, no dependencies) and `kit/style.css`. One self-contained page. Light and dark themes through CSS variables.
- **Existing walkthrough model.** A flow is `{ label, steps: [{ path: [nodeIds], text }] }`. Consecutive ids in `path` are joined by an edge in either direction, which the validator already checks. The runtime already lights `path` nodes and the edges between them.
- **Existing node types.** `kind` is `clients`, `cache`, `store`, `queue` or any free word, which is shown under the label.
- **Tooling.** `scripts/validate.mjs`, `scripts/check.mjs` (headless Chrome over the DevTools protocol) and `scripts/make.mjs` must keep working, and stay in the 1 to 2 second range.
- **Accessibility.** Icons are decorative (`aria-hidden`). The sequence picture has a text alternative: the step texts, in order.

## The how, as decided

### Spec additions (documented in `references/spec-format.md`)

- **`node.icon`** (optional). One of a fixed set: `phone`, `browser`, `user`, `server`, `worker`, `queue`, `cache`, `database`, `storage`, `batch`, `lock`, `globe`, `search`, `mail`. The default comes from `kind`:

  | `kind` | Default icon |
  |---|---|
  | `clients` | `phone` |
  | `cache` | `cache` |
  | `store` | `database` |
  | `queue` | `queue` |
  | contains "batch" | `batch` |
  | anything else | `server` |

  The validator rejects unknown icon names and lists the valid ones.
- **`step.carry`** (string, at most 16 characters: the validator rejects longer ones). What moves along this step's arrows, for example "▶ finished ep. 1" or "40 titles". It is the token's label and the label on the step's arrows in the sequence picture.
  - A step whose `path` has two or more boxes should have `carry`. *Builder's call:* a missing `carry` is a WARN, not an error, so specs written before this change still build. The token then falls back to the first two or three words of the step's `text`.
  - A one-box step ("it re-ranks the list") has no arrow. It shows in the picture as a short note on that box's lifeline, using `carry` if given, otherwise the first words of `text`.
- **`arch.flowPicture: false`** turns off the sequence picture for a page. The default is on whenever `flows` exist.

### Behaviour

- **Icons.** Drawn inside each box, left of the label, about 26 px. The label and the subtitle shift right to make room. *Builder's call (from the builder check):* box height grows from 60 to 68 px. A label that does not fit in one line wraps onto a second line at 13 px. Labels are never truncated. The check FAILs only if a wrapped label still does not fit. This keeps labels such as "Logs in Hadoop" and "Timeline cache" working without making authors shorten them.
- **Token.** *Builder's call:* the moving part is a small accent dot on the arrow, with its label in a pill just above it. Because the label floats above the line, it may pass over a box edge at the ends of a short arrow, and it is drawn on top with a halo so it stays readable. While a step is shown, one token per lit edge travels from the step's earlier box to its later box along that edge's path, looping. Direction follows the step's `path` order, not the edge's `from`/`to`. A reply such as `["online", "api", "member"]` travels backwards along those edges. The token is a pill: the accent colour with white text.
- **Sequence picture.** It sits directly under the architecture, inside the same card, and appears when a walkthrough starts. When the walkthrough exits, it shows the last walkthrough faded with "Pick a walkthrough", or hides. That is left to the builder.
  - Lifelines are the distinct boxes in the flow, in order of first appearance, each headed by its icon and label.
  - Each hop (a consecutive pair in a step's `path`) is one horizontal arrow, labelled with the step's `carry` and its step number.
  - States: steps before the current one are faded, the current step is lit in the accent colour, and later steps are dim.
  - Clicking an arrow or step number goes to that step.
- **Phone width.** The sequence picture scales to the card width. If it has more than about 5 lifelines, it scrolls sideways inside its card, as the architecture already does, and the current step is scrolled into view.

### Check script

- **Walkthroughs:** for every step with two or more boxes, at least one token is rendered. Its label must be non-empty and must not overflow.
- **Pictures:** each walkthrough's picture has as many arrows as there are hops in the flow.
- **Overflow:** report a FAIL when a box label (after wrapping) is wider than its box, or a lane label is wider than its lane, or any token or picture label falls outside the drawing. This is measured with `getBBox()`. *Builder's call:* `make.mjs` keeps checking at 1280 px only by default, for speed. The examples are also checked at 390 px when they are rebuilt.

### Examples

All five examples are updated. The three with architecture (news feed, rate limiter, Netflix) get `carry` on every step, and icons where the default is wrong: for example `user`/`globe`/`browser` for client types, and `worker` for job nodes. All five are rebuilt and pass checks at 1280 and 390 px with 0 FAIL and 0 WARN.

### Also in this change: fixes from the round-2 review

These were promised to go with the next change. They are independent of the pictures:

1. **`preset.expect`** (optional expression, for example `"=m.nodes.geo.util > 1"`). The check FAILs a preset whose `expect` is false. This makes "the note matches the numbers" machine-checked. The examples' presets get `expect`.
2. **NaN is shown, not hidden.** *Builder's call on scope:* the change covers displayed values only: estimation rows, metrics, the click panel and chart legend readouts. An expression whose result is NaN or `undefined` there shows "n/a", and the check FAILs. The simulator's own inputs keep the 0 fallback, so one bad value cannot turn every number into "n/a". The validator already catches mistyped `p.`/`r.` names. Chart samples keep dropping non-finite points, as today.
3. **Docs** (`spec-format.md`):
   - Mark background sources (device pings, telemetry) `internal: true`.
   - Requests a node cannot serve are dropped there, so later nodes see only what it accepted.
   - A short meaning for each `m.nodes` field.
   - `mult` is load only.
4. **No warning colour at healthy load.** Boxes are not tinted below 75% busy.
5. **The click panel** shows "down" for a dead node instead of the internal 900%.
6. **`make.mjs`:** the skip message distinguishes "CHROME path does not exist" from "no Chrome found".
7. **Lane labels:** a lane widens to fit its label (or the check FAILs on overflow).
8. **Consistent-hashing scenario:** the first step's result no longer renders as "undefined".

## Left to the builder

- Icon drawing details, within the mockups' style: 24×24, 1.6 px stroke, ink and panel colours, one accent detail.
- Token timing, with about 2.4 s per hop in the mockup. Also whether several hops in one step animate together or one after another.
- The exact layout and spacing of the sequence picture, and what it shows when no walkthrough is active.
- How the token label is truncated if it is too long. The validator may also cap `carry` length.

## Open questions for the owner

None. The builder check raised four questions: long box labels, the length of `carry`, how far the NaN change reaches, and whether old specs still build. All four were settled as builder's calls, marked *Builder's call* above, because none of them changes what the owner asked for.
