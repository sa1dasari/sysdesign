#!/usr/bin/env node
// Usage: node scripts/build.mjs <spec.mjs> [--out page.html]
// Loads a spec module (default export, or `spec`), validates it, and writes one
// self-contained HTML page next to the spec (or to --out).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate, lint } from "./validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function build(specPath, outPath, opts = {}) {
  const mod = await import(pathToFileURL(resolve(specPath)).href);
  const spec = mod.default ?? mod.spec;
  if (!spec) throw new Error(`${specPath} must export a spec (default export)`);
  const problems = validate(spec);
  if (problems.length && opts.throwOnProblems) {
    throw new Error(`spec problems in ${specPath}:\n  - ` + problems.join("\n  - "));
  }
  if (problems.length) {
    console.error(`spec problems in ${specPath}:\n  - ` + problems.join("\n  - "));
    process.exit(1);
  }
  for (const w of lint(spec)) console.log("warn   " + w);
  const css = readFileSync(join(root, "kit/style.css"), "utf8");
  const js = readFileSync(join(root, "kit/runtime.js"), "utf8");
  const json = JSON.stringify(spec).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${String(spec.title).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
<style>${css}</style></head>
<body><div id="root"></div>
<script id="spec" type="application/json">${json}</script>
<script>${js}</script></body></html>
`;
  const out = outPath ?? join(dirname(resolve(specPath)), "index.html");
  writeFileSync(out, html);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const spec = args.find((a) => !a.startsWith("--"));
  const oi = args.indexOf("--out");
  if (!spec) { console.error("usage: build.mjs <spec.mjs> [--out page.html]"); process.exit(2); }
  const out = await build(spec, oi >= 0 ? args[oi + 1] : undefined);
  console.log("wrote " + out);
}
