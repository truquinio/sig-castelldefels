import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const CATEGORY_ORDER = [
  "Comercio",
  "Restauración",
  "Administración y servicios",
  "Salud",
  "Educación",
  "Ocio y turismo",
  "Oficinas",
  "Otros servicios",
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "mini-sig-castelldefels/1.0 (learning project)",
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
    '["amenity"~"^(restaurant|cafe|bar|pub|fast_food|pharmacy|bank|atm|clinic|doctors|dentist|hospital|school|kindergarten|library|townhall|post_office|police|fire_station|fuel|charging_station|parking|bicycle_parking|bicycle_rental|marketplace|community_centre|theatre|cinema|arts_centre)$"]',
    '["shop"]',
    '["office"]',
    '["tourism"~"^(hotel|hostel|apartment|guest_house|information|attraction|museum|viewpoint)$"]',
    '["leisure"~"^(park|playground|sports_centre|fitness_centre|pitch|garden|nature_reserve)$"]',
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

  if (["townhall", "post_office", "police", "fire_station", "bank", "atm", "courthouse"].includes(amenity)) {
    return "Administración y servicios";
  }

  if (["pharmacy", "clinic", "doctors", "dentist", "hospital", "veterinary", "social_facility"].includes(amenity)) {
    return "Salud";
  }

  if (["school", "kindergarten", "college", "university", "library", "music_school", "language_school"].includes(amenity)) {
    return "Educación";
  }

  if (tags.tourism || tags.leisure) {
    return "Ocio y turismo";
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

function sortByCategoryThenName(a, b) {
  const categoryDiff =
    CATEGORY_ORDER.indexOf(a.properties.category) - CATEGORY_ORDER.indexOf(b.properties.category);

  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  return a.properties.name.localeCompare(b.properties.name, "es");
}

function createGrid(boundary, pois) {
  const box = getBbox(boundary);
  const midLat = (box.minLat + box.maxLat) / 2;
  const latStep = CELL_METERS / 111_320;
  const lonStep = CELL_METERS / (111_320 * Math.cos((midLat * Math.PI) / 180));
  const startLon = Math.floor(box.minLon / lonStep) * lonStep;
  const startLat = Math.floor(box.minLat / latStep) * latStep;
  const columns = Math.ceil((box.maxLon - startLon) / lonStep);
  const rows = Math.ceil((box.maxLat - startLat) / latStep);
  const cells = new Map();

  function makeCellFeature(row, col) {
    const minLon = startLon + col * lonStep;
    const minLat = startLat + row * latStep;
    const maxLon = minLon + lonStep;
    const maxLat = minLat + latStep;
    const id = `r${row}_c${col}`;

    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat],
          ],
        ],
      },
      properties: {
        id,
        count: 0,
        top_category: null,
        categories: {},
      },
    };
  }

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= columns; col += 1) {
      const minLon = startLon + col * lonStep;
      const minLat = startLat + row * latStep;
      const maxLon = minLon + lonStep;
      const maxLat = minLat + latStep;
      const center = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];

      if (!pointInFeature(center, boundary)) {
        continue;
      }

      const id = `r${row}_c${col}`;
      cells.set(id, makeCellFeature(row, col));
    }
  }

  for (const poi of pois) {
    const [lon, lat] = poi.geometry.coordinates;
    const col = Math.floor((lon - startLon) / lonStep);
    const row = Math.floor((lat - startLat) / latStep);
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
        density_label: count === 0 ? "Sin puntos OSM" : `${count} punto${count === 1 ? "" : "s"} OSM`,
      },
    };
  });

  const maxCount = Math.max(1, ...features.map((feature) => feature.properties.count));
  for (const feature of features) {
    feature.properties.rank = feature.properties.count === 0 ? 0 : Math.ceil((feature.properties.count / maxCount) * 5);
  }

  return {
    type: "FeatureCollection",
    features,
  };
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

function buildSummary(boundary, pois, grid, overpassEndpoint, overpassQuery) {
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
    title: "Actividades y servicios urbanos en Castelldefels",
    generated_at: new Date().toISOString(),
    municipality: boundary.properties.NOMMUNI ?? "Castelldefels",
    comarca: boundary.properties.NOMCOMAR ?? "Baix Llobregat",
    area_km2_icgc: areaKm2 ? Number(areaKm2.toFixed(2)) : null,
    total_pois: pois.length,
    cell_size_m: CELL_METERS,
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

  const boundaryCollection = await fetchJson(ICGC_URL);
  const boundary = boundaryCollection.features?.[0];

  if (!boundary) {
    throw new Error("No se encontro el limite municipal de Castelldefels en ICGC.");
  }

  const overpassQuery = buildOverpassQuery(getBbox(boundary));
  const { payload: overpassData, endpoint } = await fetchOverpass(overpassQuery);

  const seen = new Set();
  const pois = overpassData.elements
    .map(elementToPoi)
    .filter(Boolean)
    .filter((feature) => pointInFeature(feature.geometry.coordinates, boundary))
    .filter((feature) => {
      if (seen.has(feature.properties.osm_id)) {
        return false;
      }

      seen.add(feature.properties.osm_id);
      return true;
    })
    .sort(sortByCategoryThenName);

  const boundaryOutput = { type: "FeatureCollection", features: [boundary] };
  const poisOutput = { type: "FeatureCollection", features: pois };
  const gridOutput = createGrid(boundary, pois);
  const summary = buildSummary(boundary, pois, gridOutput, endpoint, overpassQuery);

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
