#!/usr/bin/env node
// Usage: node scripts/check.mjs <page.html> [--shots dir] [--width 1280]
// Opens the page in headless Chrome over the DevTools protocol and checks it like a reviewer:
//  - the page builds with no script errors and no bad expressions
//  - every preset is clicked, its numbers are printed and checked (errors, NaN, impossible
//    failure rates, an unhealthy baseline, presets that change nothing)
//  - every preset's `expect` must hold; nothing may show "n/a"; no label may overflow its box
//  - every walkthrough step is played, shows a token and is pictured; every chart line must be drawable
//  - with --shots, screenshots (full page in both themes, and each section) are written
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--shots" && args[args.indexOf(a) - 1] !== "--width");
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const shots = opt("--shots", null), width = +opt("--width", 1280);
if (!page) { console.error("usage: check.mjs <page.html> [--shots dir] [--width 1280]"); process.exit(2); }

// Use $CHROME if set, else the first Chrome, Chromium or Edge found on PATH or in its usual
// install location on macOS and Windows. Exit code 2 means "no browser", which make.mjs reports
// as skipped checks rather than a failure.
const onPath = (b) => { try { execFileSync(process.platform === "win32" ? "where" : "which", [b], { stdio: "ignore" }); return true; } catch { return false; } };
const pf = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
const known = process.platform === "darwin"
  ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
  : process.platform === "win32"
    ? pf.flatMap((d) => [join(d, "Google/Chrome/Application/chrome.exe"), join(d, "Microsoft/Edge/Application/msedge.exe")])
    : [];
const chromeBin = process.env.CHROME
  || ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "microsoft-edge"].find(onPath)
  || known.find((f) => existsSync(f));
if (!chromeBin) { console.error("no Chrome, Chromium or Edge found. Set CHROME=/path/to/chrome"); process.exit(2); }
if (process.env.CHROME && !existsSync(process.env.CHROME) && !onPath(process.env.CHROME)) { console.error(`CHROME=${process.env.CHROME} does not exist`); process.exit(2); }

// Port 0 lets Chrome pick a free port; it writes the port it chose to DevToolsActivePort.
const profile = mkdtempSync(join(tmpdir(), "sd-chrome-"));
const proc = spawn(chromeBin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, `--window-size=${width},900`, "about:blank"], { stdio: "ignore" });
let launchError = null;
proc.on("error", (e) => { launchError = e; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cleanup() {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
  for (let i = 0; i < 5; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch {} }
}

async function connect() {
  for (let i = 0; i < 75; i++) {
    if (launchError) throw new Error(`could not start ${chromeBin}: ${launchError.message}`);
    try {
      const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("could not reach Chrome");
}
let ws = null, id = 0;
const pending = new Map();
// Every DevTools call times out, so a stuck browser fails the check instead of hanging it.
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); rej(new Error(`Chrome did not answer ${method} within 20 s`)); }, 20000);
  pending.set(i, (d) => { clearTimeout(timer); res(d); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
const pageErrors = () => ev("document.body.dataset.error || ''");

let failed = false;
const say = (s) => console.log(s);
try {
  ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not open the DevTools socket")); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await send("Page.enable");
  // Test hook (tests/check.test.mjs): the runtime drops one picture arrow when this is set before load.
  if (process.env.SYSDESIGN_BREAK_PICTURE) await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__sysdesign_test={breakPicture:true}" });
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Page.navigate", { url: pathToFileURL(resolve(page)).href });
  for (let i = 0; i < 40 && !(await ev("document.body && document.body.dataset.ready")); i++) await sleep(150);
  const err = await ev("document.body.dataset.error || ''");
  if (!(await ev("document.body.dataset.ready"))) { say("FAIL page never became ready. " + err); failed = true; }
  else if (err) { say("FAIL page reported errors: " + err); failed = true; }
  else say("ok   page built, no script errors");

  const sections = await ev(`[...document.querySelectorAll('main section')].map(s=>s.id+'|'+s.querySelector('h2').lastChild.textContent)`);
  say(`ok   ${sections.length} sections: ` + sections.map((s) => s.split("|")[1]).join(", "));

  // overflow check: nothing should push the page wider than the viewport
  const over = await ev(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 2) { say(`FAIL horizontal overflow of ${over}px at width ${width}`); failed = true; } else say("ok   no horizontal overflow");

  // labels: text must stay inside the box, lane, token or picture that holds it
  const boxOver = await ev(`(()=>{const bad=[];
    document.querySelectorAll('.sim .node').forEach(g=>{const l=g.querySelector('.nl'),b=g.querySelector('.box');if(!l||!b)return;const a=l.getBBox(),c=b.getBBox();if(a.x+a.width>c.x+c.width+0.5||a.x<c.x-0.5)bad.push(l.textContent)});
    document.querySelectorAll('.sim .lanel').forEach(t=>{const r=t.previousSibling,a=t.getBBox(),c=r.getBBox();if(a.x+a.width>c.x+c.width+0.5)bad.push(t.textContent.trim())});
    return bad})()`);
  for (const t of boxOver ?? []) { say(`FAIL label "${t}" overflows its box`); failed = true; }
  const naCount = () => ev(`document.querySelectorAll('[data-na]').length`);
  const naBase = await naCount();
  if (naBase) { say(`FAIL ${naBase} value(s) show n/a`); failed = true; }

  // presets: click each one, print its numbers, and check them. A preset that breaks an
  // expression, shows NaN, or a failure rate outside 0..100% fails the check. The first preset
  // is the baseline and should be healthy; a preset that changes nothing gets a warning.
  const chips = await ev(`[...document.querySelectorAll('.sim .bar:not(.flows) .chip')].map(b=>b.textContent)`);
  const expects = await ev(`(JSON.parse(document.getElementById('spec').textContent).sections.find(s=>s.type==='arch')||{presets:[]}).presets.map(p=>[p.label,p.expect||''])`);
  const budget = await ev(`(JSON.parse(document.getElementById('spec').textContent).sections.find(s=>s.type==='arch')||{}).latencyBudget||0`);
  if (chips?.length) {
    say("\npresets (offered load, failed requests, avg latency, busiest part, custom metrics):");
    const seen = [];
    for (let i = 0; i < chips.length; i++) {
      await ev(`document.querySelectorAll('.sim .bar:not(.flows) .chip')[${i}].click()`);
      await sleep(120);
      const row = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.sim .metric')].map(m=>m.querySelector('span').textContent+': '+m.querySelector('b').textContent))`));
      const sim = await ev(`(()=>{const m=window.__sysdesign.S.m;if(!m)return null;const b=m.bottleneck&&m.nodes[m.bottleneck];return {err:m.err,lat:m.lat,util:b?b.util:0,dead:b?b.total===0:false}})()`);
      say(`  ${chips[i].padEnd(32)} ${row.join(" | ")}`);
      const errs = await pageErrors();
      if (errs) { say(`FAIL preset "${chips[i]}" breaks an expression: ${errs}`); failed = true; }
      const want = (expects ?? []).find((x) => x[0] === chips[i])?.[1];
      if (want && !(await ev(`!!window.__sysdesign.val(${JSON.stringify(want)})`))) { say(`FAIL preset "${chips[i]}" expect ${want} is false`); failed = true; }
      const na = await naCount();
      if (na > naBase) { say(`FAIL ${na} value(s) show n/a under preset "${chips[i]}"`); failed = true; }
      if (row.some((x) => /NaN|Infinity|undefined/.test(x))) { say(`FAIL preset "${chips[i]}" shows a value that is not a number`); failed = true; }
      if (sim && !(sim.err >= -1e-9 && sim.err <= 1 + 1e-9)) { say(`FAIL preset "${chips[i]}": failure rate ${(sim.err * 100).toFixed(1)}% is outside 0..100%. A cache's routes onward must carry only misses (see spec-format.md)`); failed = true; }
      if (i === 0 && sim) {
        if (sim.err > 0.001) say(`WARN baseline "${chips[0]}" already fails ${(sim.err * 100).toFixed(2)}% of requests. The first preset should be healthy`);
        if (sim.util > 0.8 && !sim.dead) say(`WARN baseline "${chips[0]}" has its busiest part at ${Math.round(sim.util * 100)}%. Size it to about 60 to 75%`);
        if (budget && sim.lat > budget) say(`WARN baseline "${chips[0]}" latency ${Math.round(sim.lat)} ms is over the ${budget} ms budget`);
      }
      const key = row.join("|"), same = seen.findIndex((k) => k === key);
      if (same >= 0) say(`WARN preset "${chips[i]}" shows exactly the same numbers as "${chips[same]}". Check that it changes something its note talks about`);
      seen.push(key);
    }
    await ev(`document.querySelector('.sim .bar:not(.flows) .chip').click()`);
  }
  // walkthroughs: play every step of every flow; each step must light up at least one box
  const flows = await ev(`[...document.querySelectorAll('.sim .bar.flows .chip')].map(b=>b.textContent)`);
  if (flows?.length) say("");
  const specFlows = await ev(`(JSON.parse(document.getElementById('spec').textContent).sections.find(s=>s.type==='arch')||{}).flows||[]`);
  const picOn = await ev(`(JSON.parse(document.getElementById('spec').textContent).sections.find(s=>s.type==='arch')||{}).flowPicture!==false`);
  for (let i = 0; i < (flows ?? []).length; i++) {
    const sf = specFlows[i]?.steps ?? [];
    const hops = sf.reduce((n, st) => n + Math.max(0, (st.path ?? []).length - 1), 0);
    const r = await ev(`(()=>{const b=document.querySelectorAll('.sim .bar.flows .chip')[${i}];b.click();const out=[],over=[];
      const inside=(el,box)=>{const a=el.getBoundingClientRect();return a.left>=box.left-1&&a.right<=box.right+1&&a.top>=box.top-1&&a.bottom<=box.bottom+1};
      const svg=document.querySelector('.sim .stage svg');
      const pic={arrows:document.querySelectorAll('.fpic .fharrow').length,shown:!!document.querySelector('.fpic svg')&&getComputedStyle(document.querySelector('.fpic')).display!=='none',over:[]};
      if(pic.shown){const sb=document.querySelector('.fpic svg').getBoundingClientRect();document.querySelectorAll('.fpic text').forEach(t=>{if(!inside(t,sb))pic.over.push(t.textContent)})}
      for(let k=0;k<50;k++){const lit=document.querySelectorAll('.sim .node.hl').length,txt=document.querySelector('.walk .wtext').textContent;
        const toks=document.querySelectorAll('.sim .tok').length;out.push(lit+':'+(txt?1:0)+':'+toks);
        const sb=svg.getBoundingClientRect();document.querySelectorAll('.sim .tok .tokpill, .sim .tok .toklabel').forEach(t=>{if(!inside(t,sb))over.push(t.textContent||'pill')});
        const next=[...document.querySelectorAll('.walk .chip')].find(x=>x.textContent==='Next'||x.textContent==='Done');if(next.textContent==='Done'){next.click();break;}next.click();}
      return {out,over,pic};})()`);
    const dark = r.out.filter((x) => x.startsWith("0:") || x.split(":")[1] === "0").length;
    const werr = await pageErrors();
    if (werr) { say(`FAIL walkthrough "${flows[i]}" breaks something: ${werr}`); failed = true; }
    if (dark) { say(`FAIL walkthrough "${flows[i]}": ${dark} of ${r.out.length} steps light nothing or have no text`); failed = true; }
    sf.forEach((st, k) => { if ((st.path ?? []).length >= 2 && r.out[k] && r.out[k].split(":")[2] === "0") { say(`FAIL walkthrough "${flows[i]}" step ${k + 1} has no token`); failed = true; } });
    for (const t of new Set(r.over)) { say(`FAIL label "${t}" overflows its box (token travelling in walkthrough "${flows[i]}")`); failed = true; }
    if (picOn) {
      if (!r.pic.shown) { say(`FAIL walkthrough "${flows[i]}" shows no picture`); failed = true; }
      else {
        if (r.pic.arrows !== hops) { say(`FAIL walkthrough "${flows[i]}" picture has ${r.pic.arrows} arrows for ${hops} hops`); failed = true; }
        for (const t of new Set(r.pic.over)) { say(`FAIL label "${t}" overflows its box (picture of walkthrough "${flows[i]}")`); failed = true; }
      }
    }
    if (!dark) say(`ok   walkthrough "${flows[i]}": ${r.out.length} steps, ${picOn ? hops : 0} hops pictured`);
  }
  // click every node once to exercise the detail panel
  const clickable = await ev(`document.querySelectorAll('.sim .node, .cls, .stn').length`);
  say(`\nok   ${clickable} interactive nodes present`);
  const panelNa = await ev(`(()=>{let n=0;document.querySelectorAll('.sim .node').forEach(g=>{g.dispatchEvent(new MouseEvent('click',{bubbles:true}));n+=document.querySelectorAll('.sim .detail [data-na]').length;g.dispatchEvent(new MouseEvent('click',{bubbles:true}))});return n})()`);
  if (panelNa) { say(`FAIL ${panelNa} value(s) show n/a in the click panel`); failed = true; }

  // charts: every line must be drawn from finite numbers; print each chart's live readout
  const charts = await ev(`[...document.querySelectorAll('.viz')].map(c=>({t:c.closest('section').querySelector('h2').lastChild.textContent,
    lines:c.querySelectorAll('path.cs').length, bad:[...c.querySelectorAll('path.cs')].filter(p=>/NaN|Infinity|^M0,0$/.test(p.getAttribute('d'))).length,
    marker:(c.querySelector('.cmt')||{}).textContent||'', legend:[...c.querySelectorAll('.legend span')].map(s=>[...s.childNodes].map(n=>n.textContent).filter(Boolean).join(' ')).join(' | ')}))`);
  for (const c of charts ?? []) {
    if (c.bad) { say(`FAIL chart "${c.t}": ${c.bad} of ${c.lines} lines have no drawable points`); failed = true; }
    else say(`ok   chart "${c.t}": ${c.lines} line(s)${c.marker ? ", marker " + c.marker : ""}${c.legend ? ". " + c.legend : ""}`);
  }

  if (shots) {
    mkdirSync(shots, { recursive: true });
    const H = await ev("document.documentElement.scrollHeight");
    for (const theme of ["light", "dark"]) {
      await ev(`document.documentElement.dataset.theme='${theme}'`);
      await sleep(150);
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: H, scale: 1 } });
      writeFileSync(join(shots, `full-${theme}.png`), Buffer.from(r.result.data, "base64"));
    }
    await ev(`document.documentElement.dataset.theme='light'`);
    const ids = await ev(`[...document.querySelectorAll('main section')].map(s=>s.id)`);
    for (const sid of ids) {
      const box = await ev(`(()=>{const r=document.getElementById('${sid}').getBoundingClientRect();return {x:0,y:r.top+scrollY,w:innerWidth,h:r.height}})()`);
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
      writeFileSync(join(shots, `${sid}.png`), Buffer.from(r.result.data, "base64"));
    }
    say(`ok   screenshots written to ${shots} (full-light, full-dark, one per section)`);
  }
} catch (e) { say("FAIL " + (e.message || e)); failed = true; }
finally { cleanup(); }
process.exit(failed ? 1 : 0);
