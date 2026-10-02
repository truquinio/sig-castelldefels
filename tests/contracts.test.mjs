import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const build = await readFile(new URL("../scripts/build-data.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/js/app.js", import.meta.url), "utf8");

test("OSM economic extraction excludes clearly non-economic features", () => {
  const selectorBlock = build.match(/const selectors = \[([\s\S]*?)\];/)?.[1] ?? "";
  for (const forbidden of ["park","playground","pitch","garden","nature_reserve","bicycle_parking","townhall","police","fire_station","library","community_centre"]) {
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

test("v0.5 uses establishment language instead of POI-centric product language", () => {
  assert.match(html, /Establecimientos observados/);
  assert.match(html, /establecimientos económicos/i);
  assert.doesNotMatch(html, /Visor operativo municipal/);
});

test("dashboard is reduced to four primary KPIs", () => {
  const cards = [...html.matchAll(/class="kpi-card"/g)];
  assert.equal(cards.length, 4);
  for (const id of ["metric-total","metric-named","metric-top-category","metric-hot-cell"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test("history is informative and no longer controlled by a misleading year slider", () => {
  assert.match(html, /id="history-chart"/);
  assert.doesNotMatch(html, /id="year-slider"/);
  assert.doesNotMatch(app, /selectYear\(/);
});

test("map keeps advanced controls inside the map workspace", () => {
  assert.match(html, /class="map-tools"/);
  assert.match(html, /id="map-dimension"/);
  assert.match(html, /data-mode="points"/);
  assert.match(html, /data-mode="grid"/);
  assert.match(html, /data-mode="mixed"/);
});

test("3D stays optional and lazy-loaded", () => {
  assert.match(app, /import\("\.\/map3d\.js"\)/);
});

test("establishment popup exposes reconciliation and source provenance", () => {
  assert.match(app, /getReconciliationState/);
  assert.match(app, /Corroborado por OSM y Overture/);
  assert.match(app, /Solo OpenStreetMap/);
  assert.match(app, /Solo Overture/);
});

test("history index is consumed as a separate comparable OSM series", () => {
  assert.match(app, /history\/index\.json/);
  assert.match(app, /Serie comparable OSM/);
});

test("institutional shell credits Federico Trucco discreetly and links GitHub", () => {
  assert.match(html, /Federico Trucco/);
  assert.match(html, /https:\/\/github\.com\/truquinio/);
});

test("data and methodology page shares the main application shell", async () => {
  const docs = await readFile(new URL("../web/docs.html", import.meta.url), "utf8");
  assert.match(docs, /class="topbar"/);
  assert.match(docs, /class="nav-rail"/);
  assert.match(docs, /Federico Trucco/);
  assert.match(docs, /\.\/css\/styles\.css/);
});
