import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examples = ["news-feed", "rate-limiter", "netflix-recommendations", "consistent-hashing", "parking-lot"];

for (const ex of examples) {
  for (const width of [1280, 390]) {
    test(`${ex} at ${width}: no FAIL, WARN or warn`, () => {
      const out = join(mkdtempSync(join(tmpdir(), "sd-ex-")), "index.html");
      const r = spawnSync(process.execPath, [join(root, "scripts/make.mjs"), join(root, "examples", ex, "spec.mjs"), "--no-open", "--width", String(width), "--out", out], {
        encoding: "utf8", timeout: 120000,
        env: { ...process.env, CHROME: process.env.CHROME || chromium.executablePath() },
      });
      const text = (r.stdout || "") + (r.stderr || "");
      assert.equal(r.status, 0, text);
      assert.doesNotMatch(text, /\bFAIL\b/, text);
      assert.doesNotMatch(text, /\bWARN\b/, text);
      assert.doesNotMatch(text, /\bwarn\b/, text);
    });
  }
}
