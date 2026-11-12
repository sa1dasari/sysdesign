import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, runCheck } from "./helpers.mjs";
import { miniSpec } from "./fixture.mjs";

const run = async (spec, env) => runCheck(await buildSpec(spec), [], env);

test("false expect fails", async () => {
  const spec = miniSpec(); spec.sections[1].presets[1].expect = "=m.err < 0.01";
  const { code, out } = await run(spec);
  assert.equal(code, 1, out); assert.match(out, /expect .* is false/);
});

test("true expect passes", async () => {
  const spec = miniSpec(); spec.sections[1].presets[1].expect = "=m.err > 0.5";
  const { code, out } = await run(spec);
  assert.equal(code, 0, out);
});

test("n/a fails", async () => {
  const spec = miniSpec(); spec.sections[0].rows.push({ id: "bad", label: "Bad", expr: "=0/0" });
  const { code, out } = await run(spec);
  assert.equal(code, 1, out); assert.match(out, /show n\/a/);
});

test("missing picture arrow fails", async () => {
  const { code, out } = await run(miniSpec(), { SYSDESIGN_BREAK_PICTURE: "1" });
  assert.equal(code, 1, out); assert.match(out, /picture has 2 arrows for 3 hops/);
});

test("symbol carry does not falsely overflow", async () => {
  const spec = miniSpec(); spec.sections[1].flows[0].steps[1].carry = "▶ 2 new shows";
  const { code, out } = await run(spec);
  assert.equal(code, 0, out); assert.doesNotMatch(out, /overflows/);
});

test("long lane label widens the lane", async () => {
  const spec = miniSpec(); spec.sections[1].groups[0].note = "a note that is forty characters long ok";
  const { code, out } = await run(spec);
  assert.equal(code, 0, out); assert.doesNotMatch(out, /overflows/);
});
