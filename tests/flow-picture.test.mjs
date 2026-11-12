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
const lifelines = (page) => page.$$eval(".fpic .fl", (els) => els.map((e) => e.getAttribute("data-node")));

test("picture appears with the walkthrough", async () => {
  await withPage(miniSpec(), async (page) => {
    assert.equal(await page.locator(".fpic").isVisible(), false);
    await toStep(page, 0);
    assert.equal(await page.locator(".fpic").isVisible(), true);
  });
});

test("one arrow per hop", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    assert.equal(await page.locator(".fpic .fh:not(.note)").count(), 3);
    assert.equal(await page.locator(".fpic .fh.note").count(), 1);
  });
});

test("lifelines in first-appearance order", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    assert.deepEqual(await lifelines(page), ["app", "api", "cache"]);
  });
});

test("revisited box has one lifeline", async () => {
  const spec = miniSpec();
  spec.sections[1].flows[0].steps = [
    { path: ["app", "api"], text: "Ask." },
    { path: ["api", "app"], text: "Answer." },
  ];
  await withPage(spec, async (page) => {
    await toStep(page, 0);
    assert.equal(await page.locator(".fpic .fl").count(), 2);
    assert.equal(await page.locator(".fpic .fh:not(.note)").count(), 2);
  });
});

test("states follow the current step", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 2);
    const cls = (i) => page.locator(`.fpic .fh[data-step="${i}"]`).first().getAttribute("class");
    assert.match(await cls(0), /\bdone\b/);
    assert.match(await cls(1), /\bdone\b/);
    assert.match(await cls(2), /\bcur\b/);
    assert.match(await cls(3), /\btodo\b/);
  });
});

test("clicking a step jumps to it", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    await page.click('.fpic .fh[data-step="3"]');
    assert.equal(await page.locator(".wcount").textContent(), "Step 4 of 4");
    assert.equal(await page.locator('.tok').getAttribute("data-to"), "app");
  });
});

test("wide picture scrolls current step into view", async () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const spec = miniSpec({
    nodes: ids.map((id, i) => ({ id, label: id.toUpperCase(), group: "front", col: i, row: 0, ...(i === 0 ? { kind: "clients", rps: "=r.rps" } : {}), instances: 1, cap: 100, ms: 1, role: "r", why: "w" })),
    edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
    flows: [{ label: "Open the page", steps: ids.slice(1).map((id, i) => ({ path: [ids[i], id], text: "Hop " + (i + 1) + "." })) }],
    presets: [{ label: "Normal", set: {}, note: "n" }], controls: [],
  });
  await withPage(spec, async (page) => {
    await toStep(page, 5);
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const c = document.querySelector(".fpic").getBoundingClientRect(), b = document.querySelector(".fpic .fh.cur").getBoundingClientRect();
      return { cl: c.left, cr: c.right, bl: b.left, br: b.right };
    });
    assert.ok(r.bl >= r.cl - 1 && r.br <= r.cr + 1, JSON.stringify(r));
  }, { width: 390 });
});

test("flowPicture:false hides it", async () => {
  await withPage(miniSpec({ flowPicture: false }), async (page) => {
    await toStep(page, 1);
    assert.equal(await page.locator(".fpic").isVisible(), false);
  });
});

test("picture has a text alternative", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 0);
    const label = await page.locator(".fpic svg").first().getAttribute("aria-label");
    let at = -1;
    for (const t of ["The app asks the API for the home page.", "The API looks in the cache.", "The API builds the page.", "The page goes back to the app."]) {
      const i = label.indexOf(t); assert.ok(i > at, t + " in " + label); at = i;
    }
  });
});

test("arrow markers have unique ids and the current arrow uses the accent marker", async () => {
  await withPage(miniSpec(), async (page) => {
    await toStep(page, 1);
    const r = await page.evaluate(() => {
      const ids = [...document.querySelectorAll(".fpic marker")].map((m) => m.id);
      const accent = document.querySelector(".fpic marker .fpmkcur").parentNode.id;
      const all = [...document.querySelectorAll("[id]")].map((e) => e.id);
      return { ids, accent, dup: all.length - new Set(all).size, cur: document.querySelector(".fpic .fh.cur .fharrow").getAttribute("marker-end"), todo: document.querySelector(".fpic .fh.todo .fharrow").getAttribute("marker-end") };
    });
    assert.equal(r.dup, 0);
    assert.equal(new Set(r.ids).size, 2);
    assert.equal(r.cur, `url(#${r.accent})`);
    assert.notEqual(r.todo, r.cur);
  });
});
