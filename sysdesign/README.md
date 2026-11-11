# sysdesign

A Claude Code skill that explains a system design topic as a live page you can poke.

Ask for a topic and get one self-contained HTML file:

- **HLD** topics (news feed, cache, ride matching) get capacity math that recomputes as you drag assumptions, and a request-flow simulator. Click a box to see why it exists, then break the system: cold cache, a celebrity post, a lost worker, a traffic spike.
- **LLD** topics (parking lot, LRU cache, elevator) get a class diagram, a sequence diagram you can step through, a state machine that enforces its own transition table, and a scenario produced by running the real code shown beside it.

Every number on a page comes from one small model the page runs, so prose, tables and simulation cannot drift apart.

## Examples

Open these in a browser:

- `examples/news-feed/index.html` (HLD)
- `examples/parking-lot/index.html` (LLD)

Rebuild them with `node scripts/build.mjs examples/news-feed/spec.mjs`.

## Install

```sh
git clone <this repo> ~/.claude/skills/sysdesign
```

Then in Claude Code:

```text
/sysdesign how does a social media news feed work
/sysdesign --lld parking lot
```

Needs Node 20.10+. Chrome or Chromium is used by `scripts/check.mjs`. No packages to install.

## How it works

`SKILL.md` tells Claude how to find the one force that shapes a design, write a model, and fill a spec. `scripts/build.mjs` validates the spec and inlines `kit/runtime.js` and `kit/style.css` into a single page. `scripts/check.mjs` opens the page in headless Chrome, clicks every simulator preset and prints the resulting numbers, and takes screenshots for review.

The simulator is a steady-state fluid model with M/M/1-shaped latency. It shows which tier saturates first and what users feel. It is not a production performance predictor.

MIT licensed.
