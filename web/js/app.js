const CATEGORY_COLORS = {
  Comercio: "#c65a3b",
  Restauración: "#0f766e",
  Alojamiento: "#8b6f2f",
  "Servicios financieros": "#355c7d",
  Salud: "#b23a48",
  Educación: "#326fa8",
  "Automoción y movilidad": "#7a5c3e",
  Ocio: "#8a4f7d",
  Oficinas: "#6a4c93",
  "Otros servicios": "#6f7672",
};

const GRID_COLORS = ["#edf4ef", "#cde7d8", "#8fc8b0", "#43a084", "#0f766e", "#0f463f"];

const data = window.SIG_DATA;
const categories = data.summary.categories.map((entry) => entry.category);
const state = {
  mode: "points",
  dimension: "2d",
  selectedCategories: new Set(categories),
  query: "",
};

let map3dController = null;
let map3dLoading = null;

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true,
});

L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const boundaryLayer = L.geoJSON(data.boundary, {
  style: {
    color: "#0f463f",
    weight: 2,
    opacity: 0.95,
    fillOpacity: 0.03,
  },
}).addTo(map);

const gridLayer = L.geoJSON(null, {
  style: gridStyle,
  onEachFeature: bindGridPopup,
});

const poiLayer = L.geoJSON(null, {
  pointToLayer(feature, latlng) {
    return L.circleMarker(latlng, {
      radius: 5,
      stroke: true,
      weight: 1,
      color: "#ffffff",
      fillColor: getCategoryColor(feature.properties.category),
      fillOpacity: 0.86,
    });
  },
  onEachFeature: bindPoiPopup,
});

map.fitBounds(boundaryLayer.getBounds(), { padding: [24, 24] });

buildCategoryControls();
bindControls();
render();

if (window.lucide) {
  window.lucide.createIcons();
}

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] ?? "#52605a";
}

function gridStyle(feature) {
  const rank = feature.properties.rank ?? 0;
  const count = feature.properties.count ?? 0;

  return {
    color: count ? "#ffffff" : "#9aa69f",
    weight: count ? 1 : 0.6,
    fillColor: GRID_COLORS[rank] ?? GRID_COLORS[0],
    fillOpacity: count ? 0.72 : 0.08,
    opacity: count ? 0.92 : 0.28,
  };
}

function bindPoiPopup(feature, layer) {
  const props = feature.properties;
  const osmUrl = `https://www.openstreetmap.org/${props.osm_id}`;

  layer.bindPopup(`
    <h2 class="popup-title">${escapeHtml(props.name)}</h2>
    <p class="popup-meta">
      ${escapeHtml(props.category)}<br />
      ${escapeHtml(props.primary_tag)}
    </p>
    <a class="popup-link" href="${osmUrl}" target="_blank" rel="noreferrer">OpenStreetMap</a>
  `);
}

function bindGridPopup(feature, layer) {
  const props = feature.properties;
  const breakdown = props.category_breakdown?.slice(0, 4) ?? [];
  const rows = breakdown
    .map((entry) => `${escapeHtml(entry.category)}: ${formatNumber(entry.value)}`)
    .join("<br />");

  layer.bindPopup(`
    <h2 class="popup-title">Celda ${escapeHtml(props.id)}</h2>
    <p class="popup-meta">
      ${formatNumber(props.count ?? 0)} punto${props.count === 1 ? "" : "s"} OSM<br />
      ${rows || "Sin puntos en la selección"}
    </p>
  `);
}

function buildCategoryControls() {
  const container = document.querySelector("#category-list");
  container.innerHTML = "";

  data.summary.categories.forEach((entry) => {
    const id = `category-${slugify(entry.category)}`;
    const row = document.createElement("label");
    row.className = "category-option";
    row.innerHTML = `
      <input id="${id}" type="checkbox" value="${escapeHtml(entry.category)}" checked />
      <span class="category-name">
        <span class="swatch" style="background:${getCategoryColor(entry.category)}"></span>
        ${escapeHtml(entry.category)}
      </span>
      <span class="category-count">${formatNumber(entry.count)}</span>
    `;
    container.append(row);
  });
}

function bindControls() {
  document.querySelector("#fit-map").addEventListener("click", () => {
    if (state.dimension === "3d" && map3dController) {
      map3dController.fitBoundary();
      return;
    }
    map.fitBounds(boundaryLayer.getBounds(), { padding: [24, 24] });
  });

  document.querySelectorAll("[data-dimension]").forEach((button) => {
    button.addEventListener("click", () => switchMapDimension(button.dataset.dimension));
  });

  document.querySelector("#download-filtered").addEventListener("click", downloadFilteredGeojson);

  document.querySelector("#search-input").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll(".segment").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      render();
    });
  });

  document.querySelector("#category-list").addEventListener("change", () => {
    state.selectedCategories = new Set(
      [...document.querySelectorAll("#category-list input:checked")].map((input) => input.value),
    );
    render();
  });

  document.querySelector("#select-all").addEventListener("click", () => {
    document.querySelectorAll("#category-list input").forEach((input) => {
      input.checked = true;
    });
    state.selectedCategories = new Set(categories);
    render();
  });

  document.querySelector("#clear-all").addEventListener("click", () => {
    document.querySelectorAll("#category-list input").forEach((input) => {
      input.checked = false;
    });
    state.selectedCategories = new Set();
    render();
  });
}

async function switchMapDimension(dimension) {
  if (dimension === state.dimension) return;

  const map2d = document.querySelector("#map");
  const map3d = document.querySelector("#map-3d");
  const status = document.querySelector("#map-status");

  if (dimension === "2d") {
    if (map3dController) {
      const view = map3dController.getView();
      map.setView([view.center[1], view.center[0]], view.zoom, { animate: false });
    }
    state.dimension = "2d";
    map3d.hidden = true;
    map2d.hidden = false;
    status.textContent = "";
    updateDimensionButtons();
    requestAnimationFrame(() => map.invalidateSize());
    return;
  }

  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) {
    status.textContent = "La vista 3D no está disponible en este dispositivo. Se mantiene el mapa 2D.";
    return;
  }

  status.textContent = "Cargando vista 3D…";
  try {
    if (!map3dController) {
      const center = map.getCenter();
      map3dLoading ??= import("./map3d.js").then(({ createMap3D }) =>
        createMap3D({
          container: map3d,
          data,
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
        }),
      );
      map3dController = await map3dLoading;
    } else {
      const center = map.getCenter();
      map3dController.setView([center.lng, center.lat], map.getZoom());
    }

    state.dimension = "3d";
    map2d.hidden = true;
    map3d.hidden = false;
    map3dController.setActivities(getFilteredPois());
    map3dController.resize();
    status.textContent = "Vista 3D: edificios de OpenStreetMap/OpenFreeMap como contexto visual.";
    updateDimensionButtons();
  } catch (error) {
    console.error("No se pudo iniciar la vista 3D", error);
    map3dLoading = null;
    status.textContent = "No se pudo cargar el 3D. El visor 2D continúa disponible.";
  }
}

function updateDimensionButtons() {
  document.querySelectorAll("[data-dimension]").forEach((button) => {
    const active = button.dataset.dimension === state.dimension;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function render() {
  const filteredPois = getFilteredPois();
  const filteredGrid = buildFilteredGrid(filteredPois);
  const showPoints = state.mode === "points" || state.mode === "mixed";
  const showGrid = state.mode === "grid" || state.mode === "mixed";

  poiLayer.clearLayers();
  gridLayer.clearLayers();

  if (showGrid) {
    gridLayer.addData(filteredGrid);
    if (!map.hasLayer(gridLayer)) {
      gridLayer.addTo(map);
    }
  } else if (map.hasLayer(gridLayer)) {
    map.removeLayer(gridLayer);
  }

  if (showPoints) {
    poiLayer.addData({ type: "FeatureCollection", features: filteredPois });
    if (!map.hasLayer(poiLayer)) {
      poiLayer.addTo(map);
    }
  } else if (map.hasLayer(poiLayer)) {
    map.removeLayer(poiLayer);
  }

  boundaryLayer.bringToFront();
  if (showPoints) {
    poiLayer.bringToFront();
  }

  if (state.dimension === "3d" && map3dController) {
    map3dController.setActivities(filteredPois);
  }

  updateMetrics(filteredPois);
  updateLegend(filteredPois, filteredGrid);
}

function getFilteredPois() {
  return data.pois.features.filter((feature) => {
    const props = feature.properties;
    const text = `${props.name} ${props.category} ${props.primary_tag}`.toLowerCase();

    return state.selectedCategories.has(props.category) && (!state.query || text.includes(state.query));
  });
}

function buildFilteredGrid(filteredPois) {
  const cellCounts = new Map();
  const cellCategories = new Map();

  filteredPois.forEach((feature) => {
    const cellId = feature.properties.grid_id;
    if (!cellId) {
      return;
    }

    const category = feature.properties.category;
    cellCounts.set(cellId, (cellCounts.get(cellId) ?? 0) + 1);

    if (!cellCategories.has(cellId)) {
      cellCategories.set(cellId, new Map());
    }

    const categoriesForCell = cellCategories.get(cellId);
    categoriesForCell.set(category, (categoriesForCell.get(category) ?? 0) + 1);
  });

  const features = data.grid.features.map((cell) => {
    const count = cellCounts.get(cell.properties.id) ?? 0;
    const categoryBreakdown = [...(cellCategories.get(cell.properties.id) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value]) => ({ category, value }));

    return {
      ...cell,
      properties: {
        ...cell.properties,
        count,
        top_category: categoryBreakdown[0]?.category ?? null,
        category_breakdown: categoryBreakdown,
        rank: 0,
      },
    };
  });

  const maxCount = Math.max(1, ...features.map((feature) => feature.properties.count));
  features.forEach((feature) => {
    feature.properties.rank =
      feature.properties.count === 0 ? 0 : Math.ceil((feature.properties.count / maxCount) * 5);
  });

  return { type: "FeatureCollection", features };
}

function updateMetrics(filteredPois) {
  document.querySelector("#metric-total").textContent = formatNumber(data.summary.total_pois);
  document.querySelector("#metric-filtered").textContent = formatNumber(filteredPois.length);
  document.querySelector("#metric-area").textContent = `${formatNumber(data.summary.area_km2_icgc)} km²`;
}

function updateLegend(filteredPois, filteredGrid) {
  const legend = document.querySelector("#legend");

  if (state.mode === "grid") {
    const max = Math.max(0, ...filteredGrid.features.map((feature) => feature.properties.count));
    legend.innerHTML = `
      <span class="legend-title">Malla 500 m</span>
      ${[0, 1, 2, 3, 4, 5]
        .map((rank) => {
          const label = rank === 0 ? "0" : rank === 5 ? `hasta ${formatNumber(max)}` : "intermedio";
          return `
            <div class="legend-row">
              <span class="legend-key"><span class="legend-box" style="background:${GRID_COLORS[rank]}"></span>Rango ${rank}</span>
              <span>${label}</span>
            </div>
          `;
        })
        .join("")}
    `;
    return;
  }

  const counts = new Map();
  filteredPois.forEach((feature) => {
    const category = feature.properties.category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });

  legend.innerHTML = `
    <span class="legend-title">Categorías visibles</span>
    ${categories
      .filter((category) => counts.has(category))
      .map(
        (category) => `
          <div class="legend-row">
            <span class="legend-key">
              <span class="legend-dot" style="background:${getCategoryColor(category)}"></span>
              ${escapeHtml(category)}
            </span>
            <span>${formatNumber(counts.get(category))}</span>
          </div>
        `,
      )
      .join("") || '<div class="legend-row">Sin resultados</div>'}
  `;
}

function downloadFilteredGeojson() {
  const collection = {
    type: "FeatureCollection",
    name: "osm_pois_castelldefels_filtrado",
    features: getFilteredPois(),
  };
  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "osm_pois_castelldefels_filtrado.geojson";
  link.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value ?? 0);
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
