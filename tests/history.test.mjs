import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const history = JSON.parse(await readFile(new URL("../web/history/index.json", import.meta.url), "utf8"));
const summary = JSON.parse(await readFile(new URL("../data/summary.json", import.meta.url), "utf8"));
const currentYear = new Date().getFullYear();

test("history index covers the last ten years through the current year", () => {
  const expected = Array.from({ length: 11 }, (_, i) => currentYear - 10 + i);
  assert.deepEqual(history.years.map((item) => item.year), expected);
});

test("every historical year has an observed OSM total and the current year matches the combined inventory", () => {
  for (const item of history.years) assert.ok(Number.isFinite(item.total), String(item.year));
  const current = history.years.find((item) => item.year === currentYear);
  assert.equal(current.total, summary.total_pois);
  assert.equal(current.source_scope, "current-combined");
});

test("historical statistics are explicitly separated from cartographic snapshot availability", () => {
  for (const item of history.years.filter((item) => item.year < currentYear)) {
    assert.equal(item.stats_available, true);
    assert.equal(item.stats_source, "ohsome-api");
    assert.equal(item.source_scope, "historical-osm");
  }
});
