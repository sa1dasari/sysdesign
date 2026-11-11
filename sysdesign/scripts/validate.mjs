// Structural checks on a spec before it is built. Catches the mistakes that make a
// page silently wrong: unknown ids, edges to nowhere, sliders that the model never reads,
// a pick that is missing, a section type the runtime does not know.
const TYPES = new Set(["text", "requirements", "estimation", "api", "data", "arch", "tradeoffs", "failures", "qa",
  "patterns", "classes", "sequence", "states", "scenario", "code"]);

export function validate(spec) {
  const bad = [];
  if (!spec.title) bad.push("missing title");
  if (!["hld", "lld"].includes(spec.kind)) bad.push(`kind must be "hld" or "lld", got ${JSON.stringify(spec.kind)}`);
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
      for (const n of s.nodes ?? []) {
        if (!n.role && !n.why) bad.push(`arch: node ${n.id} has no role or why (the click-through panel would be empty)`);
        if (n.hit != null && !(s.edges ?? []).some((e) => e.from === n.id && e.miss)) bad.push(`arch: cache node ${n.id} has hit but no outgoing edge marked miss:true`);
      }
      if (!(s.presets ?? []).length) bad.push("arch: add presets (10x traffic, kill a node, ...) so the reader can break it");
    }
    if (s.type === "tradeoffs") for (const t of s.items ?? []) if (!t.options?.some((o) => o.pick)) bad.push(`tradeoff "${t.question}" has no chosen option`);
    if (s.type === "classes") {
      const names = new Set((s.classes ?? []).map((c) => c.name));
      for (const r of s.relations ?? []) if (!names.has(r.from) || !names.has(r.to)) bad.push(`classes: relation ${r.from}->${r.to} names an unknown class`);
      for (const c of s.classes ?? []) if (!c.role) bad.push(`classes: ${c.name} has no role`);
    }
    if (s.type === "sequence") for (const m of s.messages ?? []) for (const a of [m.from, m.to]) if (!s.actors.includes(a)) bad.push(`sequence: message uses unknown actor ${a}`);
    if (s.type === "states") {
      const st = new Set((s.states ?? []).map((x) => x.id));
      for (const t of s.transitions ?? []) if (!st.has(t.from) || !st.has(t.to)) bad.push(`states: transition ${t.from}->${t.to} names an unknown state`);
      if (s.initial && !st.has(s.initial)) bad.push("states: initial is not a state");
    }
  }
  return bad;
}
