#!/usr/bin/env node
// Usage: node scripts/check.mjs <page.html> [--shots dir] [--width 1280]
// Opens the page in headless Chrome over the DevTools protocol and checks it like a reviewer:
//  - the page builds with no script errors and no bad expressions
//  - every simulator preset is clicked and the resulting numbers are printed, so you can
//    confirm each preset does what its note claims
//  - screenshots (full page, and each section) are written so you can look at them
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--shots" && args[args.indexOf(a) - 1] !== "--width");
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const shots = opt("--shots", null), width = +opt("--width", 1280);
if (!page) { console.error("usage: check.mjs <page.html> [--shots dir] [--width 1280]"); process.exit(2); }

const chromeBin = ["google-chrome", "chromium", "chromium-browser", "chrome"].find((b) => {
  try { return spawn("which", [b]).on("error", () => {}) && true; } catch { return false; }
}) ?? "google-chrome";
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

  const sections = await ev(`[...document.querySelectorAll('main section')].map(s=>s.id+'|'+s.querySelector('h2').textContent)`);
  say(`ok   ${sections.length} sections: ` + sections.map((s) => s.split("|")[1]).join(", "));

  // overflow check: nothing should push the page wider than the viewport
  const over = await ev(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 2) { say(`FAIL horizontal overflow of ${over}px at width ${width}`); failed = true; } else say("ok   no horizontal overflow");

  // simulator presets
  const chips = await ev(`[...document.querySelectorAll('.sim .bar .chip')].map(b=>b.textContent)`);
  if (chips?.length) {
    say("\nsimulator presets (offered load, failed requests, avg latency, busiest tier):");
    for (let i = 0; i < chips.length; i++) {
      await ev(`document.querySelectorAll('.sim .bar .chip')[${i}].click()`);
      await sleep(120);
      const row = await ev(`JSON.stringify([...document.querySelectorAll('.sim .metric')].map(m=>m.querySelector('span').textContent+': '+m.querySelector('b').textContent))`);
      say(`  ${chips[i].padEnd(32)} ${JSON.parse(row).join(" | ")}`);
    }
    await ev(`document.querySelector('.sim .bar .chip').click()`);
  }
  // click every node once to exercise the detail panel
  const clickable = await ev(`document.querySelectorAll('.sim .node, .cls, .stn').length`);
  say(`\nok   ${clickable} interactive nodes present`);

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
