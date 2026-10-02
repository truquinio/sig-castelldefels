import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = (name) => readFile(new URL(`../data/${name}`, import.meta.url), "utf8").then(JSON.parse);
const [activities, osmRaw, grid, summary] = await Promise.all([
  load("activities_castelldefels.geojson"),
  load("osm_pois_castelldefels.geojson"),
  load("poi_grid_500m.geojson"),
  load("summary.json"),
]);

const knownCategories = new Set([
  "Comercio minorista",
  "Restauración",
  "Alojamiento turístico",
  "Salud y bienestar",
  "Educación",
  "Servicios financieros",
  "Movilidad y automoción",
  "Ocio, cultura y deporte",
  "Servicios personales",
  "Servicios profesionales y empresariales",
  "Otros servicios",
]);

test("dataset has valid unique classified point records", () => {
  assert.equal(activities.type, "FeatureCollection");
  const ids = new Set();
  for (const feature of activities.features) {
    const p = feature.properties;
    assert.equal(feature.geometry.type, "Point");
    const [lon, lat] = feature.geometry.coordinates;
    assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180);
    assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90);
    assert.ok(p.osm_id || p.overture_id);
    const id = p.osm_id ?? `overture/${p.overture_id}`;
    assert.ok(!ids.has(id), `duplicate ${id}`);
    ids.add(id);
    assert.ok(knownCategories.has(p.category), p.category);
    assert.ok(p.subcategory && p.subcategory !== "Sin clasificar", id);
    assert.ok(p.display_name && p.display_name !== "Sin nombre", id);
  }
});

test("known multi-tag OSM records use the economically meaningful classification", () => {
  const byId = new Map(activities.features.filter((f) => f.properties.osm_id).map((f) => [f.properties.osm_id, f.properties]));
  assert.equal(byId.get("way/450023801")?.primary_tag, "shop=supermarket");
  assert.equal(byId.get("way/450023801")?.subcategory, "Supermercado");
  assert.equal(byId.get("node/6456233248")?.category, "Movilidad y automoción");
  assert.equal(byId.get("node/6456233248")?.subcategory, "Alquiler y tienda de bicicletas");
});

test("OSM source snapshot remains uncontaminated by Overture merge metadata", () => {
  assert.ok(osmRaw.features.length > 0);
  for (const feature of osmRaw.features) {
    assert.ok(feature.properties.osm_id);
    assert.equal(feature.properties.overture_id, undefined);
    assert.equal(feature.properties.overture_confidence, undefined);
  }
});

test("Overture integration is present, filtered and traceable", () => {
  const overture = activities.features.filter((f) => f.properties.overture_id);
  assert.ok(overture.length > 0);
  assert.ok(overture.every((f) => Number(f.properties.overture_confidence) >= 0.85));
  const banned = new Set(["beach", "park", "historic_site", "social_or_community_service", "sport_league", "amateur_sport_team", "sports_team"]);
  assert.ok(overture.every((f) => !banned.has(f.properties.overture_taxonomy)));
  assert.ok(summary.sources.overture);
});

test("summary matches generated activity data", () => {
  assert.equal(summary.total_pois, activities.features.length);
  assert.equal(summary.categories.reduce((sum, item) => sum + item.count, 0), activities.features.length);
  assert.equal(summary.source_counts.osm_only + summary.source_counts.overture_only + summary.source_counts.merged, activities.features.length);
  assert.equal(summary.analytic_crs, "EPSG:25831");
});

test("every activity references an existing metric grid cell", () => {
  const cells = new Set(grid.features.map((feature) => feature.properties.id));
  for (const cell of grid.features) {
    assert.equal(cell.properties.cell_size_m, 500);
    assert.equal(cell.properties.analytic_crs, "EPSG:25831");
  }
  for (const feature of activities.features) assert.ok(cells.has(feature.properties.grid_id));
});
