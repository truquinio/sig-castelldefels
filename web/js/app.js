const CATEGORY_COLORS={
  "Comercio minorista":"#d66b37",
  "Restauración":"#118a72",
  "Alojamiento turístico":"#ad7d20",
  "Salud y bienestar":"#c74b5d",
  "Educación":"#347da7",
  "Servicios financieros":"#496ca5",
  "Movilidad y automoción":"#936b43",
  "Ocio, cultura y deporte":"#825b93",
  "Servicios personales":"#ad567f",
  "Servicios profesionales y empresariales":"#6d5aa2",
  "Otros servicios":"#71808a"
};
const GRID_COLORS=["#edf4f4","#d4e8e5","#afd6d0","#79bdb3","#43a092","#167d72"];
const baseData=window.SIG_DATA;
const currentYear=new Date().getFullYear();
const state={mode:"points",dimension:"2d",query:"",category:"__all__"};
let map3dController=null;
let map3dLoading=null;
let historyIndex={years:[]};

const map=L.map("map",{zoomControl:false,preferCanvas:true});
L.control.zoom({position:"bottomright"}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const boundaryLayer=L.geoJSON(baseData.boundary,{
  style:{color:"#0d6b86",weight:2.2,opacity:.95,fillColor:"#0d6b86",fillOpacity:.025}
}).addTo(map);
const gridLayer=L.geoJSON(null,{style:gridStyle,onEachFeature:bindGridPopup});
const poiLayer=L.geoJSON(null,{
  pointToLayer(feature,latlng){
    return L.circleMarker(latlng,{
      radius:5,
      stroke:true,
      weight:1.2,
      color:"#fff",
      fillColor:getCategoryColor(feature.properties.category),
      fillOpacity:.92
    });
  },
  onEachFeature:bindEstablishmentPopup
});
map.fitBounds(boundaryLayer.getBounds(),{padding:[24,24]});

setup();
registerServiceWorker();

async function registerServiceWorker(){
  if(!("serviceWorker" in navigator))return;
  try{
    await navigator.serviceWorker.register("./sw.js",{scope:"./"});
  }catch(error){
    console.warn("Service worker no disponible",error);
  }
}

async function setup(){
  buildCategorySelect();
  bindControls();
  render();
  await loadHistory();
  if(window.lucide)window.lucide.createIcons();
}

function bindControls(){
  document.querySelector("#download-filtered").addEventListener("click",downloadFilteredGeojson);
  document.querySelector("#search-input").addEventListener("input",event=>{
    state.query=event.target.value.trim().toLowerCase();
    render();
  });
  document.querySelector("#category-select").addEventListener("change",event=>{
    state.category=event.target.value;
    render();
  });
  document.querySelector("#reset-filters").addEventListener("click",()=>{
    state.query="";
    state.category="__all__";
    document.querySelector("#search-input").value="";
    document.querySelector("#category-select").value="__all__";
    render();
  });
  document.querySelector("#fit-map").addEventListener("click",()=>{
    if(state.dimension==="3d"&&map3dController)map3dController.fitBoundary();
    else map.fitBounds(boundaryLayer.getBounds(),{padding:[24,24]});
  });
  document.querySelectorAll("[data-dimension]").forEach(button=>{
    button.addEventListener("click",()=>switchMapDimension(button.dataset.dimension));
  });
  document.querySelectorAll(".segment").forEach(button=>{
    button.addEventListener("click",()=>{
      state.mode=button.dataset.mode;
      document.querySelectorAll(".segment").forEach(item=>{
        const active=item===button;
        item.classList.toggle("is-active",active);
        item.setAttribute("aria-pressed",String(active));
      });
      render();
    });
  });
  document.querySelectorAll("[data-section-target]").forEach(button=>{
    button.addEventListener("click",()=>{
      document.querySelectorAll(".nav-item").forEach(item=>{
        item.classList.remove("is-active");
        item.removeAttribute("aria-current");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-current","page");
      document.querySelector("#"+button.dataset.sectionTarget)?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
}

function buildCategorySelect(){
  const counts=countByCategory(baseData.pois.features);
  const select=document.querySelector("#category-select");
  for(const [category] of counts){
    const option=document.createElement("option");
    option.value=category;
    option.textContent=category;
    select.append(option);
  }
}

function render(){
  const filtered=getFilteredEstablishments();
  const filteredGrid=buildFilteredGrid(filtered);
  const showPoints=state.mode==="points"||state.mode==="mixed";
  const showGrid=state.mode==="grid"||state.mode==="mixed";

  poiLayer.clearLayers();
  gridLayer.clearLayers();

  if(showGrid){
    gridLayer.addData(filteredGrid);
    if(!map.hasLayer(gridLayer))gridLayer.addTo(map);
  }else if(map.hasLayer(gridLayer)){
    map.removeLayer(gridLayer);
  }

  if(showPoints){
    poiLayer.addData({type:"FeatureCollection",features:filtered});
    if(!map.hasLayer(poiLayer))poiLayer.addTo(map);
  }else if(map.hasLayer(poiLayer)){
    map.removeLayer(poiLayer);
  }

  boundaryLayer.bringToFront();
  if(showPoints)poiLayer.bringToFront();
  if(state.dimension==="3d"&&map3dController)map3dController.setActivities(filtered);

  updateDashboard(filtered,filteredGrid);
  drawCategoryChart(filtered);
}

function getFilteredEstablishments(){
  return baseData.pois.features.filter(feature=>{
    const p=feature.properties??{};
    const text=`${p.display_name??""} ${p.name??""} ${p.category??""} ${p.subcategory??""} ${p.primary_tag??""}`.toLowerCase();
    return (state.category==="__all__"||p.category===state.category)&&(!state.query||text.includes(state.query));
  });
}

function updateDashboard(filtered,filteredGrid){
  document.querySelector("#metric-total").textContent=formatNumber(filtered.length);
  document.querySelector("#map-count").textContent=`${formatNumber(filtered.length)} visibles`;

  const named=filtered.filter(hasExplicitName).length;
  const namedPct=filtered.length?Math.round(named/filtered.length*100):0;
  document.querySelector("#metric-named").textContent=`${namedPct}%`;
  document.querySelector("#metric-named-note").textContent=`${formatNumber(named)} de ${formatNumber(filtered.length)}`;

  const top=countByCategory(filtered)[0];
  document.querySelector("#metric-top-category").textContent=top?.[0]??"—";
  document.querySelector("#metric-top-category-note").textContent=top?`${formatNumber(top[1])} establecimientos`:"Sin resultados";

  const topCell=[...filteredGrid.features].sort((a,b)=>(b.properties.count??0)-(a.properties.count??0))[0];
  document.querySelector("#metric-hot-cell").textContent=topCell?.properties.count?formatNumber(topCell.properties.count):"—";
  document.querySelector("#metric-hot-cell-note").textContent=topCell?.properties.count
    ? `Zona de 500 × 500 m · ${topCell.properties.top_category??"sin sector dominante"}`
    : "Sin concentración para el filtro";

  const sourceCounts=getSourceCounts(filtered);
  document.querySelector("#quality-merged").textContent=formatNumber(sourceCounts.merged);
  document.querySelector("#quality-osm").textContent=formatNumber(sourceCounts.osm);
  document.querySelector("#quality-overture").textContent=formatNumber(sourceCounts.overture);
  document.querySelector("#quality-unnamed").textContent=formatNumber(filtered.length-named);
}

function getSourceCounts(features){
  return features.reduce((acc,feature)=>{
    const state=getReconciliationState(feature.properties??{});
    if(state.key==="merged")acc.merged+=1;
    if(state.key==="osm")acc.osm+=1;
    if(state.key==="overture")acc.overture+=1;
    return acc;
  },{merged:0,osm:0,overture:0});
}

function getReconciliationState(properties){
  const hasOsm=Boolean(properties.osm_id);
  const hasOverture=Boolean(properties.overture_id);
  if(hasOsm&&hasOverture)return {key:"merged",label:"Fuentes: OpenStreetMap + Overture Maps",tone:"good"};
  if(hasOsm)return {key:"osm",label:"Fuente: OpenStreetMap",tone:"neutral"};
  if(hasOverture)return {key:"overture",label:"Fuente: Overture Maps",tone:"neutral"};
  return {key:"unknown",label:"Fuente abierta no identificada",tone:"warning"};
}

function hasExplicitName(feature){
  const p=feature.properties??{};
  const name=(p.name??"").trim();
  return Boolean(name&&!/^sin nombre$/i.test(name)&&!/ sin nombre$/i.test(name));
}

function countByCategory(features){
  const counts=new Map();
  for(const feature of features){
    const category=feature.properties?.category??"Otros servicios";
    counts.set(category,(counts.get(category)??0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
}

function drawCategoryChart(features){
  const container=document.querySelector("#category-chart");
  const counts=countByCategory(features);
  const max=Math.max(1,...counts.map(([,count])=>count));
  container.innerHTML=counts.map(([category,count])=>`
    <button class="bar-row ${state.category===category?"is-active":""}" type="button" data-chart-category="${escapeHtml(category)}">
      <span class="bar-label">${escapeHtml(category)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2,count/max*100)}%;background:${getCategoryColor(category)}"></span></span>
      <span class="bar-value">${formatNumber(count)}</span>
    </button>
  `).join("")||'<div class="timeline-help">Sin establecimientos para los filtros actuales.</div>';

  container.querySelectorAll("[data-chart-category]").forEach(button=>{
    button.addEventListener("click",()=>{
      state.category=state.category===button.dataset.chartCategory?"__all__":button.dataset.chartCategory;
      document.querySelector("#category-select").value=state.category;
      render();
    });
  });
}

async function loadHistory(){
  try{
    const response=await fetch("./history/index.json",{cache:"no-cache"});
    if(!response.ok)throw new Error(String(response.status));
    historyIndex=await response.json();
    drawHistoryChart();
  }catch(error){
    console.error("No se pudo cargar el histórico",error);
    document.querySelector("#history-chart").innerHTML='<div class="timeline-help">Histórico no disponible.</div>';
  }
}

function drawHistoryChart(){
  const container=document.querySelector("#history-chart");
  const rows=(historyIndex.years??[])
    .filter(item=>Number.isFinite(item.total)&&item.year<currentYear)
    .sort((a,b)=>a.year-b.year);

  if(rows.length<2){
    container.innerHTML='<div class="timeline-help">Serie histórica insuficiente.</div>';
    return;
  }

  const width=720,height=180,pad=30;
  const max=Math.max(...rows.map(item=>item.total));
  const minYear=rows[0].year,maxYear=rows.at(-1).year;
  const x=year=>pad+(year-minYear)/Math.max(1,maxYear-minYear)*(width-pad*2);
  const y=value=>height-pad-(value/max)*(height-pad*2);
  const points=rows.map(item=>`${x(item.year)},${y(item.total)}`).join(" ");
  const dots=rows.map(item=>`
    <circle class="history-point" cx="${x(item.year)}" cy="${y(item.total)}" r="4">
      <title>${item.year}: ${formatNumber(item.total)} registros OSM</title>
    </circle>
    <text class="history-label" x="${x(item.year)}" y="${height-7}" text-anchor="middle">${String(item.year).slice(2)}</text>
  `).join("");

  const first=rows[0],last=rows.at(-1);
  const growth=first.total?((last.total-first.total)/first.total)*100:0;
  container.innerHTML=`
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Serie comparable OSM ${first.year} a ${last.year}">
      <defs><linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d6b86" stop-opacity=".18"/><stop offset="100%" stop-color="#0d6b86" stop-opacity="0"/></linearGradient></defs>
      <line class="history-axis" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/>
      <polygon class="history-area" points="${pad},${height-pad} ${points} ${width-pad},${height-pad}"/>
      <polyline class="history-line" points="${points}"/>
      ${dots}
    </svg>
    <div class="history-comparison">
      <strong>Serie comparable OSM: ${first.year}–${last.year}</strong>
      <span>${formatNumber(first.total)} → ${formatNumber(last.total)} registros observados · ${growth>=0?"+":""}${formatNumber(growth)}%. El inventario ${currentYear} combina OSM + Overture y se analiza aparte.</span>
    </div>`;
}

function getCategoryColor(category){
  return CATEGORY_COLORS[category]??"#71808a";
}

function buildFilteredGrid(filtered){
  const cellCounts=new Map();
  const cellCategories=new Map();

  for(const feature of filtered){
    let cellId=feature.properties?.grid_id;
    if(!cellId)cellId=findGridCell(feature.geometry.coordinates);
    if(!cellId)continue;

    const category=feature.properties?.category??"Otros servicios";
    cellCounts.set(cellId,(cellCounts.get(cellId)??0)+1);
    if(!cellCategories.has(cellId))cellCategories.set(cellId,new Map());
    const categories=cellCategories.get(cellId);
    categories.set(category,(categories.get(category)??0)+1);
  }

  const features=baseData.grid.features.map(cell=>{
    const count=cellCounts.get(cell.properties.id)??0;
    const breakdown=[...(cellCategories.get(cell.properties.id)??new Map()).entries()]
      .sort((a,b)=>b[1]-a[1])
      .map(([category,value])=>({category,value}));
    return {
      ...cell,
      properties:{
        ...cell.properties,
        count,
        top_category:breakdown[0]?.category??null,
        category_breakdown:breakdown,
        rank:0
      }
    };
  });

  const max=Math.max(1,...features.map(feature=>feature.properties.count));
  for(const feature of features){
    feature.properties.rank=feature.properties.count===0?0:Math.ceil(feature.properties.count/max*5);
  }
  return {type:"FeatureCollection",features};
}

function findGridCell(point){
  for(const cell of baseData.grid.features){
    if(pointInRing(point,cell.geometry.coordinates[0]))return cell.properties.id;
  }
  return null;
}

function pointInRing([lon,lat],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const hit=yi>lat!==yj>lat&&lon<((xj-xi)*(lat-yi))/(yj-yi+Number.EPSILON)+xi;
    if(hit)inside=!inside;
  }
  return inside;
}

function gridStyle(feature){
  const rank=feature.properties.rank??0;
  const count=feature.properties.count??0;
  return {
    color:count?"#6d969c":"#b8c8cc",
    weight:count?1:.5,
    fillColor:GRID_COLORS[rank]??GRID_COLORS[0],
    fillOpacity:count?.72:.04,
    opacity:count?.9:.2
  };
}

function bindGridPopup(feature,layer){
  const p=feature.properties;
  const rows=(p.category_breakdown??[]).slice(0,5)
    .map(item=>`${escapeHtml(item.category)}: ${formatNumber(item.value)}`)
    .join("<br>");
  layer.bindPopup(`
    <div class="establishment-popup">
      <div class="popup-body">
        <div class="popup-eyebrow">Análisis territorial</div>
        <h2 class="popup-title">Zona de 500 × 500 m</h2>
        <p class="popup-meta"><strong>${formatNumber(p.count??0)} establecimientos observados</strong></p>
        <div class="popup-source-block">
          <strong>Distribución por sector</strong>
          <div class="popup-meta">${rows||"Sin establecimientos observados"}</div>
        </div>
        <details class="technical-details">
          <summary>Detalles técnicos</summary>
          <dl class="popup-details"><div><dt>ID de cuadrícula</dt><dd>${escapeHtml(p.id)}</dd></div></dl>
        </details>
      </div>
    </div>`);
}

function safeHttpUrl(value){
  try{
    const url=new URL(String(value??""));
    return ["http:","https:"].includes(url.protocol)?url.href:null;
  }catch{
    return null;
  }
}

function resolveEstablishmentMedia(feature){
  const p=feature.properties??{};
  const commons=String(p.wikimedia_commons??"").trim();
  const image=String(p.image??"").trim();
  const mapillary=String(p.mapillary??"").trim();

  const commonsValue=commons||(/^File:/i.test(image)?image:"");
  if(/^File:/i.test(commonsValue)){
    const filename=commonsValue.replace(/^File:/i,"").trim();
    const encoded=encodeURIComponent(filename.replace(/ /g,"_"));
    return {
      kind:"image",
      src:`https://commons.wikimedia.org/wiki/Special:Redirect/file/${encoded}?width=720`,
      href:`https://commons.wikimedia.org/wiki/File:${encoded}`,
      label:"Wikimedia Commons",
      caption:"Imagen vinculada en Wikimedia Commons"
    };
  }

  const direct=safeHttpUrl(image);
  if(direct&&/\.(?:jpe?g|png|webp|avif)(?:$|[?#])/i.test(direct)){
    return {
      kind:"image",
      src:direct,
      href:direct,
      label:"OpenStreetMap",
      caption:"Imagen vinculada en OpenStreetMap"
    };
  }

  if(mapillary){
    const key=encodeURIComponent(mapillary);
    return {
      kind:"embed",
      src:`https://www.mapillary.com/embed?map_style=Mapillary%20streets&image_key=${key}&style=photo`,
      href:`https://www.mapillary.com/app/?pKey=${key}`,
      label:"Mapillary",
      caption:"Imagen vinculada en Mapillary"
    };
  }

  const panoramaxThumb=safeHttpUrl(p.panoramax_thumbnail_url);
  const panoramaxVisual=safeHttpUrl(p.panoramax_visual_url)??panoramaxThumb;
  if(panoramaxThumb){
    const captured=p.panoramax_captured_at?new Date(p.panoramax_captured_at):null;
    const dateLabel=captured&&!Number.isNaN(captured.getTime())
      ? new Intl.DateTimeFormat("es-ES",{year:"numeric",month:"short"}).format(captured)
      : null;
    const distance=Number(p.panoramax_distance_m);
    const distanceLabel=Number.isFinite(distance)?`${Math.round(distance)} m`:null;
    const providers=Array.isArray(p.panoramax_providers)?p.panoramax_providers.filter(Boolean):[];
    const attribution=[dateLabel,distanceLabel,providers[0],p.panoramax_license].filter(Boolean).join(" · ");
    return {
      kind:"image",
      src:panoramaxThumb,
      href:panoramaxVisual,
      label:"Panoramax",
      caption:`Imagen de entorno${attribution?` · ${attribution}`:""}`
    };
  }

  const [lon,lat]=feature.geometry?.coordinates??[];
  const environmentUrl=Number.isFinite(lon)&&Number.isFinite(lat)
    ? `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=19`
    : "https://www.mapillary.com/app/";
  return {
    kind:"fallback",
    href:environmentUrl,
    label:"Mapillary",
    caption:"Sin foto abierta vinculada"
  };
}

function renderMediaFallback(feature){
  const [lon,lat]=feature.geometry?.coordinates??[];
  const href=Number.isFinite(lon)&&Number.isFinite(lat)
    ? `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=19`
    : "https://www.mapillary.com/app/";
  return `
    <div class="establishment-media media-fallback">
      <div class="media-fallback-mark" aria-hidden="true">▧</div>
      <strong>Sin foto abierta vinculada</strong>
      <span>No se muestra una fachada que no podamos atribuir al establecimiento.</span>
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Explorar imágenes de calle</a>
    </div>`;
}

function renderEstablishmentMedia(feature,title){
  const media=resolveEstablishmentMedia(feature);
  if(media.kind==="image"){
    return `
      <figure class="establishment-media">
        <a href="${escapeHtml(media.href)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.caption.startsWith("Imagen de entorno")?`Imagen de entorno próxima a ${title}`:`Imagen vinculada de ${title}`)}" loading="lazy" decoding="async" />
        </a>
        <figcaption>${escapeHtml(media.caption)} · ${escapeHtml(media.label)}</figcaption>
      </figure>`;
  }
  if(media.kind==="embed"){
    return `
      <figure class="establishment-media">
        <iframe src="${escapeHtml(media.src)}" title="Imagen vinculada de ${escapeHtml(title)} en Mapillary" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <figcaption><a href="${escapeHtml(media.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(media.caption)} · ${escapeHtml(media.label)}</a></figcaption>
      </figure>`;
  }
  return renderMediaFallback(feature);
}

function formatAddress(properties){
  const line=[properties.addr_street,properties.addr_housenumber].filter(Boolean).map(escapeHtml).join(" ");
  const locality=[properties.addr_postcode,properties.addr_city].filter(Boolean).map(escapeHtml).join(" · ");
  return [line,locality].filter(Boolean).join("<br>");
}

function bindEstablishmentPopup(feature,layer){
  const p=feature.properties??{};
  const reconciliation=getReconciliationState(p);
  const title=p.display_name??p.name??p.subcategory??"Actividad sin identificar";
  const sourceLinks=[];
  if(p.osm_id){
    sourceLinks.push(`<a class="popup-link" href="https://www.openstreetmap.org/${escapeHtml(p.osm_id)}" target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap</a>`);
  }
  if(p.overture_id){
    sourceLinks.push('<a class="popup-link" href="https://docs.overturemaps.org/guides/places/" target="_blank" rel="noopener noreferrer">Acerca de Overture Maps</a>');
  }
  const website=safeHttpUrl(p.website);
  if(website){
    sourceLinks.push(`<a class="popup-link" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Sitio web</a>`);
  }

  const address=formatAddress(p);
  const technicalRows=[
    p.grid_id?`<div><dt>Cuadrícula analítica</dt><dd>500 × 500 m · ID ${escapeHtml(p.grid_id)}</dd></div>`:"",
    p.osm_id?`<div><dt>ID OpenStreetMap</dt><dd>${escapeHtml(p.osm_id)}</dd></div>`:"",
    p.overture_id?`<div><dt>Identificador Overture Maps</dt><dd>${escapeHtml(p.overture_id)}</dd></div>`:""
  ].filter(Boolean).join("");

  layer.bindPopup(`
    <article class="establishment-popup">
      ${renderEstablishmentMedia(feature,title)}
      <div class="popup-body">
        <div class="popup-eyebrow">Ficha de actividad económica</div>
        <h2 class="popup-title">${escapeHtml(title)}</h2>

        <dl class="popup-classification">
          <div><dt>Tipo de actividad</dt><dd>${escapeHtml(p.subcategory??"Tipo no especificado")}</dd></div>
          <div><dt>Sector</dt><dd>${escapeHtml(p.category??"Sector no clasificado")}</dd></div>
        </dl>

        <div class="reconciliation-badge ${reconciliation.tone}">${escapeHtml(reconciliation.label)}</div>

        <dl class="popup-details">
          ${address?`<div><dt>Dirección</dt><dd>${address}</dd></div>`:""}
          ${p.phone?`<div><dt>Teléfono</dt><dd>${escapeHtml(p.phone)}</dd></div>`:""}
          ${p.opening_hours?`<div><dt>Horario publicado</dt><dd>${escapeHtml(p.opening_hours)}</dd></div>`:""}
        </dl>

        ${sourceLinks.length?`<div class="popup-source-block"><strong>Fuentes y enlaces</strong><div class="popup-links">${sourceLinks.join(" · ")}</div></div>`:""}

        ${technicalRows?`
          <details class="technical-details">
            <summary>Detalles técnicos</summary>
            <dl class="popup-details">${technicalRows}</dl>
          </details>`:""}

        <small class="popup-disclaimer">Datos de fuentes abiertas. Esta ficha no equivale a un registro, licencia ni expediente municipal.</small>
      </div>
    </article>`,{maxWidth:390,minWidth:250});

  layer.on("popupopen",event=>{
    const root=event.popup.getElement();
    const image=root?.querySelector(".establishment-media img");
    if(!image)return;
    const replaceBrokenImage=()=>{
      const media=image.closest(".establishment-media");
      if(media)media.outerHTML=renderMediaFallback(feature);
    };
    image.addEventListener("error",replaceBrokenImage,{once:true});
    if(image.complete&&!image.naturalWidth)replaceBrokenImage();
  });
}

async function switchMapDimension(dimension){
  if(dimension===state.dimension)return;
  const map2d=document.querySelector("#map");
  const map3d=document.querySelector("#map-3d");
  const status=document.querySelector("#map-status");

  if(dimension==="2d"){
    if(map3dController){
      const view=map3dController.getView();
      map.setView([view.center[1],view.center[0]],view.zoom,{animate:false});
    }
    state.dimension="2d";
    map3d.hidden=true;
    map2d.hidden=false;
    status.textContent="";
    updateDimensionButtons();
    requestAnimationFrame(()=>map.invalidateSize());
    return;
  }

  const probe=document.createElement("canvas");
  if(!(probe.getContext("webgl2")||probe.getContext("webgl"))){
    status.textContent="La vista 3D no está disponible en este dispositivo.";
    return;
  }

  status.textContent="Cargando contexto 3D…";
  try{
    if(!map3dController){
      const center=map.getCenter();
      map3dLoading??=import("./map3d.js").then(({createMap3D})=>createMap3D({
        container:map3d,
        data:baseData,
        center:[center.lng,center.lat],
        zoom:map.getZoom(),
        categoryColors:CATEGORY_COLORS
      }));
      map3dController=await map3dLoading;
    }else{
      const center=map.getCenter();
      map3dController.setView([center.lng,center.lat],map.getZoom());
    }
    state.dimension="3d";
    map2d.hidden=true;
    map3d.hidden=false;
    map3dController.setActivities(getFilteredEstablishments());
    map3dController.resize();
    status.textContent="3D contextual de edificios; no modifica el inventario ni su clasificación.";
    updateDimensionButtons();
  }catch(error){
    console.error(error);
    map3dLoading=null;
    status.textContent="No se pudo cargar 3D. El mapa 2D sigue disponible.";
  }
}

function updateDimensionButtons(){
  document.querySelectorAll("[data-dimension]").forEach(button=>{
    const active=button.dataset.dimension===state.dimension;
    button.classList.toggle("is-active",active);
    button.setAttribute("aria-pressed",String(active));
  });
}

function downloadFilteredGeojson(){
  const collection={
    type:"FeatureCollection",
    name:`establecimientos_observados_castelldefels_${currentYear}`,
    properties:{
      scope:"Fuentes abiertas; no censo administrativo municipal",
      generated_from:"SIG Castelldefels"
    },
    features:getFilteredEstablishments()
  };
  const blob=new Blob([JSON.stringify(collection,null,2)],{type:"application/geo+json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=`establecimientos_observados_castelldefels_${currentYear}.geojson`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value){
  return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(value??0);
}

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
