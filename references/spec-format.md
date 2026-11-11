# Spec format

A spec is an ES module whose default export describes the page. `make.mjs` validates it, and each problem is reported with its field. This file has every field and every modelling rule you need. You should not need to read the examples or the kit.

Expressions are strings starting with `=`. They can read:

- `p.<id>`: any slider. Inputs and controls share one namespace, so ids must be unique.
- `r.<id>`: any estimation row, wherever it sits on the page.
- `m`: the simulation result.
- `x`: the horizontal value, inside a chart.

Helpers: `min max ceil floor round log log2 log10 pow sqrt abs clamp zipf`. A typo such as `p.dua` is reported, not silently read as 0.

Text fields accept `**bold**`, `` `code` `` and `[text](https://link)`.

```js
export default {
  kind: "hld",                    // or "lld", "concept", or a list: ["hld", "lld"]
  title: "Netflix recommendations",
  subtitle: "One sentence on what the page explains.",
  idea: "The one idea that shapes the design, in plain words.",
  sections: [ /* see below, in the order they appear */ ],
};
```

Every section takes `title` and an optional `lede` (one line under the title). These sections also show `body` paragraphs: `text`, `estimation`, `data`, `arch`, `chart`, `classes`, `sequence`, `states`, `scenario` and `code`.

## Prose

```js
{ type: "text", title: "The big picture", body: ["Paragraph.", "Paragraph."] }
{ type: "requirements", functional: ["..."], nonfunctional: ["..."], outOfScope: ["..."] }
{ type: "patterns", items: [{ name: "Offline", where: "Runs in batches.", why: "Why it exists." }] }
{ type: "qa", items: [{ q: "Question?", a: ["Answer."] }] }
{ type: "api", endpoints: [{ method: "GET", path: "/v1/feed", desc: "Why it looks like this.", req: "...", res: "..." }] }
{ type: "data", tables: [{ name: "posts", store: "where", columns: [{ key: "PK", name: "id", type: "bigint", note: "" }], why: "..." }] }
{ type: "tradeoffs", items: [{ question: "...?", options: [{ name: "A", pick: true, pros: ["..."], cons: ["..."] }], why: "..." }] }
{ type: "failures", items: [{ what: "...", effect: "...", mitigation: "...", inject: { sliderId: value } }] }  // inject: optional
```

## Estimation

```js
{ type: "estimation",
  inputs: [{ id: "members", label: "Members active at peak", value: 2e7, min: 1e6, max: 1e8, log: true, fmt: "si", unit: "" }],
  rows:   [{ id: "homeRps", label: "Home page requests", expr: "=p.members*2/3600", fmt: "si", unit: "req/s", why: "What it is for." }] }
```

- **Formats (`fmt`):** `si` (12.3K), `int`, `pct` (0.25 shows 25%), `bytes`, `ms`, `onoff`.
- **`step`:** a slider without `step` moves in whole numbers if its value, min and max are whole, and smoothly otherwise.
- **Every slider must be read by some expression.**
- **Rows can be in any order.** They are computed in dependency order. A loop between rows is reported.

## Architecture

There is one `arch` section per page.

```js
{ type: "arch",
  latencyBudget: 200,                         // ms; latency above it shows as a warning
  loadUnit: "req/s",                          // unit for "Offered load", e.g. "msg/s"
  intro: "Shown under the diagram before anything is clicked.",
  groups: [{ id: "online", label: "Online", note: "while you wait" }],   // labelled lanes, optional
  nodes: [
    { id: "app", label: "You (the app)", kind: "clients", rps: "=r.homeRps", group: "online", col: 0, row: 0,
      role: "What it is.", why: "Why it exists." },
    { id: "api", label: "API", group: "online", col: 1, row: 0, instances: 20, cap: 1000, ms: 5,
      role: "...", why: "...", scale: "How it grows.", fails: "How it breaks." },
    { id: "cache", label: "Cache", kind: "cache", hit: 0.97, col: 2, row: 0, instances: 12, cap: 10000, ms: 1, role: "...", why: "..." },
  ],
  edges: [ /* see the table below */ ],
  flows: [{ label: "You open the home page", steps: [
    { path: ["app", "api"], text: "One or two plain sentences about this step." },
  ] }],
  presets: [{ label: "Normal evening", set: {}, note: "What to watch." }, { label: "Turn off X", set: { xOn: 0 }, note: "..." }],
  controls: [{ id: "xOn", label: "X", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" }],
  metrics: [{ label: "New activity shows up", expr: "=p.xOn ? 'in ~1 min' : 'next day'", warn: "=!p.xOn", bad: "=...", fmt: "pct", unit: "" }] }
```

### Edges

| Edge | Meaning |
|---|---|
| `{ from, to }` | One of several alternative routes. Traffic splits equally, or by `share: "=expr"` (a fraction). |
| `call: true` | Every request makes this call (with probability `share`). Latencies add, and both must succeed. |
| `miss: true` | Leaves a cache and carries the `(1 - hit)` part. **Every route out of a cache must be `miss` (or `call`/`async`)**: a cache answers hits itself. To split "found" and "not found" some other way, put `share` on the node before it. |
| `async: true` | Loads the target but is not on the user's path: no latency, no errors for the user. Use it for queues, events and background jobs. |
| `mult: "=expr"` | Multiplies the flow: one post becomes N inserts. |

Arrows must not form a loop. Draw a reply as part of a `call` edge, not as an edge going back.

### Nodes

- **`kind`:** `clients`, `cache`, `store`, `queue`, or any word, which is shown under the label.
- **Queues:** an overloaded `queue` makes requests wait. Its backlog grows (`m.nodes.<id>.growth`) and they are not counted as failures.
- **Sources:** a node with `rps` is a source. `internal: true` keeps a source out of the user-facing failure rate (for example abusive clients, whose rejections are the point).
- **Capacity:** `instances`, `cap` (requests per second per instance) and `ms` (service time when idle) may be expressions. A node with no `cap` never saturates. `instances: 0` means the node is down.
- **Text:** `role`, `why`, `scale` and `fails` fill the panel shown when the node is clicked.

### Layout

- **Columns** follow the arrows unless `col` is set. **Rows** stack unless `row` is set.
- **With lanes**, set `col` and `row` on every node, so each lane is a clean band.
- Keep 4 or 5 columns at most, so text stays readable.

### Flows

Each step's `path` lists the boxes involved, in order. Consecutive boxes must be joined by an edge, in either direction.

### Presets

Presets apply on top of the defaults, so `set: {}` is the normal state and must come first. Name them for what a user would notice. Keys must be slider ids.

### Metrics

Metrics may return text. `warn` and `bad` colour them.

### The simulation result

| Read | Gives |
|---|---|
| `m.nodes.<id>` | `inflow`, `util` (load ÷ capacity), `accFrac`, `shed`, `latency`, `hit`, `growth` |
| `m.rps`, `m.err`, `m.lat` | The user-facing totals |
| `m.bottleneck` | The busiest node's id |

### Sizing the healthy baseline (do this before the first build)

Size capacity in plain JavaScript at the top of the spec, from the peak load each node sees:

```js
const PEAK = 11000;                      // req/s reaching the API at the default inputs
const fit = (load, cap) => Math.ceil(load / cap / 0.65);   // about 65% busy
// ...then on the node:  instances: fit(PEAK, 1000), cap: 1000
```

At the defaults, nothing should be over about 75% busy, nothing should fail, and latency should be under budget. Each preset should push one part past 100%, or change a metric its note names. The checks print `WARN` when the baseline is unhealthy or a preset changes nothing.

## Chart

```js
{ type: "chart",
  x: { label: "Servers", values: [2, 5, 10, 20, 50, 100], log: true, param: "servers", fmt: "int", unit: "" },
  y: { label: "Share of keys that move", fmt: "pct", min: 0, max: 1, log: false, unit: "" },
  series: [{ label: "mod N", expr: "=x/(x+1)" }, { label: "Measured", y: [0.66, 0.83, 0.91, 0.95, 0.98, 0.99] }],
  note: "What to look at, quoting the chart's numbers." }
```

- **`x` axis:** use `values` when any series has recorded `y` data, one y per value. A chart with only `expr` series may use `from`, `to` and `steps` instead.
- **Size:** at most 4 series, one unit per chart. A log axis needs values above 0.
- **`x.param`:** each point is computed with that slider set to x (rerunning the simulation if a series depends on `m`). A marker shows the slider's current value.
- **`inputs`:** a chart may carry its own sliders, shown above it.

## Object and protocol views

```js
{ type: "classes", hint: "Shown before a class is clicked.",
  classes: [{ name: "Lot", at: [col, row], stereotype: "interface", fields: ["..."], methods: ["..."], role: "..." }],
  relations: [{ from: "Lot", to: "Spot", type: "has" | "uses" | "implements" | "inherits", label: "1..*" }] }
{ type: "sequence", hint: "...", actors: ["Client", "Server"],
  messages: [{ from: "Client", to: "Server", text: "GET", note: "Why.", ret: false }] }
{ type: "states", initial: "free", states: [{ id: "free", label: "Free", at: [col, row], note: "", terminal: false }],
  transitions: [{ from: "free", to: "taken", event: "park", guard: "fits", note: "", bend: 0 }] }   // negative bend arcs upward
{ type: "scenario", steps: [{ title: "...", call: "lot.park(car)", result: "...", note: "...", state: { key: "value" } }] }
{ type: "code", files: [{ name: "lot.mjs", src: source }] }
```

### Recording a scenario from real code

Put the reference implementation next to the spec (under about 120 lines), then run it in the spec:

```js
import { readFileSync } from "node:fs";
import { makeLot, Vehicle } from "./lot.mjs";
const source = readFileSync(new URL("lot.mjs", import.meta.url), "utf8");   // for the code section

const lot = makeLot(), steps = [];
function run(title, call, fn, note) {
  let result;
  try { result = fn(); } catch (e) { result = `${e.constructor.name}: ${e.message}`; }   // failures are steps too
  steps.push({ title, call, result: String(result), note, state: lot.snapshot() });       // snapshot(): plain object
}
run("Car arrives", 'park(car "C1", t=0)', () => lot.park(new Vehicle("C1", "car"), 0).spotId, "Why this step matters.");
// ...then use { type: "scenario", steps } and { type: "code", files: [{ name: "lot.mjs", src: source }] }
```

Write each note after running, from what the step really shows.
