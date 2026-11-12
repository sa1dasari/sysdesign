import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec, openPage } from "./helpers.mjs";
import { miniSpec } from "./fixture.mjs";

async function withPage(spec, fn) {
  const { page, close, errors } = await openPage(await buildSpec(spec));
  try { assert.equal(await errors(), ""); await fn(page); } finally { await close(); }
}
const nodeOf = (page, label) => page.locator(`.sim .node[aria-label="${label}"]`);

test("default icons follow kind", async () => {
  await withPage(miniSpec(), async (page) => {
    const hrefs = await page.$$eval(".sim .node .ico", (els) => els.map((e) => e.getAttribute("href")));
    assert.deepEqual(hrefs, ["#ico-phone", "#ico-server", "#ico-cache", "#ico-database"]);
  });
});

test("icon override wins", async () => {
  const spec = miniSpec();
  spec.sections[1].nodes[1].icon = "worker";
  await withPage(spec, async (page) => {
    assert.equal(await nodeOf(page, "API").locator(".ico").getAttribute("href"), "#ico-worker");
  });
});

test("long label wraps, never truncates", async () => {
  const spec = miniSpec();
  spec.sections[1].nodes[1].label = "Celebrity cache service";
  await withPage(spec, async (page) => {
    const nl = nodeOf(page, "Celebrity cache service").locator(".nl");
    const parts = await nl.locator("tspan").allTextContents();
    assert.equal(parts.length, 2);
    assert.equal(parts.join(" "), "Celebrity cache service");
    const w = await nl.evaluate((e) => e.getBBox().width);
    assert.ok(w <= 152 - 44 - 4, "label width " + w);
  });
});

test("no tint below 75%", async () => {
  await withPage(miniSpec(), async (page) => {
    await page.click("text=Normal");
    const u = await nodeOf(page, "API").locator("rect.box").evaluate((e) => getComputedStyle(e).getPropertyValue("--u").trim());
    assert.equal(Number(u), 0);
  });
});

test("dead node panel says down", async () => {
  await withPage(miniSpec(), async (page) => {
    await page.click("text=Kill api");
    await nodeOf(page, "API").click();
    const t = await page.locator(".detail").innerText();
    assert.match(t, /down/);
    assert.doesNotMatch(t, /900%/);
  });
});
