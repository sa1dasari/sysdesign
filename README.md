# sysdesign

A Claude Code skill that explains a system design topic as a live page you can poke.

Ask about any topic and get one self-contained HTML file. Claude works out which views the topic needs and puts them on one page:

- **System view (HLD)**, when the topic runs on many machines: an architecture diagram in labelled lanes, walkthroughs that light up how a request or an event moves step by step, and changes you can try ("turn off nearline", "a celebrity posts") while the page shows what users would notice. Click a box to see why it exists. Capacity math that recomputes as you drag is there for going deeper.
- **Object view (LLD)**, when there is code worth designing: a class diagram, a sequence diagram you can step through, a state machine that enforces its own transition table, and a scenario produced by running the real code shown beside it.
- **Mechanism view (concept)**, when an algorithm or protocol is the point: live charts that put the naive approach next to the real one, measured by running a reference implementation.

Most topics need more than one. A rate limiter is a service under load and an algorithm, so its page has the simulator, a chart measured from the algorithm, and the class design. Topics are not limited to a list: the tables in `references/` are worked examples, and anything else is worked out from the obvious design and the moment it fails (see "Any topic" in `SKILL.md`).

Every number on a page comes from one small model the page runs, so prose, tables and simulation cannot drift apart.

## Examples

Open these in a browser:

- `examples/news-feed/index.html` (HLD)
- `examples/parking-lot/index.html` (LLD)
- `examples/consistent-hashing/index.html` (concept)
- `examples/rate-limiter/index.html` (HLD + LLD on one page)
- `examples/netflix-recommendations/index.html` (HLD for a learner: lanes, walkthroughs, changes to try)

Rebuild, check and open one with `node scripts/make.mjs examples/news-feed/spec.mjs`.

## Install

As a Claude Code plugin (recommended, gets updates):

```text
/plugin install sysdesign --marketplace sa1dasari/sysdesign
```

On older Claude Code versions, add the marketplace first, then install:

```text
/plugin marketplace add sa1dasari/sysdesign
/plugin install sysdesign@sysdesign-marketplace
```

Or as a personal skill, by cloning:

```sh
git clone https://github.com/sa1dasari/sysdesign ~/.claude/skills/sysdesign
```

Then in Claude Code:

```text
/sysdesign how does a social media news feed work
/sysdesign design a rate limiter
/sysdesign --lld parking lot
/sysdesign --concept bloom filter
```

No flag is needed: Claude picks the views. A flag only says which view should lead.

Needs Node 20.10+. Chrome or Chromium is used by `scripts/check.mjs` (found on PATH, or set `CHROME=/path/to/chrome`). No packages to install.

## How it works

`SKILL.md` tells Claude how to find the one force that shapes a design, explain it to a learner, and fill a spec (`references/spec-format.md` lists every field). `scripts/make.mjs` does the rest in one command: `build.mjs` validates the spec and inlines `kit/runtime.js` and `kit/style.css` into a single page, `check.mjs` opens it in headless Chrome, clicks every preset and walkthrough step and prints the resulting numbers, and then the page opens in your default browser. On a machine with no display it prints the file path instead.

The simulator is a steady-state fluid model with M/M/1-shaped latency. It shows which tier saturates first and what users feel. It is not a production performance predictor.

`node --test tests/` runs the tests; they need Playwright.

MIT licensed.
