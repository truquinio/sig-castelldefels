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
  assert.match(html, /SIG Castelldefels · v0\.7\.2/);
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

test("successful 3D status is temporary while errors remain persistent", () => {
  assert.match(app, /function setMapStatus\(message,\{clearAfter=0\}=\{\}\)/);
  assert.match(app, /3D contextual de edificios; no modifica el inventario ni su clasificación\.",\{clearAfter:4000\}/);
  assert.match(app, /setMapStatus\("No se pudo cargar 3D\. El mapa 2D sigue disponible\."\);/);
  assert.match(app, /setMapStatus\("La vista 3D no está disponible en este dispositivo\."\);/);
});

test("analytics drill-down uses category then subcategory as the primary BI path", () => {
  assert.match(app, /subcategory:"__all__"/);
  assert.match(app, /ignoreCategory=false,ignoreSubcategory=false/);
  assert.match(app, /countBySubcategory/);
  assert.match(app, /data-chart-subcategory/);
  assert.match(app, /Tipos de \$\{state\.category\}/);
  assert.match(app, /drawCategoryChart\(getFilteredEstablishments\(\{ignoreCategory:true,ignoreSubcategory:true\}\)\)/);
});

test("source provenance is contextual quality information, not a competing primary filter", () => {
  assert.match(html, /Calidad del dato/);
  assert.match(html, /Procedencia de los registros/);
  assert.match(app, /function drawSourceChart/);
  assert.match(app, /source-row-passive/);
  assert.doesNotMatch(app, /data-source-filter/);
  assert.doesNotMatch(app, /state\.source/);
});

test("data completeness is visualized without adding decorative chart types", () => {
  assert.match(html, /id="quality-named"/);
  assert.match(html, /id="quality-named-bar"/);
  assert.match(app, /quality-named-bar/);
  assert.doesNotMatch(html, /donut|treemap|gauge/i);
});

test("Explore extends existing filters without adding a new primary navigation section", () => {
  assert.match(html, /class="toolbar-card explore-toolbar"/);
  assert.match(html, /id="subcategory-select"/);
  assert.match(app, /function updateSubcategorySelect/);
  assert.doesNotMatch(html, /data-section-target="explore"/);
});

test("map layers are grouped contextually inside the map", () => {
  assert.match(html, /id="layers-toggle"/);
  assert.match(html, /id="map-layers-panel"/);
  assert.match(html, /Actividades/);
  assert.match(html, /Contexto/);
  assert.match(html, /Fondo/);
  assert.match(html, /id="boundary-toggle"/);
  assert.match(app, /function setLayersPanel/);
  assert.match(app, /state\.boundary/);
  assert.doesNotMatch(html, /data-section-target="layers"/);
});

test("map selection exposes a contextual panel while keeping the full technical card available", () => {
  assert.match(html, /id="map-context-panel"/);
  assert.match(html, /id="context-open-detail"/);
  assert.match(app, /function showMapContext/);
  assert.match(app, /function openSelectedContextDetail/);
  assert.match(app, /target\.openPopup\(\)/);
  assert.match(app, /showMapContext\(feature\)/);
});

test("documentation remains separate from cartographic controls", () => {
  assert.match(html, /href="\.\/docs\.html"/);
  assert.match(html, />Datos y método<\/span>/);
  const layersPanel = html.match(/<aside class="map-layers-panel"[\s\S]*?<\/aside>/)?.[0] ?? "";
  assert.doesNotMatch(layersPanel, /docs\.html|Datos y método|Normativa/);
});

test("context selection suppresses Leaflet auto-popup until full detail is requested", () => {
  assert.match(app, /layer\.off\("click",layer\._openPopup,layer\)/);
  assert.match(app, /openSelectedContextDetail/);
  assert.match(app, /target\.openPopup\(\)/);
});
