import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const build = await readFile(new URL("../scripts/build-data.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/js/app.js", import.meta.url), "utf8");

test("OSM economic extraction excludes clearly non-economic features", () => {
  const selectorBlock = build.match(/const selectors = \[([\s\S]*?)\];/)?.[1] ?? "";
  for (const forbidden of ["park", "playground", "pitch", "garden", "nature_reserve", "bicycle_parking", "townhall", "police", "fire_station", "library", "community_centre"]) {
    assert.doesNotMatch(selectorBlock, new RegExp("\\b" + forbidden + "\\b"), forbidden);
  }
});

test("Overpass requests have a bounded timeout", () => {
  assert.match(build, /AbortSignal\.timeout\(/);
});

test("500 m grid is constructed in ETRS89 UTM 31N", () => {
  assert.match(build, /EPSG:25831/);
  assert.match(build, /proj4\(/);
});

test("viewer exposes an accessible 2D/3D switch", () => {
  assert.match(html, /id="map-dimension"/);
  assert.match(html, /aria-label="Modo de mapa"/);
  assert.match(html, /data-dimension="2d"/);
  assert.match(html, /data-dimension="3d"/);
});

test("3D is lazy-loaded instead of blocking 2D", () => {
  assert.match(app, /import\("\.\/map3d\.js"\)/);
});

test("segmented view buttons declare button type", () => {
  const segments = [...html.matchAll(/<button[^>]*class="[^"]*\bsegment\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(segments.length >= 3);
  segments.forEach((tag) => assert.match(tag, /type="button"/));
});

test("dashboard exposes simple KPIs, category chart and temporal controls", () => {
  for (const id of ["metric-total", "metric-named", "metric-top-category", "category-chart", "history-chart", "year-slider", "year-value"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test("timeline end year follows the browser current year instead of a hard-coded 2026", () => {
  assert.match(app, /new Date\(\)\.getFullYear\(\)/);
  assert.match(app, /year-slider/);
});

test("historical snapshots are loaded separately from the current combined inventory", () => {
  assert.match(app, /history\/index\.json/);
  assert.match(app, /source_scope/);
});
