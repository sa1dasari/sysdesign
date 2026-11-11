#!/usr/bin/env node
// Usage: node scripts/make.mjs <spec.mjs> [--out page.html] [--shots dir] [--width 1280] [--no-check] [--no-open]
// One command for the whole loop: validate and build the page, check it in headless Chrome
// (presets, walkthroughs, charts, overflow), then open it in the default browser.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const args = process.argv.slice(2);
const spec = args.find((a, i) => !a.startsWith("--") && !["--shots", "--width", "--out"].includes(args[i - 1]));
if (!spec) { console.error("usage: make.mjs <spec.mjs> [--out page.html] [--shots dir] [--width 1280] [--no-check] [--no-open]"); process.exit(2); }

const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
const page = await build(spec, out); // exits with the list of problems if the spec is invalid
console.log("built  " + page);

let failed = false;
if (!args.includes("--no-check")) {
  const pass = ["--shots", "--width"].flatMap((k) => (args.includes(k) ? [k, args[args.indexOf(k) + 1]] : []));
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [join(here, "check.mjs"), page, ...pass], { stdio: "inherit" });
  if (r.status === 2) console.log("skip   checks: no Chrome found (set CHROME=/path/to/chrome to enable them)");
  else failed = r.status !== 0;
}

if (!args.includes("--no-open")) await openInBrowser(page);
process.exit(failed ? 1 : 0);

// Opens the page with the system's default handler, and reports honestly whether that worked:
// it waits for the launcher to start (or fail) before saying so. With no display (a server,
// a container) there is nothing to open, so it prints the path instead.
async function openInBrowser(file) {
  const target = resolve(file);
  const has = (bin) => spawnSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" }).status === 0;
  let cmd, cmdArgs;
  if (process.platform === "darwin") [cmd, cmdArgs] = ["open", [target]];
  else if (process.platform === "win32") [cmd, cmdArgs] = ["cmd", ["/c", "start", "", target]];
  else if (process.env.WSL_DISTRO_NAME) {
    if (has("wslview")) [cmd, cmdArgs] = ["wslview", [target]];
    else if (has("explorer.exe")) {
      const win = spawnSync("wslpath", ["-w", target], { encoding: "utf8" }).stdout?.trim();
      if (win) [cmd, cmdArgs] = ["explorer.exe", [win]];
    }
  } else if ((process.env.DISPLAY || process.env.WAYLAND_DISPLAY) && has("xdg-open")) [cmd, cmdArgs] = ["xdg-open", [target]];
  if (!cmd) { console.log("open   could not open a browser here. Open this file: " + target); return; }
  const ok = await new Promise((done) => {
    try {
      const p = spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" });
      p.once("spawn", () => { p.unref(); done(true); });
      p.once("error", () => done(false));
    } catch { done(false); }
  });
  console.log(ok ? "open   " + target : "open   could not launch a browser. Open this file: " + target);
}
