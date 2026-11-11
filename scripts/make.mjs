#!/usr/bin/env node
// Usage: node scripts/make.mjs <spec.mjs> [--shots dir] [--width 1280] [--no-check] [--no-open]
// One command for the whole loop: validate and build the page, check it in headless Chrome
// (presets, walkthroughs, charts, overflow), then open it in the default browser.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const args = process.argv.slice(2);
const spec = args.find((a, i) => !a.startsWith("--") && !["--shots", "--width"].includes(args[i - 1]));
if (!spec) { console.error("usage: make.mjs <spec.mjs> [--shots dir] [--width 1280] [--no-check] [--no-open]"); process.exit(2); }

const page = await build(spec); // exits with the list of problems if the spec is invalid
console.log("built  " + page);

let failed = false;
if (!args.includes("--no-check")) {
  const pass = ["--shots", "--width"].flatMap((k) => (args.includes(k) ? [k, args[args.indexOf(k) + 1]] : []));
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [join(here, "check.mjs"), page, ...pass], { stdio: "inherit" });
  if (r.status === 2) console.log("skip   checks: no Chrome found (set CHROME=/path/to/chrome to enable them)");
  else failed = r.status !== 0;
}

if (!args.includes("--no-open")) openInBrowser(page);
process.exit(failed ? 1 : 0);

// Opens the page with the system's default handler. On a machine with no display
// (a server, a container) there is nothing to open, so it prints the path instead.
function openInBrowser(file) {
  const target = resolve(file);
  let cmd, cmdArgs;
  if (process.platform === "darwin") [cmd, cmdArgs] = ["open", [target]];
  else if (process.platform === "win32") [cmd, cmdArgs] = ["cmd", ["/c", "start", "", target]];
  else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.env.WSL_DISTRO_NAME) [cmd, cmdArgs] = [process.env.WSL_DISTRO_NAME ? "wslview" : "xdg-open", [target]];
  if (!cmd) { console.log("open   no display here. Open this file in a browser: " + target); return; }
  try {
    const p = spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" });
    p.on("error", () => console.log("open   could not launch a browser. Open this file: " + target));
    p.unref();
    console.log("open   " + target);
  } catch { console.log("open   could not launch a browser. Open this file: " + target); }
}
