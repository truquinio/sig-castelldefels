const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";
const MAPLIBRE_MODULE = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const VECTOR_URL = "https://tiles.openfreemap.org/planet";

const MAQUETTE = Object.freeze({
  background: "#f2f2ee",
  water: "#cadde3",
  green: "#dce5d4",
  land: "#ebece7",
  road: "#c6c9c9",
  roadMajor: "#b6bbbc",
  boundary: "#8e9899",
  label: "#4f5a5d",
  halo: "#f4f4f1",
  buildingLow: "#eee9e1",
  buildingMid: "#dcd6cd",
  buildingHigh: "#c8c1b8",
  buildingTall: "#b5ada3",
  buildingEdge: "#8f8a83",
});

function ensureStylesheet() {
  if (document.querySelector('link[data-maplibre-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS;
  link.dataset.maplibreCss = "true";
  document.head.append(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safePaint(map, layerId, property, value) {
  try {
    map.setPaintProperty(layerId, property, value);
  } catch {
    // Third-party base styles can omit optional paint properties.
  }
}

function applyMaquetteBaseStyle(map) {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    const id = layer.id.toLowerCase();

    if (layer.type === "background") {
      safePaint(map, layer.id, "background-color", MAQUETTE.background);
      continue;
    }

    if (layer.type === "fill") {
      if (/water|ocean|lake|river/.test(id)) {
        safePaint(map, layer.id, "fill-color", MAQUETTE.water);
        safePaint(map, layer.id, "fill-opacity", 0.9);
      } else if (/park|forest|wood|grass|garden|green|landcover/.test(id)) {
        safePaint(map, layer.id, "fill-color", MAQUETTE.green);
        safePaint(map, layer.id, "fill-opacity", 0.78);
      } else if (/industrial|commercial|residential|landuse/.test(id)) {
        safePaint(map, layer.id, "fill-color", MAQUETTE.land);
        safePaint(map, layer.id, "fill-opacity", 0.58);
      } else if (/building/.test(id)) {
        safePaint(map, layer.id, "fill-color", MAQUETTE.buildingLow);
        safePaint(map, layer.id, "fill-opacity", 0.42);
      }
      continue;
    }

    if (layer.type === "line") {
      if (/motorway|trunk|primary/.test(id)) {
        safePaint(map, layer.id, "line-color", MAQUETTE.roadMajor);
        safePaint(map, layer.id, "line-opacity", 0.84);
      } else if (/road|highway|street|transport/.test(id)) {
        safePaint(map, layer.id, "line-color", MAQUETTE.road);
        safePaint(map, layer.id, "line-opacity", 0.78);
      } else if (/boundary/.test(id)) {
        safePaint(map, layer.id, "line-color", MAQUETTE.boundary);
        safePaint(map, layer.id, "line-opacity", 0.36);
      }
      continue;
    }

    if (layer.type === "symbol") {
      safePaint(map, layer.id, "text-color", MAQUETTE.label);
      safePaint(map, layer.id, "text-halo-color", MAQUETTE.halo);
      safePaint(map, layer.id, "text-halo-width", 0.9);
      safePaint(map, layer.id, "text-opacity", 0.72);
      safePaint(map, layer.id, "icon-opacity", 0.62);
    }
  }

  if (typeof map.setLight === "function") {
    map.setLight({
      anchor: "viewport",
      color: "#ffffff",
      intensity: 0.46,
      position: [1.15, 210, 36],
    });
  }
}

function buildingColorExpression() {
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", "render_height"], 8],
    0, MAQUETTE.buildingLow,
    12, MAQUETTE.buildingMid,
    30, MAQUETTE.buildingHigh,
    60, MAQUETTE.buildingTall,
  ];
}

export async function createMap3D({ container, data, center, zoom, categoryColors = {} }) {
  ensureStylesheet();
  const maplibregl = await import(MAPLIBRE_MODULE);
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center,
    zoom: Math.max(14, zoom),
    pitch: 52,
    bearing: -22,
    canvasContextAttributes: { antialias: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  await new Promise((resolve, reject) => {
    map.once("load", resolve);
    map.once("error", (event) => reject(event.error ?? new Error("No se pudo cargar el mapa 3D")));
  });

  applyMaquetteBaseStyle(map);

  const labelLayerId = map
    .getStyle()
    .layers?.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

  if (!map.getSource("openfreemap-3d")) {
    map.addSource("openfreemap-3d", { type: "vector", url: VECTOR_URL });
  }

  map.addLayer(
    {
      id: "3d-building-footprints",
      source: "openfreemap-3d",
      "source-layer": "building",
      type: "line",
      minzoom: 15,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "line-color": MAQUETTE.buildingEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.35, 18, 0.8],
        "line-opacity": 0.34,
      },
    },
    labelLayerId,
  );

  map.addLayer(
    {
      id: "3d-buildings",
      source: "openfreemap-3d",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 15,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": buildingColorExpression(),
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.94,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    labelLayerId,
  );

  map.addSource("sig-boundary", { type: "geojson", data: data.boundary });
  map.addLayer({
    id: "sig-boundary-line",
    type: "line",
    source: "sig-boundary",
    paint: {
      "line-color": "#0d6b86",
      "line-width": 2.2,
      "line-opacity": 0.8,
    },
  });

  const categoryColorExpression = [
    "match",
    ["get", "category"],
    ...Object.entries(categoryColors).flatMap(([category, color]) => [category, color]),
    "#52605a",
  ];

  map.addSource("sig-activities", { type: "geojson", data: data.pois });

  map.addLayer({
    id: "sig-activities-halo",
    type: "circle",
    source: "sig-activities",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 5, 17, 9],
      "circle-color": "#ffffff",
      "circle-opacity": 0.74,
      "circle-blur": 0.16,
    },
  });

  map.addLayer({
    id: "sig-activities",
    type: "circle",
    source: "sig-activities",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 6.5],
      "circle-color": categoryColorExpression,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
      "circle-opacity": 0.95,
    },
  });

  map.on("mouseenter", "sig-activities", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "sig-activities", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "sig-activities", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = feature.properties ?? {};
    const sourceLabel = Array.isArray(props.sources)
      ? props.sources.join(" + ")
      : (props.source ?? "Fuente abierta");

    new maplibregl.Popup({ offset: 14 })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(
        `<strong>${escapeHtml(props.display_name ?? props.name ?? props.subcategory)}</strong><br>` +
        `<span>${escapeHtml(props.subcategory ?? props.category)}</span><br>` +
        `<small>${escapeHtml(props.category)} · ${escapeHtml(sourceLabel)}</small>`
      )
      .addTo(map);
  });

  return {
    map,
    setActivities(features) {
      const collection = { type: "FeatureCollection", features };
      map.getSource("sig-activities")?.setData(collection);
    },
    setView(nextCenter, nextZoom) {
      map.jumpTo({ center: nextCenter, zoom: Math.max(14, nextZoom) });
    },
    getView() {
      const current = map.getCenter();
      return { center: [current.lng, current.lat], zoom: map.getZoom() };
    },
    fitBoundary() {
      const coords = data.boundary.features.flatMap((feature) => {
        const geometry = feature.geometry;
        if (geometry.type === "Polygon") return geometry.coordinates.flat(1);
        if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
        return [];
      });
      const bounds = coords.reduce(
        (acc, coord) => acc.extend(coord),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 42, pitch: 48, bearing: -18, duration: 500 });
    },
    resize() { map.resize(); },
    destroy() { map.remove(); },
  };
}
