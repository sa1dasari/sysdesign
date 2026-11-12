import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, openPage, runCheck } from "./helpers.mjs";
import { miniSpec } from "./fixture.mjs";

test("mini spec builds and loads without errors", async () => {
  const html = await buildSpec(miniSpec());
  const { page, close, errors } = await openPage(html);
  try {
    await page.waitForSelector("body[data-ready='1']");
    assert.equal(await errors(), "");
    assert.equal(await page.locator(".sim .node").count(), 4);
  } finally { await close(); }
});

test("build throws instead of exiting on a bad spec", async () => {
  await assert.rejects(buildSpec({ title: "t" }), /kind must be/);
});

test("mini spec passes check.mjs cleanly", async () => {
  const { code, out } = runCheck(await buildSpec(miniSpec()), ["--width", "1280"]);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /FAIL|WARN/);
});
