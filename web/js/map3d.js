const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css";
const MAPLIBRE_MODULE = "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const VECTOR_URL = "https://tiles.openfreemap.org/planet";

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

export async function createMap3D({ container, data, center, zoom, categoryColors = {} }) {
  ensureStylesheet();
  const maplibregl = await import(MAPLIBRE_MODULE);
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center,
    zoom: Math.max(14, zoom),
    pitch: 50,
    bearing: -18,
    canvasContextAttributes: { antialias: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  await new Promise((resolve, reject) => {
    map.once("load", resolve);
    map.once("error", (event) => reject(event.error ?? new Error("No se pudo cargar el mapa 3D")));
  });

  const labelLayerId = map
    .getStyle()
    .layers?.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

  if (!map.getSource("openfreemap-3d")) {
    map.addSource("openfreemap-3d", { type: "vector", url: VECTOR_URL });
  }

  map.addLayer(
    {
      id: "3d-buildings",
      source: "openfreemap-3d",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 15,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": "#d8ddd9",
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.82,
      },
    },
    labelLayerId,
  );

  map.addSource("sig-boundary", { type: "geojson", data: data.boundary });
  map.addLayer({
    id: "sig-boundary-line",
    type: "line",
    source: "sig-boundary",
    paint: { "line-color": "#0f463f", "line-width": 2.5 },
  });
  const categoryColorExpression = [
    "match",
    ["get", "category"],
    ...Object.entries(categoryColors).flatMap(([category, color]) => [category, color]),
    "#52605a",
  ];

  map.addSource("sig-activities", { type: "geojson", data: data.pois });
  map.addLayer({
    id: "sig-activities",
    type: "circle",
    source: "sig-activities",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 7],
      "circle-color": categoryColorExpression,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.4,
      "circle-opacity": 0.92,
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
      map.getSource("sig-activities")?.setData({ type: "FeatureCollection", features });
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
      map.fitBounds(bounds, { padding: 42, pitch: 45, duration: 500 });
    },
    resize() { map.resize(); },
    destroy() { map.remove(); },
  };
}
