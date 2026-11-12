# Checking the page

`node "${CLAUDE_SKILL_DIR}/scripts/make.mjs" <spec>` builds the page and checks it. Read only this file when the output shows a problem you cannot place.

## What the output means

- **`FAIL` lines must be fixed.** They name the spec problem, the bad expression, the preset that breaks something, a failure rate outside 0 to 100%, a walkthrough step that lights nothing, or a chart line with nothing to draw.
- **`WARN` lines should be fixed.** An unhealthy baseline (failures, a part over 80% busy, latency over budget) means the defaults need resizing; use the recipe in `spec-format.md`. A preset with the same numbers as another usually means it sets the wrong slider, or that its effect is not visible. Add a metric that shows it.
- **The preset table is the most important part.** For each preset, compare its numbers with its `note`. If the note promises "pages slow down" and latency does not climb, fix the model or the note. Quote the numbers you see, not the ones you expected.
- **`skip checks`** means no Chrome or Chromium was found. Do not install one. Check the preset notes against the model by reasoning, and tell the user the browser checks were skipped.

## Content check, before delivering

- Read each walkthrough's steps in order. They should tell the story of one request or event, defining every term the first time.
- Pick three numbers in the prose and trace each to the model. They must match.
- Each tradeoff's `why` should point at something a preset shows.

## Screenshots, only for a layout problem

`--shots <dir>` writes a full-page image in both themes and one image per section. Add `--width 390` to see a phone layout. Look only at the section with the problem. Check that labels fit their boxes, arrows do not run through boxes, and chart end labels do not overlap.
