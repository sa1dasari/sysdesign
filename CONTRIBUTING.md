# Contributing

## Setup

No packages are needed to use the skill. Tests need Playwright and a Chromium:

```sh
npm install playwright && npx playwright install chromium
node --test
```

If Playwright is installed somewhere else, point `NODE_PATH` at its `node_modules`.

## Where things live

- `SKILL.md`: instructions Claude follows. Wording changes here change every generated page, so test a few topics after editing.
- `references/`: the spec format and worked tables per view.
- `kit/`: the runtime and styles inlined into each page.
- `scripts/`: `validate` (spec rules), `build`, `check` (headless Chrome), `make` (all three).
- `examples/`: one spec per example. After changing the kit, rebuild with `node scripts/make.mjs examples/<name>/spec.mjs` and commit the regenerated `index.html`.

## Good contributions

- A new example for a common topic (URL shortener, chat, payments, Raft). Keep it small: 6 to 8 sections, healthy on first build.
- A bug in a generated page. Attach the `spec.mjs`; it reproduces the page exactly.
- A factual correction to an example.

Open an issue first for anything that changes the spec format.
