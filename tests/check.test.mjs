import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, openPage, runCheck } from "./helpers.mjs";
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
  const spec = miniSpec(); spec.sections[1].groups[0].note = "a note that is much longer than the two boxes of this lane could ever hold on their own, so the lane must grow";
  const html = await buildSpec(spec);
  const { code, out } = runCheck(html);
  assert.equal(code, 0, out); assert.doesNotMatch(out, /overflows/);
  const { page, close } = await openPage(html);
  try {
    const r = await page.evaluate(() => {
      const lane = document.querySelector(".sim .lane"), label = document.querySelector(".sim .lanel");
      const boxes = [...document.querySelectorAll(".sim .node .box")].slice(0, 2).map((b) => b.getBBox());
      const nodesW = Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)) + 28;
      const l = lane.getBBox(), t = label.getBBox();
      return { laneW: l.width, nodesW, fits: t.x + t.width <= l.x + l.width };
    });
    assert.ok(r.laneW > r.nodesW + 20, `lane ${r.laneW} should be wider than its nodes ${r.nodesW}`);
    assert.ok(r.fits, "lane label sits inside the lane");
  } finally { await close(); }
});

test("a NaN built-in metric still fails the check", async () => {
  const spec = miniSpec(); spec.sections[1].nodes[0].rps = "=1/0";
  const { code, out } = await run(spec);
  assert.equal(code, 1, out); assert.match(out, /Avg latency: NaN/); assert.match(out, /not a number/);
});
