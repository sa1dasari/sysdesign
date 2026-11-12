import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "../scripts/build.mjs";

// ESM import ignores NODE_PATH; CJS resolution honours it, and Playwright may live there.
const { chromium } = createRequire(import.meta.url)("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSpec(spec, name = "spec") {
  const dir = mkdtempSync(join(tmpdir(), "sd-test-"));
  const specPath = join(dir, `${name}.mjs`);
  writeFileSync(specPath, "export default " + JSON.stringify(spec));
  return build(specPath, join(dir, `${name}.html`), { throwOnProblems: true });
}

export async function openPage(htmlPath, { width = 1280, reducedMotion = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  let page;
  try {
    page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => document.body.dataset.ready === "1" || document.body.dataset.error);
  } catch (e) { await browser.close(); throw e; }
  return {
    page,
    close: () => browser.close(),
    errors: () => page.evaluate(() => document.body.dataset.error || ""),
  };
}

export function runCheck(htmlPath, args = [], env = {}) {
  const r = spawnSync(process.execPath, [join(root, "scripts/check.mjs"), htmlPath, ...args], {
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, CHROME: process.env.CHROME || chromium.executablePath(), ...env },
  });
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
}
