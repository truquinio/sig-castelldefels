import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import proj4 from "proj4";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, "data");
const webDir = join(root, "web");
const webJsDir = join(webDir, "js");

const ICGC_URL =
  "https://maps.icgc.cat/vector01/rest/services/divisions_administratives_wfs/MapServer/2/query?where=NOMMUNI%3D%27Castelldefels%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

const CELL_METERS = 500;
const ANALYTIC_CRS = "EPSG:25831";
const OFFLINE_REBUILD = process.argv.includes("--offline");
proj4.defs(ANALYTIC_CRS, "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs +type=crs");

const CATEGORY_ORDER = [
  "Comercio",
  "Restauración",
  "Alojamiento",
  "Servicios financieros",
  "Salud",
  "Educación",
  "Automoción y movilidad",
  "Ocio",
  "Oficinas",
  "Otros servicios",
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(25_000),
    headers: {
      "user-agent": "sig-castelldefels/2.0 (open-data portfolio project)",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 400)}`);
  }

  return response.json();
}

function flattenCoordinates(geometry) {
  const values = [];

  function walk(coords) {
    if (typeof coords?.[0] === "number" && typeof coords?.[1] === "number") {
      values.push(coords);
      return;
    }

    for (const part of coords ?? []) {
      walk(part);
    }
  }

  walk(geometry.coordinates);
  return values;
}

function getBbox(feature) {
  const coordinates = flattenCoordinates(feature.geometry);
  return coordinates.reduce(
    (box, [lon, lat]) => ({
      minLon: Math.min(box.minLon, lon),
      minLat: Math.min(box.minLat, lat),
      maxLon: Math.max(box.maxLon, lon),
      maxLat: Math.max(box.maxLat, lat),
    }),
    { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity },
  );
}

function pointInRing([lon, lat], ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, polygon) {
  const [outer, ...holes] = polygon;
  if (!pointInRing(point, outer)) {
    return false;
  }

  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInFeature(point, feature) {
  const { geometry } = feature;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function buildOverpassQuery({ minLon, minLat, maxLon, maxLat }) {
  const margin = 0.01;
  const south = (minLat - margin).toFixed(6);
  const west = (minLon - margin).toFixed(6);
  const north = (maxLat + margin).toFixed(6);
  const east = (maxLon + margin).toFixed(6);
  const bbox = `${south},${west},${north},${east}`;
  const selectors = [
    '["amenity"~"^(restaurant|cafe|bar|pub|fast_food|pharmacy|bank|atm|clinic|doctors|dentist|hospital|school|kindergarten|post_office|fuel|charging_station|marketplace|theatre|cinema|arts_centre)$"]',
    '["shop"]',
    '["office"]',
    '["tourism"~"^(hotel|hostel|apartment|guest_house)$"]',
    '["leisure"="fitness_centre"]',
  ];

  const clauses = [];
  for (const type of ["node", "way", "relation"]) {
    for (const selector of selectors) {
      clauses.push(`  ${type}${selector}(${bbox});`);
    }
  }

  return `[out:json][timeout:90];
(
${clauses.join("\n")}
);
out center tags;`;
}

async function fetchOverpass(query) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const payload = await fetchJson(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      return { payload, endpoint };
    } catch (error) {
      lastError = error;
      console.warn(`Overpass endpoint failed: ${endpoint}`);
    }
  }

  throw lastError;
}

const ECONOMIC_AMENITIES = new Set([
  "restaurant", "cafe", "bar", "pub", "fast_food", "pharmacy", "bank", "atm",
  "clinic", "doctors", "dentist", "hospital", "school", "kindergarten", "post_office",
  "fuel", "charging_station", "marketplace", "theatre", "cinema", "arts_centre",
]);

function isEconomicCandidate(tags) {
  return Boolean(
    tags.shop ||
      tags.office ||
      ECONOMIC_AMENITIES.has(tags.amenity) ||
      ["hotel", "hostel", "apartment", "guest_house"].includes(tags.tourism) ||
      tags.leisure === "fitness_centre",
  );
}

function getPrimaryTag(tags) {
  for (const key of ["amenity", "shop", "office", "tourism", "leisure"]) {
    if (tags[key]) {
      return `${key}=${tags[key]}`;
    }
  }

  return "sin_etiqueta";
}

function getCategory(tags) {
  const amenity = tags.amenity;

  if (tags.shop) {
    return "Comercio";
  }

  if (["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten"].includes(amenity)) {
    return "Restauración";
  }

  if (["bank", "atm"].includes(amenity)) {
    return "Servicios financieros";
  }

  if (["pharmacy", "clinic", "doctors", "dentist", "hospital", "veterinary", "social_facility"].includes(amenity)) {
    return "Salud";
  }

  if (["school", "kindergarten", "college", "university", "music_school", "language_school"].includes(amenity)) {
    return "Educación";
  }

  if (["fuel", "charging_station"].includes(amenity)) {
    return "Automoción y movilidad";
  }

  if (["theatre", "cinema", "arts_centre"].includes(amenity) || tags.leisure === "fitness_centre") {
    return "Ocio";
  }

  if (tags.tourism) {
    return "Alojamiento";
  }

  if (tags.office) {
    return "Oficinas";
  }

  return "Otros servicios";
}

function elementToPoi(element) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!lat || !lon || !element.tags) {
    return null;
  }

  const tags = element.tags;
  if (!isEconomicCandidate(tags)) {
    return null;
  }
  const category = getCategory(tags);

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      osm_id: `${element.type}/${element.id}`,
      name: tags.name ?? tags.brand ?? tags.operator ?? "Sin nombre",
      category,
      primary_tag: getPrimaryTag(tags),
      amenity: tags.amenity ?? null,
      shop: tags.shop ?? null,
      office: tags.office ?? null,
      tourism: tags.tourism ?? null,
      leisure: tags.leisure ?? null,
      source: "OpenStreetMap via Overpass API",
    },
  };
}

function normalizeExistingPoi(feature) {
  const tags = feature.properties ?? {};
  if (feature.geometry?.type !== "Point" || !isEconomicCandidate(tags)) {
    return null;
  }

  return {
    ...feature,
    properties: {
      ...tags,
      category: getCategory(tags),
      primary_tag: getPrimaryTag(tags),
      source: "OpenStreetMap via Overpass API",
    },
  };
}

function sortByCategoryThenName(a, b) {
  const categoryDiff =
    CATEGORY_ORDER.indexOf(a.properties.category) - CATEGORY_ORDER.indexOf(b.properties.category);

  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  return a.properties.name.localeCompare(b.properties.name, "es");
}

function createGrid(boundary, pois) {
  const projectedBoundary = flattenCoordinates(boundary.geometry).map((coord) =>
    proj4("EPSG:4326", ANALYTIC_CRS, coord),
  );
  const metricBox = projectedBoundary.reduce(
    (box, [x, y]) => ({
      minX: Math.min(box.minX, x),
      minY: Math.min(box.minY, y),
      maxX: Math.max(box.maxX, x),
      maxY: Math.max(box.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const startX = Math.floor(metricBox.minX / CELL_METERS) * CELL_METERS;
  const startY = Math.floor(metricBox.minY / CELL_METERS) * CELL_METERS;
  const columns = Math.ceil((metricBox.maxX - startX) / CELL_METERS);
  const rows = Math.ceil((metricBox.maxY - startY) / CELL_METERS);
  const cells = new Map();

  function makeCellFeature(row, col) {
    const minX = startX + col * CELL_METERS;
    const minY = startY + row * CELL_METERS;
    const maxX = minX + CELL_METERS;
    const maxY = minY + CELL_METERS;
    const id = `r${row}_c${col}`;
    const ring = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ].map((coord) => proj4(ANALYTIC_CRS, "EPSG:4326", coord));

    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        id,
        count: 0,
        top_category: null,
        categories: {},
        cell_size_m: CELL_METERS,
        analytic_crs: ANALYTIC_CRS,
      },
    };
  }

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= columns; col += 1) {
      const centerMetric = [
        startX + (col + 0.5) * CELL_METERS,
        startY + (row + 0.5) * CELL_METERS,
      ];
      const centerWgs84 = proj4(ANALYTIC_CRS, "EPSG:4326", centerMetric);

      if (!pointInFeature(centerWgs84, boundary)) continue;

      const id = `r${row}_c${col}`;
      cells.set(id, makeCellFeature(row, col));
    }
  }

  for (const poi of pois) {
    const [x, y] = proj4("EPSG:4326", ANALYTIC_CRS, poi.geometry.coordinates);
    const col = Math.floor((x - startX) / CELL_METERS);
    const row = Math.floor((y - startY) / CELL_METERS);
    const id = `r${row}_c${col}`;
    let cell = cells.get(id);

    if (!cell) {
      cell = makeCellFeature(row, col);
      cells.set(id, cell);
    }

    const category = poi.properties.category;
    poi.properties.grid_id = id;
    cell.properties.count += 1;
    cell.properties.categories[category] = (cell.properties.categories[category] ?? 0) + 1;
  }

  const features = [...cells.values()].map((cell) => {
    const categories = Object.entries(cell.properties.categories).sort((a, b) => b[1] - a[1]);
    const count = cell.properties.count;

    return {
      ...cell,
      properties: {
        ...cell.properties,
        top_category: categories[0]?.[0] ?? null,
        category_breakdown: categories.map(([category, value]) => ({ category, value })),
        density_label: count === 0 ? "Sin registros OSM" : `${count} registro${count === 1 ? "" : "s"} OSM`,
      },
    };
  });

  const maxCount = Math.max(1, ...features.map((feature) => feature.properties.count));
  for (const feature of features) {
    feature.properties.rank =
      feature.properties.count === 0
        ? 0
        : Math.ceil((feature.properties.count / maxCount) * 5);
  }

  return { type: "FeatureCollection", features };
}

function groupCounts(features, field) {
  const counts = new Map();

  for (const feature of features) {
    const value = feature.properties[field];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return CATEGORY_ORDER.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  })).filter((entry) => entry.count > 0);
}

function buildSummary(boundary, pois, grid, overpassEndpoint, overpassQuery, provenance = {}) {
  const byCategory = groupCounts(pois, "category");
  const topCells = grid.features
    .filter((feature) => feature.properties.count > 0)
    .sort((a, b) => b.properties.count - a.properties.count)
    .slice(0, 5)
    .map((feature) => ({
      id: feature.properties.id,
      count: feature.properties.count,
      top_category: feature.properties.top_category,
    }));

  const areaKm2 =
    boundary.properties.AREAM5000 ??
    (boundary.properties.SHAPE_Area ? boundary.properties.SHAPE_Area / 1_000_000 : null);

  return {
    title: "Actividades económicas observadas en Castelldefels",
    generated_at: new Date().toISOString(),
    municipality: boundary.properties.NOMMUNI ?? "Castelldefels",
    comarca: boundary.properties.NOMCOMAR ?? "Baix Llobregat",
    area_km2_icgc: areaKm2 ? Number(areaKm2.toFixed(2)) : null,
    total_pois: pois.length,
    cell_size_m: CELL_METERS,
    analytic_crs: ANALYTIC_CRS,
    rebuild_mode: provenance.mode ?? "online",
    source_snapshot_at: provenance.sourceSnapshotAt ?? new Date().toISOString(),
    categories: byCategory,
    top_cells: topCells,
    limitations: [
      "Los puntos proceden de OpenStreetMap y no equivalen al Censo de Actividades Económicas municipal.",
      "El análisis usa una selección de etiquetas OSM amenity, shop, office, tourism y leisure dentro del límite oficial ICGC.",
      "La malla de 500 m resume concentración de puntos, no densidad económica ni afluencia real.",
    ],
    sources: {
      icgc: {
        name: "ICGC - Divisions administratives, municipis 1:5.000",
        url: ICGC_URL,
        data_date: "20/01/2026",
      },
      osm: {
        name: "OpenStreetMap via Overpass API",
        endpoint: overpassEndpoint,
        license: "ODbL",
        license_url: "https://www.openstreetmap.org/copyright",
        query: overpassQuery,
      },
    },
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(webDir, { recursive: true });
  await mkdir(webJsDir, { recursive: true });

  let boundary;
  let pois;
  let endpoint;
  let overpassQuery;
  let provenance = { mode: "online" };

  if (OFFLINE_REBUILD) {
    const [boundaryCollection, existingPois, previousSummary] = await Promise.all([
      readFile(join(dataDir, "castelldefels_boundary.geojson"), "utf8").then(JSON.parse),
      readFile(join(dataDir, "osm_pois_castelldefels.geojson"), "utf8").then(JSON.parse),
      readFile(join(dataDir, "summary.json"), "utf8").then(JSON.parse),
    ]);
    boundary = boundaryCollection.features?.[0];
    endpoint = previousSummary.sources?.osm?.endpoint ?? "snapshot local";
    overpassQuery = previousSummary.sources?.osm?.query ?? buildOverpassQuery(getBbox(boundary));
    provenance = { mode: "offline-snapshot", sourceSnapshotAt: previousSummary.source_snapshot_at ?? previousSummary.generated_at };
    pois = existingPois.features.map(normalizeExistingPoi).filter(Boolean);
  } else {
    const boundaryCollection = await fetchJson(ICGC_URL);
    boundary = boundaryCollection.features?.[0];
    if (!boundary) throw new Error("No se encontro el limite municipal de Castelldefels en ICGC.");
    overpassQuery = buildOverpassQuery(getBbox(boundary));
    const result = await fetchOverpass(overpassQuery);
    endpoint = result.endpoint;
    pois = result.payload.elements.map(elementToPoi).filter(Boolean);
  }

  if (!boundary) throw new Error("No se encontro el limite municipal de Castelldefels.");

  const seen = new Set();
  pois = pois
    .filter((feature) => pointInFeature(feature.geometry.coordinates, boundary))
    .filter((feature) => {
      if (seen.has(feature.properties.osm_id)) return false;
      seen.add(feature.properties.osm_id);
      return true;
    })
    .sort(sortByCategoryThenName);

  const boundaryOutput = { type: "FeatureCollection", features: [boundary] };
  const poisOutput = { type: "FeatureCollection", features: pois };
  const gridOutput = createGrid(boundary, pois);
  const summary = buildSummary(boundary, pois, gridOutput, endpoint, overpassQuery, provenance);

  await writeJson(join(dataDir, "castelldefels_boundary.geojson"), boundaryOutput);
  await writeJson(join(dataDir, "osm_pois_castelldefels.geojson"), poisOutput);
  await writeJson(join(dataDir, "poi_grid_500m.geojson"), gridOutput);
  await writeJson(join(dataDir, "summary.json"), summary);
  await writeFile(join(dataDir, "overpass-query.txt"), `${overpassQuery}\n`, "utf8");
  await writeFile(
    join(webJsDir, "data.js"),
    `window.SIG_DATA = ${JSON.stringify({
      boundary: boundaryOutput,
      pois: poisOutput,
      grid: gridOutput,
      summary,
    })};\n`,
    "utf8",
  );

  console.log(`Boundary: ${boundary.properties.NOMMUNI}`);
  console.log(`POIs: ${pois.length}`);
  console.log(`Grid cells: ${gridOutput.features.length}`);
  console.log(`Overpass endpoint: ${endpoint}`);
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
