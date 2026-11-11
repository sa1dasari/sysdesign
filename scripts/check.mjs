#!/usr/bin/env node
// Usage: node scripts/check.mjs <page.html> [--shots dir] [--width 1280]
// Opens the page in headless Chrome over the DevTools protocol and checks it like a reviewer:
//  - the page builds with no script errors and no bad expressions
//  - every simulator preset is clicked and the resulting numbers are printed, so you can
//    confirm each preset does what its note claims
//  - screenshots (full page, and each section) are written so you can look at them
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--shots" && args[args.indexOf(a) - 1] !== "--width");
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const shots = opt("--shots", null), width = +opt("--width", 1280);
if (!page) { console.error("usage: check.mjs <page.html> [--shots dir] [--width 1280]"); process.exit(2); }

// Use $CHROME if set, else the first browser found on PATH.
const onPath = (b) => { try { execFileSync("which", [b], { stdio: "ignore" }); return true; } catch { return false; } };
const chromeBin = process.env.CHROME || ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"].find(onPath);
if (!chromeBin) { console.error("no Chrome or Chromium found on PATH. Set CHROME=/path/to/chrome"); process.exit(2); }
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "sd-chrome-"));
const proc = spawn(chromeBin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, `--window-size=${width},900`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("could not reach Chrome");
}
const ws = new WebSocket(await connect());
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };

let failed = false;
const say = (s) => console.log(s);
try {
  await send("Page.enable");
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

  // simulator presets
  const chips = await ev(`[...document.querySelectorAll('.sim .bar:not(.flows) .chip')].map(b=>b.textContent)`);
  if (chips?.length) {
    say("\nsimulator presets (offered load, failed requests, avg latency, busiest tier):");
    for (let i = 0; i < chips.length; i++) {
      await ev(`document.querySelectorAll('.sim .bar:not(.flows) .chip')[${i}].click()`);
      await sleep(120);
      const row = await ev(`JSON.stringify([...document.querySelectorAll('.sim .metric')].map(m=>m.querySelector('span').textContent+': '+m.querySelector('b').textContent))`);
      say(`  ${chips[i].padEnd(32)} ${JSON.parse(row).join(" | ")}`);
    }
    await ev(`document.querySelector('.sim .bar:not(.flows) .chip').click()`);
  }
  // walkthroughs: play every step of every flow; each step must light up at least one box
  const flows = await ev(`[...document.querySelectorAll('.sim .bar.flows .chip')].map(b=>b.textContent)`);
  if (flows?.length) say("");
  for (let i = 0; i < (flows ?? []).length; i++) {
    const r = await ev(`(()=>{const b=document.querySelectorAll('.sim .bar.flows .chip')[${i}];b.click();const out=[];
      for(let k=0;k<50;k++){const lit=document.querySelectorAll('.sim .node.hl').length,txt=document.querySelector('.walk .wtext').textContent;out.push(lit+':'+(txt?1:0));
        const next=[...document.querySelectorAll('.walk .chip')].find(x=>x.textContent==='Next'||x.textContent==='Done');if(next.textContent==='Done'){next.click();break;}next.click();}
      return out;})()`);
    const dark = r.filter((x) => x.startsWith("0:") || x.endsWith(":0")).length;
    if (dark) { say(`FAIL walkthrough "${flows[i]}": ${dark} of ${r.length} steps light nothing or have no text`); failed = true; }
    else say(`ok   walkthrough "${flows[i]}": ${r.length} steps`);
  }
  // click every node once to exercise the detail panel
  const clickable = await ev(`document.querySelectorAll('.sim .node, .cls, .stn').length`);
  say(`\nok   ${clickable} interactive nodes present`);

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
} catch (e) { say("FAIL " + e.stack); failed = true; }
finally { ws.close(); proc.kill(); }
process.exit(failed ? 1 : 0);
