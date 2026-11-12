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

import { validate } from "../scripts/validate.mjs";
import { lint } from "../scripts/validate.mjs";

test("validate rejects unknown icon", () => {
  const spec = miniSpec(); spec.sections[1].nodes[1].icon = "rocket";
  assert.ok(validate(spec).some((e) => /icon "rocket".*phone, browser/.test(e)));
});

test("validate rejects long carry", () => {
  const spec = miniSpec(); spec.sections[1].flows[0].steps[0].carry = "x".repeat(17);
  assert.ok(validate(spec).some((e) => /at most 16/.test(e)));
});

test("validate rejects bad flowPicture and expect", () => {
  const spec = miniSpec({ flowPicture: "no" }); spec.sections[1].presets[1].expect = "m.err";
  const bad = validate(spec);
  assert.ok(bad.some((e) => /flowPicture/.test(e)));
  assert.ok(bad.some((e) => /expect/.test(e)));
});

test("lint warns on missing carry", () => {
  assert.equal(lint(miniSpec()).length, 0);
  const spec = miniSpec(); delete spec.sections[1].flows[0].steps[0].carry;
  const w = lint(spec);
  assert.equal(w.length, 1);
  assert.match(w[0], /step 1 has no carry; using "/);
});
