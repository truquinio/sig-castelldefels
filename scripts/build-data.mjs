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

function buildOverpassQuery({ minLon, minLat, maxLon, maxLat, snapshotDate = null }) {
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

  const dateClause = snapshotDate ? `[date:"${snapshotDate}"]` : "";
  return `[out:json][timeout:90]${dateClause};
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

const SHOP_LABELS = {
  supermarket: "Supermercado",
  convenience: "Tienda de conveniencia",
  clothes: "Tienda de ropa",
  bakery: "Panadería",
  hairdresser: "Peluquería",
  greengrocer: "Frutería y verdulería",
  kiosk: "Quiosco",
  butcher: "Carnicería",
  optician: "Óptica",
  tobacco: "Estanco",
  variety_store: "Bazar / tienda multiproducto",
  sports: "Tienda de deportes",
  bicycle: "Tienda de bicicletas",
  nuts: "Frutos secos",
  beauty: "Belleza y estética",
  computer: "Informática",
  photo: "Fotografía",
  baby_goods: "Artículos para bebés",
  confectionery: "Confitería",
  toys: "Juguetería",
  deli: "Alimentación especializada",
  books: "Librería",
  bookmaker: "Apuestas",
  newsagent: "Prensa",
  lottery: "Loterías",
  seafood: "Pescadería / marisco",
  pastry: "Pastelería",
  general: "Tienda general",
  car_repair: "Taller de automoción",
  yes: "Comercio sin tipo especificado",
};

const AMENITY_LABELS = {
  restaurant: "Restaurante",
  cafe: "Cafetería",
  bar: "Bar",
  pub: "Pub",
  fast_food: "Comida rápida",
  pharmacy: "Farmacia",
  bank: "Banco",
  atm: "Cajero automático",
  clinic: "Clínica",
  doctors: "Consulta médica",
  dentist: "Clínica dental",
  hospital: "Hospital",
  school: "Centro educativo",
  kindergarten: "Escuela infantil",
  post_office: "Oficina postal",
  fuel: "Estación de servicio",
  charging_station: "Estación de carga",
  marketplace: "Mercado",
  theatre: "Teatro",
  cinema: "Cine",
  arts_centre: "Centro artístico",
};

const TOURISM_LABELS = {
  hotel: "Hotel",
  hostel: "Hostal / albergue",
  apartment: "Apartamento turístico",
  guest_house: "Casa de huéspedes",
};

const OFFICE_LABELS = {
  research: "Investigación",
  estate_agent: "Agencia inmobiliaria",
  it: "Servicios informáticos",
  company: "Empresa",
  coworking: "Coworking",
  energy_supplier: "Proveedor energético",
};

function isEconomicCandidate(tags) {
  return Boolean(
    tags.shop ||
      tags.office ||
      ECONOMIC_AMENITIES.has(tags.amenity) ||
      ["hotel", "hostel", "apartment", "guest_house"].includes(tags.tourism) ||
      tags.leisure === "fitness_centre",
  );
}

function classifyActivity(tags) {
  const amenity = tags.amenity;
  const shop = tags.shop;

  if (shop === "bicycle" || shop === "car_repair" || ["fuel", "charging_station"].includes(amenity)) {
    const mixedBike = shop === "bicycle" && amenity === "bicycle_rental";
    return {
      category: "Movilidad y automoción",
      subcategory: mixedBike ? "Alquiler y tienda de bicicletas" : (SHOP_LABELS[shop] ?? AMENITY_LABELS[amenity]),
      primary_tag: shop ? `shop=${shop}` : `amenity=${amenity}`,
    };
  }

  if (shop === "hairdresser" || shop === "beauty") {
    return {
      category: "Servicios personales",
      subcategory: SHOP_LABELS[shop],
      primary_tag: `shop=${shop}`,
    };
  }

  if (shop === "optician" || ["pharmacy", "clinic", "doctors", "dentist", "hospital"].includes(amenity)) {
    return {
      category: "Salud y bienestar",
      subcategory: SHOP_LABELS[shop] ?? AMENITY_LABELS[amenity],
      primary_tag: shop ? `shop=${shop}` : `amenity=${amenity}`,
    };
  }

  if (["restaurant", "cafe", "bar", "pub", "fast_food"].includes(amenity)) {
    return { category: "Restauración", subcategory: AMENITY_LABELS[amenity], primary_tag: `amenity=${amenity}` };
  }

  if (["bank", "atm"].includes(amenity)) {
    return { category: "Servicios financieros", subcategory: AMENITY_LABELS[amenity], primary_tag: `amenity=${amenity}` };
  }

  if (["school", "kindergarten"].includes(amenity)) {
    return { category: "Educación", subcategory: AMENITY_LABELS[amenity], primary_tag: `amenity=${amenity}` };
  }

  if (["theatre", "cinema", "arts_centre"].includes(amenity) || tags.leisure === "fitness_centre" || ["bookmaker", "lottery"].includes(shop)) {
    const subcategory =
      shop === "bookmaker" ? "Casa de apuestas" :
      shop === "lottery" ? "Loterías" :
      tags.leisure === "fitness_centre" ? "Gimnasio / centro fitness" :
      AMENITY_LABELS[amenity];
    const primary_tag = shop ? `shop=${shop}` : tags.leisure ? `leisure=${tags.leisure}` : `amenity=${amenity}`;
    return { category: "Ocio, cultura y deporte", subcategory, primary_tag };
  }

  if (tags.tourism && TOURISM_LABELS[tags.tourism]) {
    return {
      category: "Alojamiento turístico",
      subcategory: TOURISM_LABELS[tags.tourism],
      primary_tag: `tourism=${tags.tourism}`,
    };
  }

  if (tags.office) {
    return {
      category: "Servicios profesionales y empresariales",
      subcategory: OFFICE_LABELS[tags.office] ?? "Servicios profesionales",
      primary_tag: `office=${tags.office}`,
    };
  }

  if (amenity === "post_office") {
    return { category: "Otros servicios", subcategory: "Servicios postales", primary_tag: "amenity=post_office" };
  }

  if (amenity === "marketplace") {
    return { category: "Comercio minorista", subcategory: "Mercado", primary_tag: "amenity=marketplace" };
  }

  if (shop) {
    return {
      category: "Comercio minorista",
      subcategory: SHOP_LABELS[shop] ?? "Comercio especializado",
      primary_tag: `shop=${shop}`,
    };
  }

  return { category: "Otros servicios", subcategory: "Otros servicios", primary_tag: "sin_etiqueta" };
}

function makeDisplayName(tags, subcategory) {
  const explicit = [tags.name, tags.brand, tags.operator].find((value) => typeof value === "string" && value.trim());
  return explicit?.trim() || `${subcategory} sin nombre`;
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
  const classification = classifyActivity(tags);
  const sourceName = [tags.name, tags.brand, tags.operator].find((value) => typeof value === "string" && value.trim())?.trim() ?? null;

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      osm_id: `${element.type}/${element.id}`,
      name: sourceName,
      display_name: makeDisplayName(tags, classification.subcategory),
      category: classification.category,
      subcategory: classification.subcategory,
      primary_tag: classification.primary_tag,
      amenity: tags.amenity ?? null,
      shop: tags.shop ?? null,
      office: tags.office ?? null,
      tourism: tags.tourism ?? null,
      leisure: tags.leisure ?? null,
      wikidata: tags.wikidata ?? null,
      website: tags.website ?? tags["contact:website"] ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      opening_hours: tags.opening_hours ?? null,
      addr_street: tags["addr:street"] ?? null,
      addr_housenumber: tags["addr:housenumber"] ?? null,
      addr_postcode: tags["addr:postcode"] ?? null,
      addr_city: tags["addr:city"] ?? null,
      image: tags.image ?? null,
      wikimedia_commons: tags.wikimedia_commons ?? null,
      mapillary: tags.mapillary ?? null,
      source: "OpenStreetMap via Overpass API",
      name_source: sourceName ? "OpenStreetMap" : "semantic-fallback",
    },
  };
}

function normalizeExistingPoi(feature) {
  const tags = feature.properties ?? {};
  if (feature.geometry?.type !== "Point" || !isEconomicCandidate(tags)) {
    return null;
  }

  const classification = classifyActivity(tags);
  const sourceName =
    typeof tags.name === "string" &&
    tags.name.trim() &&
    tags.name !== "Sin nombre" &&
    tags.name_source !== "Overture Maps Places"
      ? tags.name.trim()
      : null;

  return {
    type: "Feature",
    geometry: structuredClone(feature.geometry),
    properties: {
      osm_id: tags.osm_id,
      name: sourceName,
      display_name: sourceName || `${classification.subcategory} sin nombre`,
      category: classification.category,
      subcategory: classification.subcategory,
      primary_tag: classification.primary_tag,
      amenity: tags.amenity ?? null,
      shop: tags.shop ?? null,
      office: tags.office ?? null,
      tourism: tags.tourism ?? null,
      leisure: tags.leisure ?? null,
      wikidata: tags.wikidata ?? null,
      website: tags.website ?? tags["contact:website"] ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      opening_hours: tags.opening_hours ?? null,
      addr_street: tags["addr:street"] ?? null,
      addr_housenumber: tags["addr:housenumber"] ?? null,
      addr_postcode: tags["addr:postcode"] ?? null,
      addr_city: tags["addr:city"] ?? null,
      image: tags.image ?? null,
      wikimedia_commons: tags.wikimedia_commons ?? null,
      mapillary: tags.mapillary ?? null,
      source: "OpenStreetMap via Overpass API",
      name_source: sourceName ? (tags.name_source ?? "OpenStreetMap") : "semantic-fallback",
    },
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?l\.?u?|s\.?a\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function humanizeTaxonomy(value) {
  return String(value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const OVERTURE_LABELS = {
  grocery_store: "Supermercado / alimentación",
  clothing_store: "Tienda de ropa",
  womens_clothing_store: "Moda femenina",
  hardware_store: "Ferretería / bricolaje",
  furniture_store: "Muebles",
  flowers_and_gifts_store: "Flores y regalos",
  mobile_phone_store: "Telefonía",
  butcher_shop: "Carnicería",
  bakery: "Panadería",
  eyewear_store: "Óptica",
  bike_store: "Tienda de bicicletas",
  restaurant: "Restaurante",
  spanish_restaurant: "Restaurante español",
  mediterranean_restaurant: "Restaurante mediterráneo",
  italian_restaurant: "Restaurante italiano",
  japanese_restaurant: "Restaurante japonés",
  pizza_restaurant: "Pizzería",
  fast_food_restaurant: "Comida rápida",
  tapas_bar: "Bar de tapas",
  bar: "Bar",
  cafe: "Cafetería",
  coffee_shop: "Cafetería",
  hotel: "Hotel",
  beauty_salon: "Centro de estética",
  hair_salon: "Peluquería",
  barber: "Barbería",
  spa: "Spa / bienestar",
  pharmacy: "Farmacia",
  physical_therapy: "Fisioterapia",
  dental_clinic: "Clínica dental",
  general_dentistry: "Dentista",
  psychology: "Psicología",
  veterinarian: "Veterinaria",
  animal_hospital: "Hospital veterinario",
  school: "Centro educativo",
  private_school: "Centro educativo privado",
  language_school: "Academia de idiomas",
  bank_or_credit_union: "Banco / entidad financiera",
  insurance_agency: "Seguros",
  gas_station: "Estación de servicio",
  automotive_repair: "Taller de automoción",
  auto_dealer: "Concesionario",
  gym: "Gimnasio",
  martial_arts_club: "Artes marciales",
  sports_and_recreation: "Deporte y recreación",
  arts_and_entertainment: "Arte y entretenimiento",
  real_estate_agent: "Agencia inmobiliaria",
  real_estate_service: "Servicios inmobiliarios",
  professional_service: "Servicios profesionales",
  printing_service: "Imprenta / servicios de impresión",
  building_or_construction_service: "Construcción",
  contractor: "Contratista",
  travel_service: "Agencia / servicio de viajes",
  party_and_event_planning: "Organización de eventos",
  shipping_or_delivery_service: "Mensajería / paquetería",
};

function classifyOverturePlace(taxonomy, name = "") {
  const t = String(taxonomy ?? "").toLowerCase();
  if (!t) return null;
  const n = normalizeText(name);
  const subcategory = OVERTURE_LABELS[t] ?? humanizeTaxonomy(t);

  if (/^(beach|park|historic_site|social_or_community_service|sport_league|amateur_sport_team|sports_team)$/.test(t)) {
    return null;
  }

  if (/\b(caixabank|ibercaja|santander|bbva|sabadell|bank|banco|banc|cajero)\b/.test(n)) {
    return { category: "Servicios financieros", subcategory: /cajero|atm/.test(n) ? "Cajero automático" : "Banco / entidad financiera" };
  }
  if (/\b(clinica|clinic|dental|dentista|dentist|farmacia|pharmacy|fisio|physio|fisioterapia|psicolog|optica|optico|veterin|hospital|medical|salud)\b/.test(n)) {
    const inferred =
      /dental|dentista|dentist/.test(n) ? "Clínica dental" :
      /farmacia|pharmacy/.test(n) ? "Farmacia" :
      /fisio|physio|fisioterapia/.test(n) ? "Fisioterapia" :
      /psicolog/.test(n) ? "Psicología" :
      /optica|optico/.test(n) ? "Óptica" :
      /veterin/.test(n) ? "Veterinaria" :
      /hospital/.test(n) ? "Hospital / clínica" :
      "Centro de salud y bienestar";
    return { category: "Salud y bienestar", subcategory: inferred };
  }
  if (/\b(hotel|hostal|hostel|apartamentos|apartments|aparthotel|guesthouse|pension)\b/.test(n)) {
    return { category: "Alojamiento turístico", subcategory: /apart/.test(n) ? "Apartamento turístico" : "Hotel / alojamiento" };
  }
  if (/\b(restaurante|restaurant|pizzeria|pizza|bar|cafe|cafeteria|brunch|tapas|burger|sushi|grill|bistro)\b/.test(n)) {
    const inferred =
      /pizzeria|pizza/.test(n) ? "Pizzería" :
      /cafe|cafeteria|brunch/.test(n) ? "Cafetería" :
      /\bbar\b|tapas/.test(n) ? "Bar / tapas" :
      "Restaurante";
    return { category: "Restauración", subcategory: inferred };
  }
  if (/\b(peluquer|hair|barber|estetica|beauty|nails?|unas|spa|massage|masaje|tattoo|tatuaje)\b/.test(n)) {
    const inferred =
      /peluquer|hair|barber/.test(n) ? "Peluquería / barbería" :
      /nails?|unas/.test(n) ? "Manicura / uñas" :
      /spa|massage|masaje/.test(n) ? "Spa / masajes" :
      /tattoo|tatuaje/.test(n) ? "Tatuajes" :
      "Centro de estética";
    return { category: "Servicios personales", subcategory: inferred };
  }
  if (/\b(auto|motos?|motor|taller|garage|car|bike|bici|biciclet|neumatic|rent a car)\b/.test(n)) {
    const inferred =
      /bike|bici|biciclet/.test(n) ? "Bicicletas" :
      /rent a car/.test(n) ? "Alquiler de vehículos" :
      /taller|garage|neumatic/.test(n) ? "Taller de automoción" :
      "Automoción y movilidad";
    return { category: "Movilidad y automoción", subcategory: inferred };
  }
  if (/\b(colegio|school|escola|academy|academia|idiomas|language|universit|college|educa|formacion)\b/.test(n)) {
    const inferred =
      /idiomas|language/.test(n) ? "Academia de idiomas" :
      /universit|college/.test(n) ? "Educación superior" :
      /academy|academia|formacion/.test(n) ? "Academia / formación" :
      "Centro educativo";
    return { category: "Educación", subcategory: inferred };
  }
  if (/\b(inmobiliaria|inmobiliari|fincas|real estate|abogados?|law|gestoria|consult|arquitect|enginy|ingenier|imprenta|printing|cowork|marketing|seguros?)\b/.test(n)) {
    const inferred =
      /inmobiliaria|inmobiliari|fincas|real estate/.test(n) ? "Servicios inmobiliarios" :
      /abogados?|law/.test(n) ? "Servicios jurídicos" :
      /gestoria/.test(n) ? "Gestoría" :
      /arquitect|enginy|ingenier/.test(n) ? "Arquitectura / ingeniería" :
      /imprenta|printing/.test(n) ? "Imprenta / impresión" :
      /cowork/.test(n) ? "Coworking" :
      /seguros?/.test(n) ? "Seguros" :
      "Servicios profesionales";
    return { category: "Servicios profesionales y empresariales", subcategory: inferred };
  }

  if (/(restaurant|tapas_bar|(^|_)bar$|cafe|coffee_shop)/.test(t)) {
    return { category: "Restauración", subcategory };
  }
  if (/(hotel|hostel|lodging|guest_house|vacation_rental|apartment_hotel)/.test(t)) {
    return { category: "Alojamiento turístico", subcategory };
  }
  if (/(pharmacy|clinic|medical|doctor|dent|physical_therapy|psycholog|optometr|eyewear|veterinar|animal_hospital|hospital|health)/.test(t)) {
    return { category: "Salud y bienestar", subcategory };
  }
  if (/(school|university|college|education|language_school|preschool|kindergarten|tutor|academy)/.test(t)) {
    return { category: "Educación", subcategory };
  }
  if (/(bank|credit_union|atm|insurance|financial_service|mortgage)/.test(t)) {
    return { category: "Servicios financieros", subcategory };
  }
  if (/(gas_station|automotive|auto_dealer|car_dealer|car_repair|bike_store|bicycle_store|tire_shop|car_wash)/.test(t)) {
    return { category: "Movilidad y automoción", subcategory };
  }
  if (/(gym|fitness|sport|martial_arts|theatre|theater|cinema|arts_and_entertainment|dance|bowling|night_club|casino|recreation)/.test(t)) {
    return { category: "Ocio, cultura y deporte", subcategory };
  }
  if (/(beauty_salon|hair_salon|barber|spa|massage|nail_salon|tattoo|laundry|dry_clean|tailor)/.test(t)) {
    return { category: "Servicios personales", subcategory };
  }
  if (/(professional_service|real_estate|legal|lawyer|account|consult|printing_service|construction|contractor|architect|engineering|electrician|plumber|it_service|computer_service|travel_service|event_planning|marketing|advertising|employment_agency)/.test(t)) {
    return { category: "Servicios profesionales y empresariales", subcategory };
  }
  if (/(shipping_or_delivery|post_office|courier|parcel)/.test(t)) {
    return { category: "Otros servicios", subcategory };
  }
  if (/(store$|shop$|retail|grocery|supermarket|clothing|hardware|furniture_store|florist|flowers|butcher|bakery|market$|mobile_phone|electronics|jewelry|shoe_store|book_store|toy_store|pet_store|convenience)/.test(t)) {
    return { category: "Comercio minorista", subcategory };
  }
  return null;
}

function distanceMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function namesMatch(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return Math.min(na.length, nb.length) >= 6 && (na.includes(nb) || nb.includes(na));
}

async function mergeOverturePlaces(osmPois, boundary) {
  let collection;
  try {
    collection = JSON.parse(await readFile(join(dataDir, "overture_places_castelldefels.geojson"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { features: osmPois, stats: { overture_candidates: 0, overture_added: 0, overture_merged: 0 } };
    throw error;
  }

  const features = osmPois.map((feature) => structuredClone(feature));
  let added = 0;
  let merged = 0;
  let rejected = 0;

  for (const candidate of collection.features ?? []) {
    const p = candidate.properties ?? {};
    const classification = classifyOverturePlace(p.taxonomy, p.name);
    const confidence = Number(p.confidence ?? 0);
    if (!classification || confidence < 0.85 || candidate.geometry?.type !== "Point") {
      rejected += 1;
      continue;
    }
    if (!pointInFeature(candidate.geometry.coordinates, boundary)) {
      rejected += 1;
      continue;
    }

    const candidateName = String(p.name ?? "").trim();
    if (!candidateName) {
      rejected += 1;
      continue;
    }

    let duplicate = null;
    let unnamedNearby = null;
    for (const existing of features) {
      const d = distanceMeters(existing.geometry.coordinates, candidate.geometry.coordinates);
      if (d > 140) continue;
      const ep = existing.properties;
      if (namesMatch(ep.name ?? ep.display_name, candidateName) && d <= 120) {
        duplicate = existing;
        break;
      }
      if (!ep.name && ep.category === classification.category && d <= 25) {
        unnamedNearby = existing;
      }
    }

    const match = duplicate ?? unnamedNearby;
    if (match) {
      const mp = match.properties;
      if (!mp.name && confidence >= 0.9) {
        mp.name = candidateName;
        mp.display_name = candidateName;
        mp.name_source = "Overture Maps Places";
      }
      mp.sources = [...new Set([...(mp.sources ?? [mp.source]), "Overture Maps Places"].filter(Boolean))];
      mp.overture_id = mp.overture_id ?? p.id;
      mp.overture_confidence = Math.max(Number(mp.overture_confidence ?? 0), confidence);
      merged += 1;
      continue;
    }

    features.push({
      type: "Feature",
      geometry: candidate.geometry,
      properties: {
        osm_id: null,
        overture_id: p.id,
        name: candidateName,
        display_name: candidateName,
        category: classification.category,
        subcategory: classification.subcategory,
        primary_tag: `overture=${p.taxonomy}`,
        source: "Overture Maps Places",
        sources: ["Overture Maps Places"],
        name_source: "Overture Maps Places",
        overture_taxonomy: p.taxonomy,
        overture_confidence: confidence,
      },
    });
    added += 1;
  }

  return {
    features: features.sort(sortByCategoryThenName),
    stats: {
      overture_candidates: collection.features?.length ?? 0,
      overture_added: added,
      overture_merged: merged,
      overture_rejected: rejected,
    },
  };
}

const PANORAMAX_MAX_DISTANCE_M=40;
const PANORAMAX_BUCKET_DEGREES=0.001;

function panoramaxBucketKey([lon,lat]){
  return `${Math.floor(lon/PANORAMAX_BUCKET_DEGREES)}:${Math.floor(lat/PANORAMAX_BUCKET_DEGREES)}`;
}

function buildPanoramaxIndex(images){
  const index=new Map();
  for(const image of images){
    if(image.geometry?.type!=="Point"||!image.properties?.thumbnail_url)continue;
    const key=panoramaxBucketKey(image.geometry.coordinates);
    if(!index.has(key))index.set(key,[]);
    index.get(key).push(image);
  }
  return index;
}

function nearbyPanoramaxCandidates(index,[lon,lat]){
  const x=Math.floor(lon/PANORAMAX_BUCKET_DEGREES);
  const y=Math.floor(lat/PANORAMAX_BUCKET_DEGREES);
  const candidates=[];
  for(let dx=-1;dx<=1;dx+=1){
    for(let dy=-1;dy<=1;dy+=1){
      candidates.push(...(index.get(`${x+dx}:${y+dy}`)??[]));
    }
  }
  return candidates;
}

function panoramaxMatchScore(distance,capturedAt){
  const captured=Date.parse(capturedAt??"");
  if(!Number.isFinite(captured))return distance+8;
  const ageYears=Math.max(0,(Date.now()-captured)/(365.25*24*60*60*1000));
  return distance+Math.min(ageYears*1.5,12);
}

async function enrichWithPanoramax(features){
  let collection;
  try{
    collection=JSON.parse(await readFile(join(dataDir,"panoramax_castelldefels.geojson"),"utf8"));
  }catch(error){
    if(error.code==="ENOENT")return {matched:0,available:0};
    throw error;
  }

  const images=collection.features??[];
  const index=buildPanoramaxIndex(images);
  let matched=0;
  for(const feature of features){
    let best=null;
    let bestDistance=Infinity;
    let bestScore=Infinity;
    for(const image of nearbyPanoramaxCandidates(index,feature.geometry.coordinates)){
      const distance=distanceMeters(feature.geometry.coordinates,image.geometry.coordinates);
      if(distance>PANORAMAX_MAX_DISTANCE_M)continue;
      const score=panoramaxMatchScore(distance,image.properties?.captured_at);
      if(score<bestScore){
        best=image;
        bestDistance=distance;
        bestScore=score;
      }
    }
    if(!best)continue;
    const p=feature.properties;
    const ip=best.properties??{};
    p.panoramax_id=ip.id??null;
    p.panoramax_thumbnail_url=ip.thumbnail_url??null;
    p.panoramax_visual_url=ip.visual_url??ip.thumbnail_url??null;
    p.panoramax_captured_at=ip.captured_at??null;
    p.panoramax_distance_m=Number(bestDistance.toFixed(1));
    p.panoramax_license=ip.license??null;
    p.panoramax_providers=ip.providers??[];
    p.panoramax_instance_name=ip.instance_name??null;
    p.panoramax_instance_url=ip.instance_url??null;
    matched+=1;
  }
  return {matched,available:images.length,max_distance_m:PANORAMAX_MAX_DISTANCE_M};
}

function sortByCategoryThenName(a, b) {
  const categoryDiff =
    CATEGORY_ORDER.indexOf(a.properties.category) - CATEGORY_ORDER.indexOf(b.properties.category);

  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  return a.properties.display_name.localeCompare(b.properties.display_name, "es");
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
        density_label: count === 0 ? "Sin actividades observadas" : `${count} actividad${count === 1 ? "" : "es"} observada${count === 1 ? "" : "s"}`,
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
    source_counts: {
      osm_only: pois.filter((feature) => feature.properties.osm_id && !feature.properties.overture_id).length,
      overture_only: pois.filter((feature) => !feature.properties.osm_id && feature.properties.overture_id).length,
      merged: pois.filter((feature) => feature.properties.osm_id && feature.properties.overture_id).length,
    },
    overture_merge: provenance.overtureStats ?? null,
    panoramax_imagery: provenance.panoramaxStats ?? null,
    media_coverage: {
      explicit_osm_media_reference: pois.filter((feature) => Boolean(feature.properties.image || feature.properties.wikimedia_commons || feature.properties.mapillary)).length,
      panoramax_environment: pois.filter((feature) => Boolean(feature.properties.panoramax_thumbnail_url)).length,
    },
    top_cells: topCells,
    limitations: [
      "Las actividades proceden de fuentes abiertas y no equivalen al Censo de Actividades Económicas municipal.",
      "OpenStreetMap y Overture Maps pueden contener omisiones, duplicados, cierres no reflejados o clasificaciones imperfectas.",
      "La integración OSM/Overture usa reglas reproducibles de categoría, confianza, nombre y proximidad; no constituye validación administrativa.",
      "Las imágenes Panoramax se muestran como contexto de calle cuando la captura queda a 40 m o menos; no se presentan como fotografía verificada de la fachada salvo que exista un enlace explícito en la fuente.",
      "La malla de 500 m resume concentración de actividades observadas, no densidad económica, empleo, facturación ni afluencia real.",
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
      overture: {
        name: "Overture Maps Places",
        release: "2026-09-23.1",
        license: "CDLA Permissive 2.0 / Apache 2.0 según fuente",
        attribution: "Overture Maps Foundation and upstream Places providers",
        url: "https://docs.overturemaps.org/guides/places/",
      },
      panoramax: {
        name: "Panoramax federated catalog",
        license: "Solo imágenes con licencia abierta allowlisted durante la ingesta",
        attribution: "Autor/proveedor, licencia, fecha y distancia conservados por imagen",
        url: "https://api.panoramax.xyz/",
        max_match_distance_m: PANORAMAX_MAX_DISTANCE_M,
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
  const osmOutput = { type: "FeatureCollection", features: pois };
  const overtureMerge = await mergeOverturePlaces(pois, boundary);
  const activitiesOutput = { type: "FeatureCollection", features: overtureMerge.features };
  provenance.overtureStats = overtureMerge.stats;
  provenance.panoramaxStats = await enrichWithPanoramax(activitiesOutput.features);
  const gridOutput = createGrid(boundary, activitiesOutput.features);
  const summary = buildSummary(
    boundary,
    activitiesOutput.features,
    gridOutput,
    endpoint,
    overpassQuery,
    provenance,
  );

  await writeJson(join(dataDir, "castelldefels_boundary.geojson"), boundaryOutput);
  await writeJson(join(dataDir, "osm_pois_castelldefels.geojson"), osmOutput);
  await writeJson(join(dataDir, "activities_castelldefels.geojson"), activitiesOutput);
  await writeJson(join(dataDir, "poi_grid_500m.geojson"), gridOutput);
  await writeJson(join(dataDir, "summary.json"), summary);
  await writeFile(join(dataDir, "overpass-query.txt"), `${overpassQuery}\n`, "utf8");
  await writeFile(
    join(webJsDir, "data.js"),
    `window.SIG_DATA = ${JSON.stringify({
      boundary: boundaryOutput,
      pois: activitiesOutput,
      grid: gridOutput,
      summary,
    })};\n`,
    "utf8",
  );

  console.log(`Boundary: ${boundary.properties.NOMMUNI}`);
  console.log(`OSM activities: ${pois.length}`);
  console.log(`Combined activities: ${activitiesOutput.features.length}`);
  console.log(`Overture added: ${overtureMerge.stats.overture_added}`);
  console.log(`Overture merged: ${overtureMerge.stats.overture_merged}`);
  console.log(`Grid cells: ${gridOutput.features.length}`);
  console.log(`Overpass endpoint: ${endpoint}`);
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export { buildOverpassQuery, fetchOverpass, getBbox, pointInFeature, elementToPoi, sortByCategoryThenName };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
