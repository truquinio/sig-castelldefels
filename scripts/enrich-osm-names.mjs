import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = join(root, "data", "osm_pois_castelldefels.geojson");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const missing = data.features.filter((feature) => !feature.properties.name || feature.properties.name === "Sin nombre");

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "sig-castelldefels/2.1 (open-data enrichment)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function wikidataLabel(id) {
  if (!id) return null;
  try {
    const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`);
    const labels = entity.entities?.[id]?.labels ?? {};
    return labels.es?.value ?? labels.ca?.value ?? labels.en?.value ?? null;
  } catch {
    return null;
  }
}

async function enrich(feature) {
  const [type, id] = feature.properties.osm_id.split("/");
  try {
    const payload = await fetchJson(`https://api.openstreetmap.org/api/0.6/${type}/${id}.json`);
    const tags = payload.elements?.[0]?.tags ?? {};
    let name = [tags.name, tags.brand, tags.operator].find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
    let nameSource = name ? "OpenStreetMap API" : null;

    if (!name && tags.wikidata) {
      name = await wikidataLabel(tags.wikidata);
      if (name) nameSource = "Wikidata";
    }

    return {
      feature,
      name,
      nameSource,
      wikidata: tags.wikidata ?? null,
      website: tags.website ?? tags["contact:website"] ?? null,
    };
  } catch (error) {
    return { feature, error: error.message };
  }
}

let enriched = 0;
let failed = 0;
const concurrency = 6;
for (let i = 0; i < missing.length; i += concurrency) {
  const batch = await Promise.all(missing.slice(i, i + concurrency).map(enrich));
  for (const result of batch) {
    if (result.error) {
      failed += 1;
      continue;
    }
    const p = result.feature.properties;
    if (result.name) {
      p.name = result.name;
      p.name_source = result.nameSource;
      enriched += 1;
    }
    if (result.wikidata) p.wikidata = result.wikidata;
    if (result.website) p.website = result.website;
  }
}

await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Missing names checked: ${missing.length}`);
console.log(`Names enriched: ${enriched}`);
console.log(`Requests failed: ${failed}`);
