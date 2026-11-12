// Structural checks on a spec before it is built. Catches the mistakes that make a
// page silently wrong: unknown ids, edges to nowhere, sliders that the model never reads,
// a pick that is missing, a section type the runtime does not know.
const TYPES = new Set(["text", "requirements", "estimation", "api", "data", "arch", "tradeoffs", "failures", "qa",
  "patterns", "classes", "sequence", "states", "scenario", "code", "chart"]);
const KINDS = ["hld", "lld", "concept"];
const ICONS = ["phone", "browser", "user", "server", "worker", "queue", "cache", "database", "storage", "batch", "lock", "globe", "search", "mail"];
const MAX_CARRY = 16;

export function validate(spec) {
  const bad = [];
  if (!spec.title) bad.push("missing title");
  const kinds = [].concat(spec.kind ?? []);
  if (!kinds.length || kinds.some((k) => !KINDS.includes(k)) || new Set(kinds).size !== kinds.length)
    bad.push(`kind must be one of ${KINDS.join(", ")}, or a list of them for a page that covers more than one, got ${JSON.stringify(spec.kind)}`);
  if (!spec.idea) bad.push("missing `idea`: the one-sentence insight the whole page hangs on");
  const secs = spec.sections ?? [];
  if (!secs.length) bad.push("no sections");
  const ids = new Set();
  const params = new Set();
  for (const s of secs) {
    if (!TYPES.has(s.type)) bad.push(`unknown section type ${JSON.stringify(s.type)}`);
    if (s.id) { if (ids.has(s.id)) bad.push(`duplicate section id ${s.id}`); ids.add(s.id); }
    for (const c of [...(s.inputs ?? []), ...(s.controls ?? [])]) {
      if (!c.id || c.value == null) bad.push(`input/control needs id and value: ${JSON.stringify(c).slice(0, 60)}`);
      else { if (params.has(c.id)) bad.push(`duplicate param ${c.id}`); params.add(c.id); }
      if (c.min != null && (c.value < c.min || c.value > c.max)) bad.push(`param ${c.id} value ${c.value} outside ${c.min}..${c.max}`);
    }
  }
  const text = JSON.stringify(secs);
  for (const id of params) if (!new RegExp(`p\\.${id}\\b`).test(text)) bad.push(`param "${id}" is never read by any expression, so the slider would do nothing`);
  for (const s of secs) {
    if (s.type === "arch") {
      const nodes = new Set((s.nodes ?? []).map((n) => n.id));
      if (nodes.size !== (s.nodes ?? []).length) bad.push("arch: duplicate node id");
      for (const e of s.edges ?? []) {
        if (!nodes.has(e.from) || !nodes.has(e.to)) bad.push(`arch: edge ${e.from}->${e.to} names an unknown node`);
      }
      if (!(s.nodes ?? []).some((n) => n.rps != null)) bad.push("arch: needs at least one source node with `rps`");
      if (s.flowPicture != null && typeof s.flowPicture !== "boolean") bad.push(`arch: flowPicture must be true or false, got ${JSON.stringify(s.flowPicture)}`);
      for (const n of s.nodes ?? []) {
        if (n.icon != null && !ICONS.includes(n.icon)) bad.push(`arch: node ${n.id} has icon ${JSON.stringify(n.icon)}, which is not one of ${ICONS.join(", ")}`);
        if (!n.role && !n.why) bad.push(`arch: node ${n.id} has no role or why (the click-through panel would be empty)`);
        if (n.hit != null && !(s.edges ?? []).some((e) => e.from === n.id && e.miss)) bad.push(`arch: cache node ${n.id} has hit but no outgoing edge marked miss:true`);
        if (n.hit != null) for (const e of (s.edges ?? []).filter((e) => e.from === n.id && !e.miss && !e.call && !e.async))
          bad.push(`arch: edge ${e.from}->${e.to} leaves cache ${n.id} without miss:true. A cache answers hits itself, so every route onward carries only misses: mark it miss:true. To split found vs not found, put the share on the node before the cache`);
      }
      if (!(s.presets ?? []).length) bad.push("arch: add presets (10x traffic, kill a node, ...) so the reader can break it");
      const groupIds = new Set((s.groups ?? []).map((g) => g.id));
      for (const n of s.nodes ?? []) if (n.group != null && !groupIds.has(n.group)) bad.push(`arch: node ${n.id} is in group "${n.group}", which is not in groups`);
      const linked = (a, b) => (s.edges ?? []).some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
      for (const f of s.flows ?? []) {
        if (!f.label || !(f.steps ?? []).length) bad.push("arch: each flow needs a label and steps");
        for (const [i, st] of (f.steps ?? []).entries()) {
          const where = `arch: flow "${f.label}" step ${i + 1}`;
          if (!st.text) bad.push(`${where} has no text`);
          if (st.carry != null && (typeof st.carry !== "string" || [...st.carry].length > MAX_CARRY)) bad.push(`${where}: carry must be a string of at most ${MAX_CARRY} characters (it labels a token on an arrow), got ${JSON.stringify(st.carry)}`);
          if (!(st.path ?? []).length) bad.push(`${where} has no path (the boxes it lights up)`);
          for (const id of st.path ?? []) if (!nodes.has(id)) bad.push(`${where} names unknown node ${id}`);
          for (let k = 1; k < (st.path ?? []).length; k++) if (!linked(st.path[k - 1], st.path[k])) bad.push(`${where}: no edge between ${st.path[k - 1]} and ${st.path[k]}`);
        }
      }
      const cyc = findCycle(s.nodes ?? [], s.edges ?? []);
      if (cyc) bad.push(`arch: edges form a cycle (${cyc.join(" -> ")}). The simulator needs a one-way graph: model a reply as a \`call: true\` edge, not an edge back`);
    }
    if (s.type === "tradeoffs") for (const t of s.items ?? []) if (!t.options?.some((o) => o.pick)) bad.push(`tradeoff "${t.question}" has no chosen option`);
    if (s.type === "classes") {
      const names = new Set((s.classes ?? []).map((c) => c.name));
      for (const r of s.relations ?? []) if (!names.has(r.from) || !names.has(r.to)) bad.push(`classes: relation ${r.from}->${r.to} names an unknown class`);
      for (const c of s.classes ?? []) if (!c.role) bad.push(`classes: ${c.name} has no role`);
    }
    if (s.type === "sequence") {
      if (!Array.isArray(s.actors) || !s.actors.length) bad.push("sequence: needs an actors list");
      else for (const m of s.messages ?? []) for (const a of [m.from, m.to]) if (!s.actors.includes(a)) bad.push(`sequence: message uses unknown actor ${a}`);
    }
    if (s.type === "states") {
      const st = new Set((s.states ?? []).map((x) => x.id));
      for (const t of s.transitions ?? []) if (!st.has(t.from) || !st.has(t.to)) bad.push(`states: transition ${t.from}->${t.to} names an unknown state`);
      if (s.initial && !st.has(s.initial)) bad.push("states: initial is not a state");
    }
    if (s.type === "chart") checkChart(s, params, bad);
  }
  if (secs.filter((s) => s.type === "arch").length > 1) bad.push("only one arch section per page: the simulation runs one architecture. Put a second diagram on its own page");
  // every p.x and r.x an expression reads must exist; a typo would silently read 0
  const rowIds = new Set(secs.flatMap((s) => (s.rows ?? []).map((r) => r.id)));
  const exprs = [];
  (function walk(v) { if (typeof v === "string") { if (v.startsWith("=")) exprs.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(secs);
  for (const x of exprs) {
    for (const [, k] of x.matchAll(/\bp\.(\w+)/g)) if (!params.has(k)) bad.push(`expression ${x.slice(0, 60)} reads p.${k}, which is not a slider (inputs or controls)`);
    for (const [, k] of x.matchAll(/\br\.(\w+)/g)) if (!rowIds.has(k)) bad.push(`expression ${x.slice(0, 60)} reads r.${k}, which is not an estimation row`);
  }
  // preset and inject keys must be sliders, or the preset silently does nothing
  for (const s of secs) {
    for (const pr of s.presets ?? []) if (pr.expect != null && !(typeof pr.expect === "string" && pr.expect.startsWith("="))) bad.push(`preset "${pr.label}": expect must be an expression string starting with "=", got ${JSON.stringify(pr.expect)}`);
    for (const pr of s.presets ?? []) for (const k of Object.keys(pr.set ?? {})) if (!params.has(k)) bad.push(`preset "${pr.label}" sets ${k}, which is not a slider`);
    for (const f of s.type === "failures" ? s.items ?? [] : []) for (const k of Object.keys(f.inject ?? {})) if (!params.has(k)) bad.push(`failure "${f.what}" injects ${k}, which is not a slider`);
  }
  // rows that depend on each other in a loop can never settle
  const rowExpr = new Map(secs.flatMap((s) => (s.rows ?? []).map((r) => [r.id, String(r.expr ?? "")])));
  const seen = new Map();
  const loop = (id) => {
    if (seen.get(id) === 2) return null; if (seen.get(id) === 1) return id;
    seen.set(id, 1);
    for (const [, k] of (rowExpr.get(id) ?? "").matchAll(/\br\.(\w+)/g)) { if (rowExpr.has(k)) { const c = loop(k); if (c) return c; } }
    seen.set(id, 2); return null;
  };
  for (const id of rowExpr.keys()) { const c = loop(id); if (c) { bad.push(`estimation rows depend on each other in a loop at ${c}`); break; } }
  return bad;
}

// Things that do not stop the build but make the page worse. Returned as messages.
export function lint(spec) {
  const warn = [];
  for (const s of spec.sections ?? []) {
    if (s.type !== "arch") continue;
    for (const f of s.flows ?? []) for (const [i, st] of (f.steps ?? []).entries()) {
      if ((st.path ?? []).length >= 2 && !st.carry) {
        const fallback = String(st.text ?? "").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
        warn.push(`flow "${f.label}" step ${i + 1} has no carry; using "${fallback}"`);
      }
    }
  }
  return warn;
}

function checkChart(s, params, bad) {
  const where = `chart "${s.title ?? s.id ?? "?"}"`;
  const x = s.x ?? {}, series = s.series ?? [];
  if (x.values) { if (!Array.isArray(x.values) || x.values.length < 2) bad.push(`${where}: x.values needs at least two numbers`); }
  else if (!(typeof x.from === "number" && typeof x.to === "number" && x.from < x.to)) bad.push(`${where}: x needs from < to, or a values list`);
  if (x.log && (x.values ? Math.min(...x.values) : x.from) <= 0) bad.push(`${where}: a log x axis needs values above 0`);
  if (x.param && !params.has(x.param)) bad.push(`${where}: x.param "${x.param}" is not a slider on the page`);
  const y = s.y ?? {};
  if (y.log && y.min != null && !(y.min > 0)) bad.push(`${where}: a log y axis needs y.min above 0, or no y.min`);
  if (!series.length) bad.push(`${where}: needs at least one series`);
  if (series.length > 4) bad.push(`${where}: at most 4 series. Split it into two charts`);
  for (const e of series) {
    if (!e.label) bad.push(`${where}: every series needs a label`);
    if (e.y) {
      if (!x.values) bad.push(`${where}: series "${e.label}" has y data, so x needs a values list`);
      else if (e.y.length !== x.values.length) bad.push(`${where}: series "${e.label}" has ${e.y.length} y values for ${x.values.length} x values`);
    } else if (typeof e.expr !== "string" || !e.expr.startsWith("=")) bad.push(`${where}: series "${e.label}" needs expr ("=...") or y data`);
    else if (!/\bx\b/.test(e.expr) && !x.param) bad.push(`${where}: series "${e.label}" never reads x, so it would be a flat line. Read x, or set x.param`);
  }
}

function findCycle(nodes, edges) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from)?.push(e.to);
  const state = new Map(), stack = [];
  const visit = (id) => {
    state.set(id, 1); stack.push(id);
    for (const t of out.get(id) ?? []) {
      if (state.get(t) === 1) return [...stack.slice(stack.indexOf(t)), t];
      if (!state.has(t)) { const c = visit(t); if (c) return c; }
    }
    state.set(id, 2); stack.pop();
    return null;
  };
  for (const n of nodes) if (!state.has(n.id)) { const c = visit(n.id); if (c) return c; }
  return null;
}
