import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const build = await readFile(new URL("../scripts/build-data.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/js/app.js", import.meta.url), "utf8");

test("economic extraction excludes clearly non-economic features", () => {
  for (const forbidden of ["park", "playground", "pitch", "garden", "nature_reserve", "bicycle_parking", "townhall", "police", "fire_station", "library", "community_centre"]) {
    assert.doesNotMatch(build, new RegExp("\\b" + forbidden + "\\b"), forbidden);
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
