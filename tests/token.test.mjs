import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, openPage } from "./helpers.mjs";
import { miniSpec } from "./fixture.mjs";

async function withPage(spec, fn, opts) {
  const { page, close, errors } = await openPage(await buildSpec(spec), opts);
  try { assert.equal(await errors(), ""); await fn(page); } finally { await close(); }
}
async function toStep(page, n) {
  await page.click("text=Open the page");
  for (let i = 0; i < n; i++) await page.click(".wctl >> text=Next");
}
const pos = (page) => page.$eval(".tok .tokdot", (d) => { const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

test("token per lit edge with carry label", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    assert.equal(await page.locator(".tok").count(), 1);
    assert.equal(await page.locator(".tok .toklabel").textContent(), "GET /home");
  });
});

test("one-box step shows no token", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 2);
    assert.equal(await page.locator(".tok").count(), 0);
  });
});

test("token direction follows path order", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 3);
    const tok = page.locator(".tok");
    assert.equal(await tok.getAttribute("data-from"), "api");
    assert.equal(await tok.getAttribute("data-to"), "app");
    await page.waitForTimeout(300); const a = await pos(page);
    await page.waitForTimeout(900); const b = await pos(page);
    assert.ok(b.x < a.x, `x should decrease: ${a.x} -> ${b.x}`);
  });
});

test("fallback label from text", async () => {
  const spec = miniSpec();
  delete spec.sections[1].flows[0].steps[0].carry;
  spec.sections[1].flows[0].steps[0].text = "Your app asks for the page";
  await withPage(spec, async (page) => {
    await toStep(page, 0);
    assert.equal(await page.locator(".tok .toklabel").textContent(), "Your app asks");
  });
});

test("tokens survive preset click", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 1);
    await page.click(".bar >> text=Normal");
    assert.equal(await page.locator(".tok").count(), 1);
    assert.equal(await page.locator(".tok .toklabel").textContent(), "lookup");
  });
});

test("reduced motion keeps the token still", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    await page.waitForTimeout(200); const a = await pos(page);
    await page.waitForTimeout(800); const b = await pos(page);
    assert.ok(Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);
  }, { reducedMotion: true });
});

test("exit removes tokens", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    await page.click(".wctl >> text=Exit");
    assert.equal(await page.locator(".tok").count(), 0);
  });
});

test("token label is dark on the light dark-theme accent, white on the light-theme accent", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    const fill = () => page.$eval(".tok .toklabel", (e) => getComputedStyle(e).fill);
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    assert.equal(await fill(), "rgb(255, 255, 255)");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    assert.notEqual(await fill(), "rgb(255, 255, 255)");
  });
});
