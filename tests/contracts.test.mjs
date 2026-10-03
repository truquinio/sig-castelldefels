import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const build = await readFile(new URL("../scripts/build-data.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/js/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../web/css/styles.css", import.meta.url), "utf8");

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

test("current UI uses establishment language instead of POI-centric product language", () => {
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

test("establishment popup uses clear source provenance language", () => {
  assert.match(app, /getReconciliationState/);
  assert.match(app, /Fuentes: OpenStreetMap \+ Overture Maps/);
  assert.match(app, /Fuente: OpenStreetMap/);
  assert.match(app, /Fuente: Overture Maps/);
  assert.match(app, /Ficha de actividad económica/);
  assert.match(app, /Tipo de actividad/);
  assert.match(app, /Sector/);
  assert.match(app, /Detalles técnicos/);
  assert.doesNotMatch(app, /<dt>Identificación<\/dt>/);
  assert.doesNotMatch(app, /<dt>Celda 500 m<\/dt>/);
});

test("history index is consumed as a separate comparable OSM series", () => {
  assert.match(app, /history\/index\.json/);
  assert.match(app, /Serie comparable OSM/);
});

test("PWA shell exposes manifest, theme metadata and service worker registration", async () => {
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(app, /navigator\.serviceWorker\.register\("\.\/sw\.js"/);
  const manifest = JSON.parse(await readFile(new URL("../web/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./index.html");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("PWA service worker provides versioned cache and offline fallback", async () => {
  const sw = await readFile(new URL("../web/sw.js", import.meta.url), "utf8");
  assert.match(sw, /CACHE_VERSION/);
  assert.match(sw, /offline\.html/);
  assert.match(sw, /caches\.delete/);
  const offline = await readFile(new URL("../web/offline.html", import.meta.url), "utf8");
  assert.match(offline, /Sin conexión/);
});

test("mobile-first accessibility shell exposes skip link and semantic author links", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /href="#dashboard"/);
  assert.match(html, /aria-label="GitHub de Federico Trucco"/);
  assert.match(html, /aria-label="LinkedIn de Federico Trucco"/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/in\/federico-trucco\//);
});

test("author attribution is more visible without becoming a primary action", () => {
  assert.match(html, /SIG Castelldefels · v0\.6/);
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

test("OSM normalization preserves reusable photo and contact metadata", () => {
  for (const field of ["image","wikimedia_commons","mapillary","phone","opening_hours","addr_street","addr_housenumber"]) {
    assert.match(build, new RegExp(field), field);
  }
});

test("establishment card renders a visual media header with honest fallback", () => {
  assert.match(app, /resolveEstablishmentMedia/);
  assert.match(app, /establishment-media/);
  assert.match(app, /Sin foto abierta vinculada/);
  assert.match(app, /Imagen vinculada en OpenStreetMap|Wikimedia Commons|Mapillary/);
});

test("photo rendering never labels nearest street imagery as a verified storefront photo", () => {
  assert.doesNotMatch(app, /foto actualizada del local/i);
  assert.match(app, /Imagen vinculada|Imagen de entorno|Sin foto abierta vinculada/);
});

test("Panoramax enrichment is bounded, attributed and explicitly contextual", async () => {
  assert.match(build, /PANORAMAX_MAX_DISTANCE_M=40/);
  assert.match(build, /panoramax_thumbnail_url/);
  assert.match(app, /caption:`Imagen de entorno/);
  assert.match(app, /label:"Panoramax"/);
  assert.match(app, /panoramax_distance_m/);
  assert.match(app, /panoramax_license/);
  const summary = JSON.parse(await readFile(new URL("../data/summary.json", import.meta.url), "utf8"));
  assert.equal(summary.panoramax_imagery?.max_distance_m, 40);
  assert.ok(summary.panoramax_imagery?.matched > 0);
});

test("desktop layout keeps a stable fixed navigation rail and compact map composition", () => {
  assert.match(css, /v0\.6\.3 desktop composition/);
  assert.match(css, /\.nav-rail\{[\s\S]*?position:fixed;[\s\S]*?top:60px;[\s\S]*?bottom:0;/);
  assert.match(css, /\.content-grid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) 218px/);
  assert.match(css, /\.map-wrap\{[\s\S]*?height:clamp\(430px,56vh,560px\)/);
  assert.match(css, /\.bottom-grid\{[\s\S]*?grid-template-columns:minmax\(0,1\.45fr\) minmax\(330px,\.75fr\)/);
});

test("establishment media pipeline remains available but hidden from public cards", () => {
  assert.match(app, /resolveEstablishmentMedia/);
  assert.match(app, /renderEstablishmentMedia/);
  assert.match(css, /\.establishment-popup \.establishment-media\{[\s\S]*?display:none !important;/);
});

test("topbar and desktop navigation share one fixed scroll geometry", () => {
  assert.match(css, /--topbar-height:60px/);
  assert.match(css, /body\{[\s\S]*?padding-top:var\(--topbar-height\)/);
  assert.match(css, /\.topbar\{[\s\S]*?position:fixed;[\s\S]*?top:0;[\s\S]*?left:0;[\s\S]*?right:0;/);
  assert.match(css, /\.nav-rail\{[\s\S]*?top:var\(--topbar-height\);[\s\S]*?height:calc\(100dvh - var\(--topbar-height\)\)/);
});

test("PWA upgrades actively replace stale application shells", async () => {
  const sw = await readFile(new URL("../web/sw.js", import.meta.url), "utf8");
  assert.match(sw, /hadPreviousVersion/);
  assert.match(sw, /client\.navigate\(client\.url\)/);
  assert.match(app, /registration\.update\(\)/);
});
