# Spec format

A spec is an ES module whose default export describes the page. `make.mjs` validates it, so a missing or wrong field is reported by name. Expressions are strings starting with `=`; they read `p` (sliders), `r` (estimation rows), `m` (the simulation result) and, in a chart, `x`. Helpers: `min max ceil floor round log log2 log10 pow sqrt abs clamp zipf`. Text fields accept `**bold**`, `` `code` `` and `[text](https://link)`.

```js
export default {
  kind: "hld",                    // or "lld", "concept", or a list: ["hld", "lld"]
  title: "Netflix recommendations",
  subtitle: "One sentence on what the page explains.",
  idea: "The one idea that shapes the design, in plain words.",
  sections: [ /* see below, in the order they appear */ ],
};
```

Every section takes `title`, an optional `lede` (one line under the title), and optional `body` (paragraphs).

## Prose

```js
{ type: "text", title: "The big picture", body: ["Paragraph.", "Paragraph."] }
{ type: "requirements", functional: ["..."], nonfunctional: ["..."], outOfScope: ["..."] }
{ type: "patterns", items: [{ name: "Offline", where: "Runs in batches.", why: "Why it exists." }] }
{ type: "qa", items: [{ q: "Question?", a: ["Answer."] }] }
{ type: "api", endpoints: [{ method: "GET", path: "/v1/feed", desc: "Why it looks like this.", req: "...", res: "..." }] }
{ type: "data", tables: [{ name: "posts", store: "where", columns: [{ key: "PK", name: "id", type: "bigint", note: "" }], why: "..." }] }
{ type: "tradeoffs", items: [{ question: "...?", options: [{ name: "A", pick: true, pros: ["..."], cons: ["..."] }], why: "..." }] }
{ type: "failures", items: [{ what: "...", effect: "...", mitigation: "...", inject: { param: value } }] }  // inject: optional preset
```

## Estimation

```js
{ type: "estimation",
  inputs: [{ id: "members", label: "Members active at peak", value: 2e7, min: 1e6, max: 1e8, log: true, fmt: "si", unit: "" }],
  rows:   [{ id: "homeRps", label: "Home page requests", expr: "=p.members*2/3600", fmt: "si", unit: "req/s", why: "What it is for." }] }
```

`fmt`: `si` (12.3K), `int`, `pct` (0.25 shows 25%), `bytes`, `ms`, `onoff`. Every slider must be read by some expression.

## Architecture

```js
{ type: "arch",
  latencyBudget: 200,                         // ms; latency above it shows as a warning
  intro: "Shown under the diagram before anything is clicked.",
  groups: [{ id: "online", label: "Online", note: "while you wait" }],   // labelled lanes, optional
  nodes: [
    { id: "app", label: "You (the app)", kind: "clients", rps: "=r.homeRps", group: "online", col: 0, row: 0,
      role: "What it is.", why: "Why it exists." },
    { id: "api", label: "API", group: "online", col: 1, row: 0, instances: 20, cap: 1000, ms: 5,
      role: "...", why: "...", scale: "How it grows.", fails: "How it breaks." },
    { id: "cache", label: "Cache", kind: "cache", hit: 0.97, instances: 12, cap: 10000, ms: 1, role: "...", why: "..." },
  ],
  edges: [
    { from: "app", to: "api" },                          // one of several alternatives (split equally, or by share)
    { from: "api", to: "cache", call: true },            // every request makes this call; latency adds
    { from: "cache", to: "db", miss: true, label: "miss" },  // carries (1 - hit)
    { from: "app", to: "events", async: true, share: "=...", mult: "=..." },  // load only, not on the user's path
  ],
  flows: [{ label: "You open the home page", steps: [
    { path: ["app", "api"], text: "One or two plain sentences about this step." },
  ] }],
  presets: [{ label: "Normal evening", set: {}, note: "What to watch." }, { label: "Turn off X", set: { xOn: 0 }, note: "..." }],
  controls: [{ id: "xOn", label: "X", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" }],
  metrics: [{ label: "New activity shows up", expr: "=p.xOn ? 'in ~1 min' : 'next day'", warn: "=!p.xOn", bad: "=..." }] }
```

- **Nodes.** `kind`: `clients`, `cache`, `store`, `queue` (an overloaded queue grows a backlog instead of failing), or any word shown under the label. A node with `rps` is a source; `internal: true` keeps a source out of the user-facing failure rate. `instances`, `cap` (requests per second per instance) and `ms` may be expressions. A node with no `cap` never saturates.
- **Layout.** Columns follow the arrows unless `col` is set; rows stack unless `row` is set. With lanes, set `col` and `row` on every node so each lane is a clean band. Arrows must not form a loop: draw a reply as part of a `call` edge, not as an edge back.
- **Flows.** Each step's `path` lists the boxes involved, in order. Consecutive boxes must be joined by an edge, in either direction.
- **Presets** apply on top of the defaults, so `set: {}` is the normal state. Name them for what a user would notice.
- **Metrics** may return text. `warn` and `bad` colour them.
- `m.nodes.<id>` has `inflow`, `util`, `accFrac`, `shed`, `latency`, `hit`. `m.rps`, `m.err` and `m.lat` are the totals.

## Chart

```js
{ type: "chart",
  x: { label: "Servers", from: 2, to: 100, steps: 60, log: true, param: "servers", fmt: "int" },   // or values: [...]
  y: { label: "Share of keys that move", fmt: "pct", min: 0, max: 1 },
  series: [{ label: "mod N", expr: "=x/(x+1)" }, { label: "Measured", y: [/* one per x value */] }],
  note: "What to look at, quoting the chart's numbers." }
```

At most 4 series, one unit per chart. With `x.param`, each point is computed with that slider set to x and a marker shows its current value.

## Object and protocol views

```js
{ type: "classes", classes: [{ name: "Lot", at: [col, row], stereotype: "interface", fields: ["..."], methods: ["..."], role: "..." }],
  relations: [{ from: "Lot", to: "Spot", type: "has" | "uses" | "implements" | "inherits", label: "1..*" }] }
{ type: "sequence", actors: ["Client", "Server"], messages: [{ from: "Client", to: "Server", text: "GET", note: "Why.", ret: false }] }
{ type: "states", initial: "free", states: [{ id: "free", label: "Free", at: [col, row], note: "" }],
  transitions: [{ from: "free", to: "taken", event: "park", note: "", bend: 0 }] }
{ type: "scenario", steps: [{ title: "...", call: "lot.park(car)", result: "...", note: "...", state: { key: "value" } }] }
{ type: "code", files: [{ name: "lot.mjs", src: readFileSync(new URL("lot.mjs", import.meta.url), "utf8") }] }
```

Scenario steps are produced by importing the reference implementation in the spec and running it, so the page shows what the code really did.
