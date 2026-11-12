// A small valid hld spec used by the tests. `overrides` is deep-merged into the arch section.
// Objects merge key by key; arrays and scalars in overrides replace the fixture's value.
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

export function miniSpec(overrides = {}) {
  const arch = {
    type: "arch",
    title: "Architecture",
    latencyBudget: 200,
    intro: "A page load goes app, API, cache, database.",
    groups: [
      { id: "front", label: "Front" },
      { id: "data", label: "Data" },
    ],
    nodes: [
      { id: "app", label: "App", group: "front", col: 0, row: 0, kind: "clients", rps: "=r.rps", role: "The client.", why: "Where requests start." },
      { id: "api", label: "API", group: "front", col: 1, row: 0, instances: "=p.apiInst", cap: 1000, ms: 10, role: "Serves requests.", why: "Holds the logic.", scale: "Add instances.", fails: "Saturates." },
      { id: "cache", label: "Cache", group: "data", col: 2, row: 0, kind: "cache", hit: 0.9, instances: 2, cap: 10000, ms: 1, role: "Fast copies.", why: "Spares the database." },
      { id: "db", label: "Database", group: "data", col: 3, row: 0, kind: "store", instances: 2, cap: 5000, ms: 5, role: "Source of truth.", why: "Holds the data." },
    ],
    edges: [
      { from: "app", to: "api" },
      { from: "api", to: "cache", call: true },
      { from: "cache", to: "db", miss: true },
    ],
    flows: [
      {
        label: "Open the page",
        steps: [
          { path: ["app", "api"], carry: "GET /home", text: "The app asks the **API** for the home page." },
          { path: ["api", "cache"], carry: "lookup", text: "The API looks in the **cache**." },
          { path: ["api"], text: "The API builds the page." },
          { path: ["api", "app"], carry: "page", text: "The page goes back to the app." },
        ],
      },
    ],
    presets: [
      { label: "Normal", set: {}, note: "Two API instances at half load." },
      { label: "Kill api", set: { apiInst: 0 }, note: "No API, so nothing is served." },
    ],
    controls: [{ id: "apiInst", label: "API instances", value: 2, min: 0, max: 10, step: 1 }],
  };
  return {
    kind: "hld",
    title: "Mini",
    subtitle: "A tiny test page.",
    idea: "One idea.",
    sections: [
      {
        type: "estimation",
        title: "Load",
        inputs: [{ id: "users", label: "Users", value: 2000, min: 100, max: 10000, step: 100 }],
        rows: [{ id: "rps", label: "Requests", expr: "=p.users/2", fmt: "si", unit: "req/s" }],
      },
      merge(arch, overrides),
    ],
  };
}
