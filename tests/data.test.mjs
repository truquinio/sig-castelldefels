import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = (name) => readFile(new URL(`../data/${name}`, import.meta.url), "utf8").then(JSON.parse);
const [pois, grid, summary] = await Promise.all([
  load("osm_pois_castelldefels.geojson"),
  load("poi_grid_500m.geojson"),
  load("summary.json"),
]);

const knownCategories = new Set([
  "Comercio", "Restauración", "Alojamiento", "Servicios financieros", "Salud",
  "Educación", "Automoción y movilidad", "Ocio", "Oficinas", "Otros servicios",
]);

test("dataset has valid unique point records", () => {
  assert.equal(pois.type, "FeatureCollection");
  const ids = new Set();
  for (const feature of pois.features) {
    assert.equal(feature.geometry.type, "Point");
    const [lon, lat] = feature.geometry.coordinates;
    assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180);
    assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90);
    assert.ok(feature.properties.osm_id);
    assert.ok(!ids.has(feature.properties.osm_id), `duplicate ${feature.properties.osm_id}`);
    ids.add(feature.properties.osm_id);
    assert.ok(knownCategories.has(feature.properties.category), feature.properties.category);
  }
});

test("summary matches generated activity data", () => {
  assert.equal(summary.total_pois, pois.features.length);
  assert.equal(summary.categories.reduce((sum, item) => sum + item.count, 0), pois.features.length);
  assert.equal(summary.analytic_crs, "EPSG:25831");
});

test("every activity references an existing metric grid cell", () => {
  const cells = new Set(grid.features.map((feature) => feature.properties.id));
  for (const cell of grid.features) {
    assert.equal(cell.properties.cell_size_m, 500);
    assert.equal(cell.properties.analytic_crs, "EPSG:25831");
  }
  for (const feature of pois.features) assert.ok(cells.has(feature.properties.grid_id));
});
