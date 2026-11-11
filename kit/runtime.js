/* sysdesign runtime. Renders a page from the JSON spec in <script id="spec">.
   No dependencies. Everything on the page is computed from the spec's own
   inputs and formulas, so numbers in prose, tables and the simulation agree. */
(function () {
  "use strict";
  var SPEC = JSON.parse(document.getElementById("spec").textContent);
  var S = { p: {}, r: {}, m: null }; // params, estimation rows, last sim result
  var listeners = [];
  var SVG = "http://www.w3.org/2000/svg";

  // ---------- helpers ----------
  function h(tag, attrs) {
    var svg = /^(svg|g|path|rect|circle|line|text|marker|defs|polygon|tspan)$/.test(tag);
    var el = svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function md(s) { // tiny markdown: **bold**, `code`
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function paras(arr) { return (Array.isArray(arr) ? arr : [arr]).map(function (t) { return h("p", { html: md(t) }); }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  var H = {
    min: Math.min, max: Math.max, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    log2: Math.log2, log10: Math.log10, log: Math.log, pow: Math.pow, sqrt: Math.sqrt, abs: Math.abs, clamp: clamp,
    // Hit ratio of an ideal cache holding the c most popular of n items when popularity is Zipf(s).
    zipf: function (c, n, s) {
      c = Math.max(1, Math.min(c, n)); s = s == null ? 1 : s;
      var Hn = function (k) { return Math.abs(s - 1) < 1e-6 ? Math.log(k) + 0.5772 : (Math.pow(k, 1 - s) - 1) / (1 - s) + 1; };
      return clamp(Hn(c) / Hn(n), 0, 1);
    }
  };
  var cache = {};
  function val(x, extra) {
    if (typeof x !== "string" || x.charAt(0) !== "=") return x;
    var f = cache[x];
    if (!f) {
      try { f = cache[x] = new Function("p", "r", "m", "H", "with(H){return (" + x.slice(1) + ")}"); }
      catch (e) { fail("bad expression " + x + ": " + e.message); f = function () { return 0; }; }
    }
    try { var v = f(S.p, S.r, extra || S.m, H); return v == null || isNaN(v) && typeof v === "number" ? 0 : v; }
    catch (e) { fail("expression " + x + ": " + e.message); return 0; }
  }
  function fail(msg) { document.body.dataset.error = (document.body.dataset.error || "") + msg + " | "; }
  function fmt(v, f, unit) {
    if (typeof v !== "number") return String(v);
    var s;
    if (f === "pct") s = (v * 100).toFixed(v < 0.1 ? 2 : 1) + "%";
    else if (f === "bytes") s = scale(v, ["B", "KB", "MB", "GB", "TB", "PB", "EB"], 1000);
    else if (f === "ms") s = v < 10 ? v.toFixed(1) + " ms" : Math.round(v) + " ms";
    else if (f === "onoff") return v ? "On" : "Off";
    else if (f === "int") s = Math.round(v).toLocaleString("en-US");
    else s = si(v);
    return unit && f !== "bytes" && f !== "ms" && f !== "pct" ? s + " " + unit : s;
  }
  function si(v) {
    var a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2).replace(/\.?0+$/, "") + "T";
    if (a >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1).replace(/\.?0+$/, "") + "K";
    if (a >= 100) return Math.round(v).toLocaleString("en-US");
    if (a >= 1) return v.toFixed(1).replace(/\.0$/, "");
    if (a === 0) return "0";
    return v.toPrecision(2);
  }
  function scale(v, units, base) { var i = 0; while (Math.abs(v) >= base && i < units.length - 1) { v /= base; i++; } return v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, "") + " " + units[i]; }

  // ---------- reactive store ----------
  function declareParams() {
    (SPEC.sections || []).forEach(function (s) {
      (s.inputs || []).concat(s.controls || []).forEach(function (c) { if (c.id && c.value != null) S.p[c.id] = c.value; });
    });
  }
  var DEFAULTS = {};
  function onChange(fn) { listeners.push(fn); }
  function recompute() {
    (SPEC.sections || []).forEach(function (s) {
      (s.rows || []).forEach(function (row) { if (row.id) S.r[row.id] = val(row.expr, null); });
    });
    var arch = (SPEC.sections || []).filter(function (s) { return s.type === "arch"; })[0];
    S.m = arch ? simulate(arch) : null;
    // rows that read the simulation (m) get a second pass
    (SPEC.sections || []).forEach(function (s) { (s.rows || []).forEach(function (row) { if (row.id) S.r[row.id] = val(row.expr, S.m); }); });
    listeners.forEach(function (f) { f(); });
    if (S.m) document.body.dataset.sim = JSON.stringify({ rps: S.m.rps, err: S.m.err, lat: S.m.lat, bottleneck: S.m.bottleneck });
  }
  function setParam(id, v) { S.p[id] = v; recompute(); }

  // ---------- fluid flow simulation ----------
  // A request rate enters at source nodes and is split along edges. Each node serves up to
  // instances x capacity requests per second; the rest is shed. Latency per node is the
  // service time stretched by 1/(1-utilisation), the M/M/1 shape. Cache nodes terminate
  // `hit` of their traffic. Async edges load their targets but are not on the user's path.
  function simulate(arch) {
    var nodes = arch.nodes, by = {}, i;
    nodes.forEach(function (n) { by[n.id] = n; });
    var out = {}, inn = {};
    nodes.forEach(function (n) { out[n.id] = []; inn[n.id] = []; });
    arch.edges.forEach(function (e) { out[e.from].push(e); inn[e.to].push(e); });
    // topological order
    var indeg = {}, order = [], q = [];
    nodes.forEach(function (n) { indeg[n.id] = inn[n.id].length; if (!indeg[n.id]) q.push(n.id); });
    while (q.length) { var id = q.shift(); order.push(id); out[id].forEach(function (e) { if (--indeg[e.to] === 0) q.push(e.to); }); }
    if (order.length !== nodes.length) { fail("architecture has a cycle"); return null; }
    var res = { nodes: {}, edges: [] };
    var flow = {}; // edge index -> rps
    arch.edges.forEach(function (e, k) { e._k = k; });
    order.forEach(function (id) {
      var n = by[id], r = res.nodes[id] = { id: id };
      var inflow = n.rps != null ? val(n.rps) : 0;
      inn[id].forEach(function (e) { inflow += flow[e._k] || 0; });
      var inst = n.instances != null ? Math.max(0, val(n.instances)) : 1;
      var cap = n.cap != null ? val(n.cap) : Infinity;
      var total = inst * cap;
      var acc = Math.min(inflow, total);
      var rho = total === Infinity ? 0 : total > 0 ? inflow / total : (inflow > 0 ? 9 : 0);
      var svc = n.ms != null ? val(n.ms) : 0;
      r.inflow = inflow; r.inst = inst; r.cap = cap; r.total = total;
      r.accepted = acc; r.shed = inflow - acc; r.util = rho; r.accFrac = inflow > 0 ? acc / inflow : 1;
      r.latency = svc ? svc / (1 - Math.min(rho, 0.97)) : 0;
      r.hit = n.hit != null ? clamp(val(n.hit), 0, 1) : 0;
      r.growth = n.kind === "queue" && inflow > total ? inflow - total : 0; // backlog growth per second
      // split accepted traffic across outgoing edges
      var outs = out[id], eq = outs.filter(function (e) { return e.share == null && !e.call && !e.async; }).length;
      outs.forEach(function (e) {
        var sh = e.share != null ? val(e.share) : (e.call || e.async) ? 1 : 1 / Math.max(1, eq);
        if (e.miss) sh *= (1 - r.hit);
        var mult = e.mult != null ? val(e.mult) : 1;
        flow[e._k] = acc * sh * mult;
        res.edges[e._k] = { flow: flow[e._k], share: sh, mult: mult };
      });
    });
    // success probability and expected latency of a request entering each node (sync edges only)
    var memo = {};
    function path(id) {
      if (memo[id]) return memo[id];
      var r = res.nodes[id], sync = out[id].filter(function (e) { return !e.async; });
      var alts = sync.filter(function (e) { return !e.call; }), calls = sync.filter(function (e) { return e.call; });
      var s = 0, l = r.latency, cover = 0;
      alts.forEach(function (e) {
        var sh = res.edges[e._k].share, c = path(e.to);
        s += sh * c.s; l += sh * c.l; cover += sh;
      });
      var hitShare = r.hit && alts.some(function (e) { return e.miss; }) ? r.hit : 0;
      s += hitShare; cover += hitShare;
      if (!alts.length) s = 1; else if (cover < 1) s += 1 - cover; // traffic with nowhere to go ends here, successfully
      calls.forEach(function (e) { // calls every request may make: all must succeed, latencies add
        var sh = res.edges[e._k].share, c = path(e.to);
        s *= (1 - sh) + sh * c.s; l += sh * c.l;
      });
      return memo[id] = { s: s * r.accFrac, l: l };
    }
    var srcs = nodes.filter(function (n) { return n.rps != null; }), tot = 0, ok = 0, lat = 0;
    srcs.forEach(function (n) {
      if (n.internal) return;
      var rate = res.nodes[n.id].inflow, p = path(n.id); tot += rate; ok += rate * p.s; lat += rate * p.l;
      res.nodes[n.id].path = p;
    });
    res.rps = tot; res.served = ok; res.err = tot > 0 ? 1 - ok / tot : 0; res.lat = tot > 0 ? lat / tot : 0;
    var worst = null;
    nodes.forEach(function (n) { var r = res.nodes[n.id]; if (r.total !== Infinity && (!worst || r.util > res.nodes[worst].util)) worst = n.id; });
    res.bottleneck = worst;
    return res;
  }

  // ---------- sections ----------
  var builders = {};

  builders.text = function (s) { return [paras(s.body || [])]; };

  builders.requirements = function (s) {
    function col(t, items) { return h("div", { class: "card" }, h("h3", null, t), h("ul", null, (items || []).map(function (x) { return h("li", { html: md(x) }); }))); }
    return [h("div", { class: "grid g3" }, col("Functional", s.functional), col("Non-functional", s.nonfunctional), s.outOfScope ? col("Out of scope", s.outOfScope) : null)];
  };

  builders.estimation = function (s) {
    var outs = [], inputs = h("div", { class: "card" }, h("h3", null, "Assumptions (drag)"));
    (s.inputs || []).forEach(function (c) {
      var o = h("output"), inp = h("input", { type: "range", min: c.min, max: c.max, step: c.step || "any", value: c.value, "aria-label": c.label });
      var lg = c.log;
      if (lg) { inp.min = Math.log10(c.min); inp.max = Math.log10(c.max); inp.step = "any"; inp.value = Math.log10(c.value); }
      inp.addEventListener("input", function () { setParam(c.id, lg ? Math.pow(10, +inp.value) : +inp.value); });
      onChange(function () { o.textContent = fmt(S.p[c.id], c.fmt, c.unit); });
      inputs.appendChild(h("div", { class: "inp" }, h("label", null, c.label), o, inp));
    });
    var tb = h("table", { class: "rows" });
    (s.rows || []).forEach(function (row) {
      var td = h("td");
      onChange(function () { td.textContent = fmt(val(row.expr), row.fmt, row.unit); });
      tb.appendChild(h("tr", null, h("td", null, row.label, row.why ? h("span", { class: "why", html: md(row.why) }) : null), td));
    });
    return [paras(s.body || []), h("div", { class: "est" }, inputs, h("div", { class: "card" }, h("h3", null, "Derived"), tb))];
  };

  builders.api = function (s) {
    return [h("div", { class: "grid" }, (s.endpoints || []).map(function (e) {
      return h("div", { class: "card ep" },
        h("span", { class: "m " + e.method }, e.method), h("span", { class: "p" }, e.path),
        e.desc ? h("span", { class: "d", html: md(e.desc) }) : null,
        e.req ? h("pre", null, e.req) : null, e.res ? h("pre", null, e.res) : null);
    }))];
  };

  builders.data = function (s) {
    return [paras(s.body || []), h("div", { class: "grid g2" }, (s.tables || []).map(function (t) {
      return h("div", { class: "card" }, h("span", { class: "store" }, t.store || ""), h("h3", null, t.name),
        h("table", { class: "cols" }, (t.columns || []).map(function (c) {
          return h("tr", null, h("td", { class: "k" }, c.key || ""), h("td", null, c.name), h("td", { class: "t" }, c.type || ""), h("td", { class: "nt" }, c.note || ""));
        })), t.why ? h("p", { style: "margin:10px 0 0;font-size:14px;color:var(--mute)", html: md(t.why) }) : null);
    }))];
  };

  builders.tradeoffs = function (s) {
    return (s.items || []).map(function (t) {
      return h("div", { style: "margin-bottom:26px" }, h("p", { html: "<b>" + md(t.question) + "</b>" }),
        h("div", { class: "grid g2" }, t.options.map(function (o) {
          return h("div", { class: "card opt" + (o.pick ? " pick" : "") }, o.pick ? h("span", { class: "badge" }, "Chosen") : null, h("h4", null, o.name),
            h("ul", { style: "list-style:none;padding:0;margin:0" }, (o.pros || []).map(function (x) { return h("li", { class: "pro", html: md(x) }); }),
              (o.cons || []).map(function (x) { return h("li", { class: "con", html: md(x) }); })));
        })), t.why ? h("p", { style: "margin-top:10px;color:var(--mute)", html: md(t.why) }) : null);
    });
  };

  builders.failures = function (s) {
    return [h("div", { class: "grid g2" }, (s.items || []).map(function (f) {
      return h("div", { class: "card fail" }, h("h4", null, f.what),
        h("dl", null, h("dt", null, "What happens"), h("dd", { html: md(f.effect) }), h("dt", null, "Mitigation"), h("dd", { html: md(f.mitigation) })),
        f.inject ? h("button", { class: "chip", style: "margin-top:12px", onclick: function () { applyPreset(f.inject); location.hash = "#" + (SPEC.sections.filter(function (x) { return x.type === "arch"; })[0] || {}).id; } }, "Inject in the simulation") : null);
    }))];
  };

  builders.qa = function (s) {
    return (s.items || []).map(function (x) { return h("details", { class: "q" }, h("summary", null, x.q), h("div", { class: "a" }, paras(x.a))); });
  };

  builders.patterns = function (s) {
    return [h("div", { class: "grid g2" }, (s.items || []).map(function (x) {
      return h("div", { class: "card" }, h("h3", null, x.name), h("p", { style: "margin:0 0 6px", html: md(x.where) }), h("p", { style: "margin:0;color:var(--mute);font-size:14px", html: md(x.why) }));
    }))];
  };

  // ----- architecture simulator -----
  var presetHooks = [];
  function applyPreset(set) {
    // a preset is absolute: start from the page's defaults, then apply it
    for (var d in DEFAULTS) S.p[d] = DEFAULTS[d];
    for (var k in set) S.p[k] = set[k];
    recompute(); presetHooks.forEach(function (f) { f(); });
  }

  builders.arch = function (s) {
    var NW = 152, NH = 60, GX = 72, GY = 30, PAD = 20;
    var nodes = s.nodes, by = {}, depth = {};
    nodes.forEach(function (n) { by[n.id] = n; depth[n.id] = 0; });
    for (var pass = 0; pass < nodes.length; pass++) s.edges.forEach(function (e) { depth[e.to] = Math.max(depth[e.to], depth[e.from] + 1); });
    var cols = {}, maxD = 0;
    nodes.forEach(function (n) { var d = depth[n.id]; (cols[d] = cols[d] || []).push(n); maxD = Math.max(maxD, d); });
    var maxRows = 0; for (var c in cols) maxRows = Math.max(maxRows, cols[c].length);
    var W = PAD * 2 + (maxD + 1) * NW + maxD * GX, Ht = PAD * 2 + maxRows * NH + (maxRows - 1) * GY;
    nodes.forEach(function (n) {
      var list = cols[depth[n.id]], idx = list.indexOf(n), colH = list.length * NH + (list.length - 1) * GY;
      n._x = PAD + depth[n.id] * (NW + GX); n._y = PAD + (Ht - 2 * PAD - colH) / 2 + idx * (NH + GY);
      if (n.row != null) n._y = PAD + n.row * (NH + GY);
    });
    var svg = h("svg", { viewBox: "0 0 " + W + " " + Ht, role: "img", "aria-label": s.title || "architecture" });
    var edgeG = h("g"), nodeG = h("g"), dotG = h("g");
    svg.appendChild(edgeG); svg.appendChild(dotG); svg.appendChild(nodeG);
    var edgeEls = s.edges.map(function (e, k) {
      var a = by[e.from], b = by[e.to];
      var x1 = a._x + NW, y1 = a._y + NH / 2, x2 = b._x, y2 = b._y + NH / 2, mx = (x1 + x2) / 2;
      var path = h("path", { class: "edge" + (e.async ? " async" : ""), d: "M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2 });
      var lab = e.label ? h("text", { class: "elabel", x: mx, y: (y1 + y2) / 2 - 5, "text-anchor": "middle" }, e.label) : null;
      edgeG.appendChild(path); if (lab) edgeG.appendChild(lab);
      return { path: path, len: 0, dots: [], e: e };
    });
    var nodeEls = {};
    var selected = null, detail = h("dl", { class: "detail", style: "display:none" });
    nodes.forEach(function (n) {
      var g = h("g", { class: "node", tabindex: 0, role: "button", "aria-label": n.label }), sub = h("text", { class: "s", x: n._x + 12, y: n._y + 41 }), ub = h("rect", { class: "ubar", x: n._x + 10, y: n._y + NH - 9, height: 3, width: 0, rx: 1.5 });
      g.appendChild(h("rect", { class: "box", x: n._x, y: n._y, width: NW, height: NH, style: "--u:0" }));
      g.appendChild(h("text", { x: n._x + 12, y: n._y + 23 }, n.label)); g.appendChild(sub); g.appendChild(ub);
      var pick = function () { selected = selected === n.id ? null : n.id; paintDetail(); paintSel(); };
      g.addEventListener("click", pick); g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
      nodeG.appendChild(g); nodeEls[n.id] = { g: g, sub: sub, ub: ub, box: g.firstChild };
    });
    function paintSel() { nodes.forEach(function (n) { nodeEls[n.id].g.setAttribute("class", "node" + (selected === n.id ? " sel" : "") + (S.m && S.m.nodes[n.id].total === 0 ? " dead" : "")); }); }
    function paintDetail() {
      detail.innerHTML = "";
      if (!selected) { detail.style.display = "none"; return; }
      var n = by[selected], r = S.m && S.m.nodes[selected]; detail.style.display = "grid";
      var rows = [["Role", n.role], ["Why it's here", n.why], ["Scales by", n.scale], ["Fails by", n.fails]];
      if (r) rows.push(["Load now", si(r.inflow) + " req/s in" + (r.total !== Infinity ? " of " + si(r.total) + " capacity (" + Math.round(r.util * 100) + "%)" : "") + (r.shed > 0.5 ? ", shedding " + si(r.shed) + "/s" : "") + (r.growth ? ", backlog growing " + si(r.growth) + "/s" : "")]);
      rows.forEach(function (x) { if (x[1]) { detail.appendChild(h("dt", null, x[0])); detail.appendChild(h("dd", { html: md(x[1]) })); } });
    }
    var metricEls = {}, metricBar = h("div", { class: "metrics" });
    var defs = [
      { id: "rps", label: "Offered load", get: function (m) { return si(m.rps) + " req/s"; } },
      { id: "err", label: "Failed requests", get: function (m) { return fmt(m.err, "pct"); }, cls: function (m) { return m.err > 0.05 ? "bad" : m.err > 0.001 ? "warn" : ""; } },
      { id: "lat", label: "Avg latency", get: function (m) { return fmt(m.lat, "ms"); }, cls: function (m) { return s.latencyBudget && m.lat > s.latencyBudget ? "warn" : ""; } },
      { id: "bn", label: function (m) { return "Busiest: " + by[m.bottleneck].label; }, get: function (m) { return Math.round(m.nodes[m.bottleneck].util * 100) + "%"; }, cls: function (m) { var u = m.nodes[m.bottleneck].util; return u >= 1 ? "bad" : u > 0.8 ? "warn" : ""; } }
    ];
    (s.metrics || []).forEach(function (x, i) { defs.push({ id: "x" + i, label: x.label, get: function (m) { return fmt(val(x.expr, m), x.fmt, x.unit); } }); });
    defs.forEach(function (d) { var b = h("b"), lab = h("span", null, typeof d.label === "string" ? d.label : ""), box = h("div", { class: "metric" }, b, lab); metricEls[d.id] = { b: b, box: box, d: d, lab: lab }; metricBar.appendChild(box); });

    var note = h("div", { class: "simnote", html: s.intro ? md(s.intro) : "" });
    var presetBar = h("div", { class: "bar" });
    var presetBtns = [];
    (s.presets || []).forEach(function (pr) {
      var b = h("button", { class: "chip", onclick: function () { applyPreset(pr.set); note.innerHTML = "<b>" + esc(pr.label) + ".</b> " + md(pr.note || ""); b.classList.add("on"); } }, pr.label);
      presetBtns.push({ b: b, pr: pr }); presetBar.appendChild(b);
    });
    presetHooks.push(function () { presetBtns.forEach(function (x) { var on = true, want = {}; for (var d in DEFAULTS) want[d] = DEFAULTS[d]; for (var k in x.pr.set) want[k] = x.pr.set[k]; for (var w in want) if (S.p[w] !== want[w]) on = false; x.b.classList.toggle("on", on); }); });
    var ctrls = h("div", { class: "ctrls" });
    var ctrlSync = [];
    (s.controls || []).forEach(function (c) {
      var o = h("output"), inp = h("input", { type: "range", min: c.min, max: c.max, step: c.step || 1, value: c.value, "aria-label": c.label });
      if (c.log) { inp.min = Math.log10(c.min); inp.max = Math.log10(c.max); inp.step = "any"; }
      inp.addEventListener("input", function () { setParam(c.id, c.log ? Math.pow(10, +inp.value) : +inp.value); presetHooks.forEach(function (f) { f(); }); });
      ctrlSync.push(function () { var v = S.p[c.id]; inp.value = c.log ? Math.log10(v) : v; o.textContent = fmt(v, c.fmt, c.unit); });
      ctrls.appendChild(h("div", { class: "inp" }, h("label", null, c.label), o, inp));
    });

    var dots = [], t0 = performance.now(), reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function paint() {
      var m = S.m; if (!m) return;
      ctrlSync.forEach(function (f) { f(); });
      nodes.forEach(function (n) {
        var r = m.nodes[n.id], el = nodeEls[n.id];
        el.box.setAttribute("style", "--u:" + clamp(r.util > 1 ? 0.55 + Math.min(r.util - 1, 1) * 0.35 : r.util * 0.35, 0, 0.9));
        var txt = r.total === Infinity ? (n.kind || "") : r.total === 0 ? "DOWN" : r.inst + "× " + si(r.cap) + "/s";
        if (n.hit != null) txt = Math.round(r.hit * 100) + "% hit";
        if (n.rps != null && r.total === Infinity) txt = si(r.inflow) + "/s";
        el.sub.textContent = txt;
        var w = r.total === Infinity ? 0 : clamp(r.util, 0, 1) * (NW - 20);
        el.ub.setAttribute("width", w); el.ub.setAttribute("class", "ubar" + (r.util >= 1 ? " hot" : r.util > 0.8 ? " warn" : ""));
      });
      paintSel(); paintDetail();
      defs.forEach(function (d) { var e = metricEls[d.id]; e.b.textContent = d.get(m); if (typeof d.label === "function") e.lab.textContent = d.label(m); e.box.className = "metric " + (d.cls ? d.cls(m) : ""); });
      // edge widths and particle counts follow flow
      edgeEls.forEach(function (E, k) {
        var f = m.edges[k] ? m.edges[k].flow : 0;
        E.path.setAttribute("stroke-width", clamp(1 + Math.log10(1 + f) * 0.7, 1, 5));
        var want = reduce ? 0 : clamp(Math.round(Math.log2(1 + f) / 2), 0, 9);
        while (E.dots.length < want) { var d = h("circle", { r: 2.6, class: "dot" + (E.e.async ? " async" : "") }); dotG.appendChild(d); E.dots.push(d); }
        while (E.dots.length > want) dotG.removeChild(E.dots.pop());
        if (!E.len) E.len = E.path.getTotalLength();
      });
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      edgeEls.forEach(function (E) {
        if (!E.dots.length) return;
        if (!E.len) E.len = E.path.getTotalLength();
        var speed = 110 / Math.max(E.len, 1);
        E.dots.forEach(function (d, i) { var u = ((t * speed) + i / E.dots.length) % 1, p = E.path.getPointAtLength(u * E.len); d.setAttribute("cx", p.x); d.setAttribute("cy", p.y); });
      });
      requestAnimationFrame(frame);
    }
    onChange(paint);
    if (!reduce) requestAnimationFrame(frame);
    var stage = h("div", { class: "stage" }, svg);
    return [paras(s.body || []), h("div", { class: "card sim" }, presetBar.childNodes.length ? presetBar : null, stage, metricBar, ctrls.childNodes.length ? ctrls : null, detail, note)];
  };

  // ----- LLD: class diagram -----
  builders.classes = function (s) {
    var cw = 7.2, LH = 17, HD = 30, GX = 64, GY = 56, PAD = 20;
    var cl = s.classes, by = {};
    cl.forEach(function (c, i) {
      by[c.name] = c; c.fields = c.fields || []; c.methods = c.methods || [];
      var lines = [c.name].concat(c.fields, c.methods);
      c._w = Math.max(130, Math.ceil(Math.max.apply(null, lines.map(function (x) { return x.length; })) * cw) + 24);
      c._h = HD + (c.stereotype ? 14 : 0) + Math.max(1, c.fields.length) * LH + 10 + Math.max(1, c.methods.length) * LH + 8;
      if (!c.at) c.at = [i % 3, Math.floor(i / 3)];
    });
    var nc = 0, nr = 0; cl.forEach(function (c) { nc = Math.max(nc, c.at[0] + 1); nr = Math.max(nr, c.at[1] + 1); });
    var colW = [], rowH = [];
    for (var i = 0; i < nc; i++) colW[i] = Math.max.apply(null, [0].concat(cl.filter(function (c) { return c.at[0] === i; }).map(function (c) { return c._w; })));
    for (i = 0; i < nr; i++) rowH[i] = Math.max.apply(null, [0].concat(cl.filter(function (c) { return c.at[1] === i; }).map(function (c) { return c._h; })));
    cl.forEach(function (c) {
      var x = PAD, y = PAD; for (var a = 0; a < c.at[0]; a++) x += colW[a] + GX; for (a = 0; a < c.at[1]; a++) y += rowH[a] + GY;
      c._x = x + (colW[c.at[0]] - c._w) / 2; c._y = y + (rowH[c.at[1]] - c._h) / 2;
    });
    var W = PAD * 2 + colW.reduce(function (a, b) { return a + b; }, 0) + GX * (nc - 1), Hh = PAD * 2 + rowH.reduce(function (a, b) { return a + b; }, 0) + GY * (nr - 1);
    var svg = h("svg", { viewBox: "0 0 " + W + " " + Hh, style: "width:" + Math.min(W, 1000) + "px" });
    var defs = h("defs");
    function marker(id, d, fill) { return h("marker", { id: id, viewBox: "0 0 14 14", refX: 13, refY: 7, markerWidth: 12, markerHeight: 12, orient: "auto" }, h("path", { d: d, fill: fill, stroke: "var(--ink)", "stroke-width": 1.2 })); }
    defs.appendChild(marker("m-tri", "M1,1 L13,7 L1,13 Z", "var(--panel)"));
    defs.appendChild(marker("m-arr", "M1,2 L13,7 L1,12", "none"));
    defs.appendChild(h("marker", { id: "m-dia", viewBox: "0 0 16 14", refX: 1, refY: 7, markerWidth: 14, markerHeight: 12, orient: "auto" }, h("path", { d: "M1,7 L8,1 L15,7 L8,13 Z", fill: "var(--ink)", stroke: "var(--ink)", "stroke-width": 1 })));
    svg.appendChild(defs);
    function edgePoint(c, tx, ty) { // clip centre-to-target line to c's border
      var cx = c._x + c._w / 2, cy = c._y + c._h / 2, dx = tx - cx, dy = ty - cy;
      var sx = dx ? (c._w / 2) / Math.abs(dx) : Infinity, sy = dy ? (c._h / 2) / Math.abs(dy) : Infinity, k = Math.min(sx, sy);
      return [cx + dx * k, cy + dy * k];
    }
    var relG = h("g"); svg.appendChild(relG);
    (s.relations || []).forEach(function (r) {
      var a = by[r.from], b = by[r.to]; if (!a || !b) { fail("relation to unknown class " + r.from + "->" + r.to); return; }
      var p1 = edgePoint(a, b._x + b._w / 2, b._y + b._h / 2), p2 = edgePoint(b, a._x + a._w / 2, a._y + a._h / 2);
      var dash = r.type === "implements" || r.type === "uses";
      var ln = h("line", { class: "rel" + (dash ? " dash" : ""), x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] });
      if (r.type === "inherits" || r.type === "implements") ln.setAttribute("marker-end", "url(#m-tri)");
      else if (r.type === "has") ln.setAttribute("marker-start", "url(#m-dia)");
      else ln.setAttribute("marker-end", "url(#m-arr)");
      relG.appendChild(ln);
      if (r.label) relG.appendChild(h("text", { class: "rl", x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 - 4, "text-anchor": "middle" }, r.label));
    });
    var sel = null, info = h("div", { class: "simnote" }, s.hint || "Click a class to see its role.");
    var els = {};
    cl.forEach(function (c) {
      var g = h("g", { class: "cls", tabindex: 0 });
      g.appendChild(h("rect", { class: "fr", x: c._x, y: c._y, width: c._w, height: c._h, rx: 6 }));
      g.appendChild(h("rect", { class: "hd", x: c._x + .6, y: c._y + .6, width: c._w - 1.2, height: HD + (c.stereotype ? 14 : 0) - 1, rx: 5 }));
      var y = c._y + 19;
      if (c.stereotype) { g.appendChild(h("text", { class: "st", x: c._x + c._w / 2, y: y, "text-anchor": "middle" }, "«" + c.stereotype + "»")); y += 14; }
      g.appendChild(h("text", { class: "h", x: c._x + c._w / 2, y: y, "text-anchor": "middle" }, c.name));
      var yy = c._y + HD + (c.stereotype ? 14 : 0) + 13;
      (c.fields.length ? c.fields : [""]).forEach(function (f) { g.appendChild(h("text", { x: c._x + 10, y: yy }, f)); yy += LH; });
      yy += 3; g.appendChild(h("line", { x1: c._x, x2: c._x + c._w, y1: yy - LH + 3, y2: yy - LH + 3, stroke: "var(--ink)", "stroke-width": 1 }));
      yy += 6;
      (c.methods.length ? c.methods : [""]).forEach(function (f) { g.appendChild(h("text", { x: c._x + 10, y: yy }, f)); yy += LH; });
      var pick = function () { sel = sel === c.name ? null : c.name; cl.forEach(function (k) { els[k.name].setAttribute("class", "cls" + (sel === k.name ? " sel" : "")); }); info.innerHTML = sel ? "<b>" + esc(c.name) + ".</b> " + md(c.role || "") : (s.hint || ""); };
      g.addEventListener("click", pick); g.addEventListener("keydown", function (e) { if (e.key === "Enter") pick(); });
      svg.appendChild(g); els[c.name] = g;
    });
    return [paras(s.body || []), h("div", { class: "card diagram", style: "padding:0" }, h("div", { class: "diagram" }, svg), info)];
  };

  // ----- LLD: sequence diagram -----
  builders.sequence = function (s) {
    var AW = 150, TOP = 14, AH = 34, MG = 46, PAD = 20, n = s.actors.length;
    var W = PAD * 2 + n * AW, Hh = TOP + AH + (s.messages.length + 1) * MG + 20;
    var svg = h("svg", { viewBox: "0 0 " + W + " " + Hh, style: "width:" + Math.min(W, 1000) + "px" });
    svg.appendChild(h("defs", null, h("marker", { id: "sq-a", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" }, h("path", { d: "M1,1 L9,5 L1,9", fill: "none", stroke: "context-stroke", "stroke-width": 1.5 }))));
    var ax = {}; s.actors.forEach(function (a, i) { ax[a] = PAD + i * AW + AW / 2; });
    s.actors.forEach(function (a) {
      svg.appendChild(h("line", { class: "life", x1: ax[a], x2: ax[a], y1: TOP + AH, y2: Hh - 10 }));
      svg.appendChild(h("g", { class: "actor" }, h("rect", { x: ax[a] - 60, y: TOP, width: 120, height: AH }), h("text", { x: ax[a], y: TOP + 21, "text-anchor": "middle" }, a)));
    });
    var msgEls = [], cur = -1, note = h("div", { class: "grow" }, s.hint || "Press play or step through.");
    s.messages.forEach(function (m, i) {
      var y = TOP + AH + (i + 1) * MG, g = h("g", { class: "msg" + (m.ret ? " ret" : "") });
      if (m.from === m.to) {
        var x = ax[m.from];
        g.appendChild(h("path", { d: "M" + x + "," + (y - 10) + " h38 v18 h-36", "marker-end": "url(#sq-a)" }));
        g.appendChild(h("text", { x: x + 46, y: y + 3 }, m.text));
      } else {
        var x1 = ax[m.from], x2 = ax[m.to], dir = x2 > x1 ? 1 : -1;
        g.appendChild(h("line", { x1: x1, y1: y, x2: x2 - dir * 2, y2: y, "marker-end": "url(#sq-a)" }));
        g.appendChild(h("text", { x: (x1 + x2) / 2, y: y - 7, "text-anchor": "middle" }, m.text));
      }
      svg.appendChild(g); msgEls.push(g);
    });
    function show(i) {
      cur = i; msgEls.forEach(function (g, k) { g.setAttribute("class", "msg" + (s.messages[k].ret ? " ret" : "") + (i >= 0 && k > i ? " off" : "") + (k === i ? " on" : "")); });
      note.innerHTML = i >= 0 ? "<b>" + (i + 1) + ".</b> " + md(s.messages[i].note || s.messages[i].text) : esc(s.hint || "Press play or step through.");
    }
    var timer = null;
    function stop() { if (timer) { clearInterval(timer); timer = null; play.textContent = "Play"; } }
    var play = h("button", { class: "chip", onclick: function () { if (timer) return stop(); if (cur >= s.messages.length - 1) show(-1); play.textContent = "Pause"; timer = setInterval(function () { if (cur >= s.messages.length - 1) return stop(); show(cur + 1); }, 1500); } }, "Play");
    var ctl = h("div", { class: "ctl" }, play,
      h("button", { class: "chip", onclick: function () { stop(); show(Math.max(-1, cur - 1)); } }, "Back"),
      h("button", { class: "chip", onclick: function () { stop(); show(Math.min(s.messages.length - 1, cur + 1)); } }, "Next"), note);
    show(-1);
    return [paras(s.body || []), h("div", { class: "card", style: "padding:0" }, h("div", { class: "diagram" }, svg), ctl)];
  };

  // ----- LLD: state machine (runs the transition table) -----
  builders.states = function (s) {
    var BW = 128, BH = 44, GX = 70, GY = 70, PAD = 28;
    var st = s.states, by = {}; st.forEach(function (x, i) { by[x.id] = x; if (!x.at) x.at = [i, 0]; });
    var nc = 0, nr = 0; st.forEach(function (x) { nc = Math.max(nc, x.at[0] + 1); nr = Math.max(nr, x.at[1] + 1); });
    var W = PAD * 2 + nc * BW + (nc - 1) * GX, TOP = 14 + Math.max.apply(null, [0].concat(s.transitions.map(function (t) { return t.bend < 0 ? -t.bend : 0; }))), Hh = PAD + TOP + nr * BH + (nr - 1) * GY + 24;
    st.forEach(function (x) { x._x = PAD + x.at[0] * (BW + GX); x._y = TOP + x.at[1] * (BH + GY); });
    var svg = h("svg", { viewBox: "0 0 " + W + " " + Hh, style: "width:" + Math.min(W, 1000) + "px", class: "st" });
    svg.appendChild(h("defs", null, h("marker", { id: "st-a", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto" }, h("path", { d: "M1,1 L9,5 L1,9", fill: "none", stroke: "context-stroke", "stroke-width": 1.5 }))));
    var tEls = [];
    function key(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
    var pair = {}; s.transitions.forEach(function (t) { var k = key(t.from, t.to); pair[k] = (pair[k] || 0) + 1; });
    var seen = {};
    function clip(c, o) { var dx = o[0] - c[0], dy = o[1] - c[1], sx = dx ? (BW / 2 + 3) / Math.abs(dx) : 1e9, sy = dy ? (BH / 2 + 3) / Math.abs(dy) : 1e9, k = Math.min(sx, sy); return [c[0] + dx * k, c[1] + dy * k]; }
    s.transitions.forEach(function (t) {
      var a = by[t.from], b = by[t.to], d, lx, ly, anchor = "middle";
      if (!a || !b) { fail("transition to unknown state " + t.from + "->" + t.to); return; }
      if (a === b) {
        var x = a._x + BW / 2; d = "M" + (x - 18) + "," + a._y + " C" + (x - 30) + "," + (a._y - 38) + " " + (x + 30) + "," + (a._y - 38) + " " + (x + 18) + "," + a._y; lx = x; ly = a._y - 34;
      } else {
        var ac = [a._x + BW / 2, a._y + BH / 2], bc = [b._x + BW / 2, b._y + BH / 2], dx = bc[0] - ac[0], dy = bc[1] - ac[1];
        var k = key(t.from, t.to), idx = seen[k] = (seen[k] || 0) + 1;
        var bend = t.bend != null ? t.bend : pair[k] > 1 ? (idx === 1 ? 1 : -1) * 22 : 0;
        var len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, mx = (ac[0] + bc[0]) / 2, my = (ac[1] + bc[1]) / 2;
        var ctrl = [mx + nx * bend * 2, my + ny * bend * 2];
        var p1 = clip(ac, ctrl), p2 = clip(bc, ctrl);
        d = bend ? "M" + p1[0] + "," + p1[1] + " Q" + ctrl[0] + "," + ctrl[1] + " " + p2[0] + "," + p2[1] : "M" + p1[0] + "," + p1[1] + " L" + p2[0] + "," + p2[1];
        var out = bend ? (bend > 0 ? 1 : -1) : -1, apx = mx + nx * bend, apy = my + ny * bend;
        if (Math.abs(dx) >= Math.abs(dy)) { lx = apx; ly = apy + (out > 0 ? 19 : -8); }
        else { lx = apx + out * 9; ly = apy + 4; anchor = out > 0 ? "start" : "end"; }
      }
      var path = h("path", { class: "tr", d: d, "marker-end": "url(#st-a)" });
      svg.appendChild(path); svg.appendChild(h("text", { class: "tl", x: lx, y: ly, "text-anchor": anchor }, t.event + (t.guard ? " [" + t.guard + "]" : "")));
      tEls.push({ path: path, t: t });
    });
    var nEls = {};
    st.forEach(function (x) {
      var g = h("g", { class: "stn" + (x.terminal ? " term" : "") }, h("rect", { class: "sb", x: x._x, y: x._y, width: BW, height: BH, rx: 22 }), h("text", { x: x._x + BW / 2, y: x._y + 27, "text-anchor": "middle" }, x.label || x.id));
      svg.appendChild(g); nEls[x.id] = g;
    });
    var curS = s.initial || st[0].id, logEl = h("div", { class: "grow" }), btns = h("div", { class: "ctl", style: "border-top:0;padding-top:0" });
    var log = [];
    function paint() {
      st.forEach(function (x) { var g = nEls[x.id]; g.setAttribute("class", "stn" + (x.terminal ? " term" : "") + (x.id === curS ? " cur" : "")); });
      tEls.forEach(function (e) { e.path.setAttribute("class", "tr" + (e.t.from === curS ? " live" : "")); });
      btns.innerHTML = "";
      var evs = s.transitions.filter(function (t) { return t.from === curS; });
      btns.appendChild(h("span", { style: "font:12px var(--mono);color:var(--mute)" }, "Fire an event:"));
      evs.forEach(function (t) { btns.appendChild(h("button", { class: "chip", title: t.note || "", onclick: function () { log.unshift(t.from + " --" + t.event + "--> " + t.to + (t.note ? "  // " + t.note : "")); curS = t.to; paint(); } }, t.event)); });
      if (!evs.length) btns.appendChild(h("span", { style: "color:var(--mute);font-size:14px" }, "Terminal state. No event leaves it."));
      logEl.textContent = log.length ? log[0] : (by[curS].note || "");
    }
    var reset = h("button", { class: "chip", onclick: function () { curS = s.initial || st[0].id; log = []; paint(); } }, "Reset");
    paint();
    return [paras(s.body || []), h("div", { class: "card", style: "padding:0" }, h("div", { class: "diagram" }, svg), btns, h("div", { class: "ctl" }, reset, logEl))];
  };

  // ----- LLD: scenario stepper (steps are produced by running real code at build time) -----
  builders.scenario = function (s) {
    var cur = 0, list = h("ol"), pane = h("div", { class: "pane" });
    var btns = s.steps.map(function (st, i) { var b = h("button", { onclick: function () { cur = i; paint(); } }, (i + 1) + ". " + st.title); list.appendChild(h("li", null, b)); return b; });
    function paint() {
      btns.forEach(function (b, i) { b.className = i === cur ? "on" : ""; });
      var st = s.steps[cur], prev = cur ? s.steps[cur - 1].state : {};
      pane.innerHTML = "";
      pane.appendChild(h("div", { class: "call" }, st.call));
      if (st.result != null) pane.appendChild(h("p", { html: "→ <code>" + esc(st.result) + "</code>" }));
      if (st.note) pane.appendChild(h("p", { html: md(st.note), style: "color:var(--mute)" }));
      var tb = h("table", { class: "kv" });
      Object.keys(st.state || {}).forEach(function (k) {
        var raw = st.state[k], v = typeof raw === "string" ? raw : JSON.stringify(raw), pv = typeof prev[k] === "string" ? prev[k] : JSON.stringify(prev[k]);
        tb.appendChild(h("tr", { class: cur && v !== pv ? "chg" : "" }, h("td", null, k), h("td", null, v)));
      });
      pane.appendChild(tb);
    }
    paint();
    return [paras(s.body || []), h("div", { class: "card steps", style: "padding:0" }, list, pane)];
  };

  // ----- code -----
  var KW = /\b(class|interface|enum|public|private|protected|static|final|abstract|extends|implements|return|if|else|for|while|new|this|self|def|fn|func|function|const|let|var|import|from|package|void|int|long|double|boolean|bool|string|String|None|null|true|false|True|False|throw|throws|try|catch|switch|case|break|continue|async|await|struct|type|impl|trait|pub|use|mut|lambda|and|or|not|in|is|with|as)\b/g;
  function hl(line) {
    var out = "", m, i = 0, re = /(\/\/.*|#.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;
    while ((m = re.exec(line))) {
      out += esc(line.slice(i, m.index)); i = re.lastIndex;
      if (m[1]) out += '<span class="tk-c">' + esc(m[1]) + "</span>";
      else if (m[2]) out += '<span class="tk-s">' + esc(m[2]) + "</span>";
      else if (m[3]) out += '<span class="tk-n">' + m[3] + "</span>";
      else { KW.lastIndex = 0; out += KW.test(m[4]) && m[4].length === m[0].length ? '<span class="tk-k">' + m[4] + "</span>" : esc(m[4]); }
    }
    return out + esc(line.slice(i));
  }
  builders.code = function (s) {
    var files = s.files, cur = 0, pre = h("pre", { class: "code" }), tabs = h("div", { class: "tabs" });
    var tb = files.map(function (f, i) { var b = h("button", { onclick: function () { cur = i; paint(); } }, f.name); tabs.appendChild(b); return b; });
    function paint() {
      tb.forEach(function (b, i) { b.className = i === cur ? "on" : ""; });
      pre.innerHTML = files[cur].src.replace(/\n$/, "").split("\n").map(function (l) { return '<span class="ln">' + hl(l) + "</span>"; }).join("");
    }
    paint();
    return [paras(s.body || []), h("div", { class: "card", style: "padding:0" }, tabs, pre)];
  };

  // ---------- page assembly ----------
  function build() {
    declareParams();
    for (var dk in S.p) DEFAULTS[dk] = S.p[dk];
    var root = document.getElementById("root"), secs = SPEC.sections || [];
    var toc = h("nav", { class: "toc" }, h("div", { class: "brand" }, SPEC.kind === "lld" ? "Low-level design" : "High-level design"));
    var main = h("main");
    var hero = h("header", { class: "hero" }, h("span", { class: "kind" }, SPEC.kind === "lld" ? "LLD" : "HLD"), h("h1", null, SPEC.title), SPEC.subtitle ? h("p", { class: "sub" }, SPEC.subtitle) : null,
      SPEC.idea ? h("div", { class: "idea" }, h("small", null, "The one idea"), SPEC.idea) : null);
    main.appendChild(hero);
    secs.forEach(function (s, i) {
      var b = builders[s.type];
      if (!b) { fail("unknown section type " + s.type); return; }
      s.id = s.id || "s" + i;
      toc.appendChild(h("a", { href: "#" + s.id, "data-id": s.id }, s.title || s.type));
      main.appendChild(h("section", { id: s.id }, h("h2", null, h("span", { class: "n" }, String(i + 1).padStart(2, "0")), s.title || s.type), s.lede ? h("p", { class: "lede", html: md(s.lede) }) : null, b(s)));
    });
    main.appendChild(h("footer", null, "Generated with sysdesign. Every number on this page is computed from the model in the page's own spec."));
    var theme = h("button", { onclick: function () { var d = document.documentElement; var t = d.dataset.theme === "dark" ? "light" : "dark"; d.dataset.theme = t; theme.textContent = t === "dark" ? "Light" : "Dark"; } }, "Dark");
    toc.appendChild(theme);
    root.appendChild(h("div", { class: "wrap" }, toc, main));
    document.title = SPEC.title + " | " + (SPEC.kind === "lld" ? "LLD" : "HLD");
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) { document.documentElement.dataset.theme = "dark"; theme.textContent = "Light"; }
    recompute();
    presetHooks.forEach(function (f) { f(); });
    if ("IntersectionObserver" in window) {
      var links = toc.querySelectorAll("a"), io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("on", a.dataset.id === e.target.id); }); });
      }, { rootMargin: "-20% 0px -70% 0px" });
      main.querySelectorAll("section").forEach(function (x) { io.observe(x); });
    }
    document.body.dataset.ready = "1";
  }
  window.addEventListener("error", function (e) { fail("js error: " + e.message); });
  try { build(); } catch (e) { fail("build: " + e.message + " " + (e.stack || "").split("\n")[1]); }
  window.__sysdesign = { S: S, simulate: simulate, val: val };
})();
