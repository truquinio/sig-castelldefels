const CATEGORY_COLORS={
"Comercio minorista":"#d66b37",Restauración:"#118a72","Alojamiento turístico":"#ad7d20",
"Salud y bienestar":"#c74b5d",Educación:"#347da7","Servicios financieros":"#496ca5",
"Movilidad y automoción":"#936b43","Ocio, cultura y deporte":"#825b93","Servicios personales":"#ad567f",
"Servicios profesionales y empresariales":"#6d5aa2","Otros servicios":"#71808a"
};
const GRID_COLORS=["#e8f1f2","#cde4e2","#a8d4cf","#77bdb3","#3f9f92","#167d72"];
const baseData=window.SIG_DATA;
const currentYear=new Date().getFullYear();
const state={mode:"points",dimension:"2d",query:"",category:"__all__",year:currentYear,features:baseData.pois.features,source_scope:"current-combined",statsTotal:null};
let historyIndex={years:[]};
let map3dController=null;
let map3dLoading=null;
const historyCache=new Map();

const map=L.map("map",{zoomControl:false,preferCanvas:true});
L.control.zoom({position:"topright"}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const boundaryLayer=L.geoJSON(baseData.boundary,{style:{color:"#0d6b86",weight:2.2,opacity:.95,fillColor:"#0d6b86",fillOpacity:.025}}).addTo(map);
const gridLayer=L.geoJSON(null,{style:gridStyle,onEachFeature:bindGridPopup});
const poiLayer=L.geoJSON(null,{pointToLayer(feature,latlng){return L.circleMarker(latlng,{radius:5,stroke:true,weight:1,color:"#fff",fillColor:getCategoryColor(feature.properties.category),fillOpacity:.9});},onEachFeature:bindPoiPopup});
map.fitBounds(boundaryLayer.getBounds(),{padding:[24,24]});

setup();
async function setup(){
  configureTimeline();
  buildCategorySelect();
  bindControls();
  await loadHistoryIndex();
  render();
  if(window.lucide)window.lucide.createIcons();
}

function configureTimeline(){
  const slider=document.querySelector("#year-slider");
  slider.min=String(currentYear-10);slider.max=String(currentYear);slider.value=String(currentYear);
  document.querySelector("#year-min").textContent=String(currentYear-10);
  document.querySelector("#year-max").textContent=String(currentYear);
  document.querySelector("#year-value").textContent=String(currentYear);
}

async function loadHistoryIndex(){
  try{
    const response=await fetch("./history/index.json",{cache:"no-cache"});
    if(!response.ok)throw new Error(String(response.status));
    historyIndex=await response.json();
    drawHistoryChart();
  }catch(error){
    historyIndex={years:[]};
    document.querySelector("#timeline-help").textContent="Histórico cartográfico todavía no generado; el inventario actual sigue disponible.";
    drawHistoryChart();
  }
}

function getCategoryColor(category){return CATEGORY_COLORS[category]??"#6f98b6";}
function getActiveCategories(){
  const counts=new Map();
  for(const f of state.features){const c=f.properties.category??"Otros servicios";counts.set(c,(counts.get(c)??0)+1);}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
}
function buildCategorySelect(){
  const select=document.querySelector("#category-select");
  const previous=state.category;
  select.innerHTML='<option value="__all__">Todas las categorías</option>';
  for(const [category] of getActiveCategories()){
    const option=document.createElement("option");option.value=category;option.textContent=category;select.append(option);
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;else{state.category="__all__";select.value="__all__";}
}

function bindControls(){
  document.querySelector("#fit-map").addEventListener("click",()=>state.dimension==="3d"&&map3dController?map3dController.fitBoundary():map.fitBounds(boundaryLayer.getBounds(),{padding:[24,24]}));
  document.querySelector("#download-filtered").addEventListener("click",downloadFilteredGeojson);
  document.querySelector("#search-input").addEventListener("input",e=>{state.query=e.target.value.trim().toLowerCase();render();});
  document.querySelector("#category-select").addEventListener("change",e=>{state.category=e.target.value;render();});
  document.querySelector("#reset-filters").addEventListener("click",()=>{state.query="";state.category="__all__";document.querySelector("#search-input").value="";document.querySelector("#category-select").value="__all__";render();});
  document.querySelectorAll("[data-dimension]").forEach(button=>button.addEventListener("click",()=>switchMapDimension(button.dataset.dimension)));
  document.querySelectorAll(".segment").forEach(button=>button.addEventListener("click",()=>{state.mode=button.dataset.mode;document.querySelectorAll(".segment").forEach(item=>{const active=item===button;item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active));});render();}));
  document.querySelector("#year-slider").addEventListener("input",e=>selectYear(Number(e.target.value)));
  document.querySelectorAll("[data-section-target]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("is-active"));button.classList.add("is-active");const target=button.dataset.sectionTarget==="map"?"map-section":button.dataset.sectionTarget;document.querySelector("#"+target)?.scrollIntoView({behavior:"smooth",block:"start"});}));
}

async function selectYear(year){
  state.year=year;
  document.querySelector("#year-value").textContent=String(year);
  document.querySelector("#metric-year").textContent=String(year);
  const status=document.querySelector("#data-status");
  if(year===currentYear){
    state.features=baseData.pois.features;state.source_scope="current-combined";state.statsTotal=null;
    setHistoricalControlAvailability(true);
    status.innerHTML='<span class="status-dot"></span>Datos cargados';
    setScopeLabels();
    buildCategorySelect();render();return;
  }
  const entry=historyIndex.years?.find(item=>item.year===year);
  if(!entry){
    state.features=[];state.source_scope="historical-unavailable";state.statsTotal=null;
    setHistoricalControlAvailability(false);
    status.innerHTML='<span class="status-dot"></span>Sin histórico';
    setScopeLabels();buildCategorySelect();render();return;
  }
  if(entry.available===false&&Number.isFinite(entry.total)){
    state.features=[];state.source_scope="historical-stats";state.statsTotal=entry.total;
    state.query="";state.category="__all__";
    document.querySelector("#search-input").value="";
    setHistoricalControlAvailability(false);
    status.innerHTML='<span class="status-dot"></span>Histórico estadístico';
    setScopeLabels();buildCategorySelect();render();return;
  }
  if(entry.available===false){
    state.features=[];state.source_scope="historical-unavailable";state.statsTotal=null;
    setHistoricalControlAvailability(false);
    status.innerHTML='<span class="status-dot"></span>Sin snapshot';
    setScopeLabels();buildCategorySelect();render();return;
  }
  status.innerHTML='<span class="status-dot"></span>Cargando histórico…';
  try{
    let collection=historyCache.get(year);
    if(!collection){
      const response=await fetch(entry.file??`./history/${year}.geojson`);
      if(!response.ok)throw new Error(String(response.status));
      collection=await response.json();historyCache.set(year,collection);
    }
    state.features=collection.features??[];state.source_scope="historical-osm";state.statsTotal=null;
    setHistoricalControlAvailability(true);
    status.innerHTML='<span class="status-dot"></span>Histórico cargado';
  }catch(error){
    console.error(error);state.features=[];state.source_scope=Number.isFinite(entry.total)?"historical-stats":"historical-unavailable";state.statsTotal=Number.isFinite(entry.total)?entry.total:null;
    setHistoricalControlAvailability(false);
    status.innerHTML='<span class="status-dot"></span>Error histórico';
  }
  setScopeLabels();buildCategorySelect();render();
}

function setScopeLabels(){
  const current=state.source_scope==="current-combined";
  const statsOnly=state.source_scope==="historical-stats";
  const unavailable=state.source_scope==="historical-unavailable";
  document.querySelector("#history-scope").textContent=current?"Actual · OSM + Overture":statsOnly?"Histórico OSM · resumen anual":unavailable?"Sin histórico disponible":"Histórico · OpenStreetMap";
  document.querySelector("#metric-source-scope").textContent=current?"Inventario combinado actual":statsOnly?"Conteo histórico OSM":unavailable?"Sin datos cartográficos":"Snapshot histórico OSM";
  document.querySelector("#metric-total-note").textContent=current?"OSM + Overture deduplicado":statsOnly?"OSM al cierre del año":unavailable?"No disponible para este año":"OSM observado en ese año";
  document.querySelector("#timeline-help").textContent=current?"El año actual muestra el inventario combinado OSM + Overture. La serie anterior corresponde a OSM histórico.":statsOnly?"Resumen histórico OSM del año seleccionado. Las variaciones describen cambios en lo cartografiado, no aperturas o cierres administrativos.":unavailable?"No hay datos históricos disponibles para este año.":"Snapshot OSM histórico: representa lo cartografiado en la fuente, no un censo administrativo.";
  const mapStatus=document.querySelector("#map-status");
  if(statsOnly)mapStatus.textContent="";
  else if(unavailable)mapStatus.textContent=`Año ${state.year}: histórico no disponible.`;
  else if(state.dimension==="2d")mapStatus.textContent="";
}

function setHistoricalControlAvailability(enabled){
  document.querySelector("#search-input").disabled=!enabled;
  document.querySelector("#category-select").disabled=!enabled;
  document.querySelector("#reset-filters").disabled=!enabled;
  document.querySelectorAll(".segment").forEach(button=>button.disabled=!enabled);
  document.querySelectorAll("[data-dimension]").forEach(button=>button.disabled=!enabled);
  if(!enabled&&state.dimension!=="2d"){
    state.dimension="2d";
    document.querySelector("#map-3d").hidden=true;
    document.querySelector("#map").hidden=false;
    updateDimensionButtons();
    requestAnimationFrame(()=>map.invalidateSize());
  }
}

function render(){
  const filtered=getFilteredPois();
  const filteredGrid=buildFilteredGrid(filtered);
  const showPoints=state.mode==="points"||state.mode==="mixed";
  const showGrid=state.mode==="grid"||state.mode==="mixed";
  poiLayer.clearLayers();gridLayer.clearLayers();
  if(showGrid){gridLayer.addData(filteredGrid);if(!map.hasLayer(gridLayer))gridLayer.addTo(map);}else if(map.hasLayer(gridLayer))map.removeLayer(gridLayer);
  if(showPoints){poiLayer.addData({type:"FeatureCollection",features:filtered});if(!map.hasLayer(poiLayer))poiLayer.addTo(map);}else if(map.hasLayer(poiLayer))map.removeLayer(poiLayer);
  boundaryLayer.bringToFront();if(showPoints)poiLayer.bringToFront();
  if(state.dimension==="3d"&&map3dController)map3dController.setActivities(filtered);
  updateHistoricalSummary();
  updateDashboard(filtered);
  drawCategoryChart(filtered);
}

function getFilteredPois(){
  return state.features.filter(feature=>{
    const p=feature.properties??{};
    const text=`${p.display_name??""} ${p.name??""} ${p.category??""} ${p.subcategory??""} ${p.primary_tag??""}`.toLowerCase();
    return (state.category==="__all__"||p.category===state.category)&&(!state.query||text.includes(state.query));
  });
}

function updateHistoricalSummary(){
  const summary=document.querySelector("#historical-summary");
  const statsOnly=state.source_scope==="historical-stats";
  summary.hidden=!statsOnly;
  if(!statsOnly)return;

  const rows=(historyIndex.years??[]).filter(item=>Number.isFinite(item.total)&&item.year<currentYear).sort((a,b)=>a.year-b.year);
  const current=rows.find(item=>item.year===state.year);
  const previous=rows.find(item=>item.year===state.year-1);
  const first=rows[0];
  document.querySelector("#history-summary-year").textContent=String(state.year);
  document.querySelector("#history-selected-total").textContent=formatNumber(current?.total??state.statsTotal??0);

  const yoy=current&&previous&&previous.total?((current.total-previous.total)/previous.total)*100:null;
  const since=current&&first&&first.total?((current.total-first.total)/first.total)*100:null;
  document.querySelector("#history-yoy").textContent=yoy===null?"—":formatDelta(yoy);
  document.querySelector("#history-since-start").textContent=since===null?"—":formatDelta(since);

  const selectedRows=rows.filter(item=>item.year<=state.year);
  const max=Math.max(1,...selectedRows.map(item=>item.total));
  document.querySelector("#history-mini-chart").innerHTML=selectedRows.length>1
    ? `<svg viewBox="0 0 560 140" role="img" aria-label="Evolución hasta ${state.year}">${buildHistoryPolyline(selectedRows,560,140,max)}</svg>`
    : "";
}

function buildHistoryPolyline(rows,width,height,max){
  const pad=18;
  const minYear=rows[0].year,maxYear=rows.at(-1).year;
  const x=year=>pad+(year-minYear)/Math.max(1,maxYear-minYear)*(width-pad*2);
  const y=value=>height-pad-(value/max)*(height-pad*2);
  const points=rows.map(row=>`${x(row.year)},${y(row.total)}`).join(" ");
  const dots=rows.map(row=>`<circle cx="${x(row.year)}" cy="${y(row.total)}" r="4" fill="#fff" stroke="#0d6b86" stroke-width="2"/><text x="${x(row.year)}" y="${height-3}" text-anchor="middle" fill="#60717d" font-size="9">${String(row.year).slice(2)}</text>`).join("");
  return `<line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#d6e1e6"/><polyline points="${points}" fill="none" stroke="#0d6b86" stroke-width="3"/>${dots}`;
}

function formatDelta(value){
  const rounded=Math.round(value*10)/10;
  return `${rounded>0?"+":""}${formatNumber(rounded)}%`;
}

function updateDashboard(filtered){
  const statsOnly=state.source_scope==="historical-stats";
  const displayedTotal=statsOnly&&Number.isFinite(state.statsTotal)?state.statsTotal:filtered.length;
  document.querySelector("#metric-total").textContent=formatNumber(displayedTotal);
  document.querySelector("#map-count").textContent=statsOnly?"Resumen histórico":`${formatNumber(filtered.length)} visibles`;
  document.querySelector("#metric-year").textContent=String(state.year);

  const counts=countByCategory(filtered);const top=counts[0];
  document.querySelector("#metric-top-category").textContent=statsOnly?"—":(top?.[0]??"—");
  document.querySelector("#metric-top-category-note").textContent=statsOnly?"Sin desglose histórico":top?`${formatNumber(top[1])} actividades`:"Sin resultados";

  const named=filtered.filter(hasExplicitName).length;const pct=filtered.length?Math.round(named/filtered.length*100):0;
  document.querySelector("#metric-named").textContent=statsOnly?"—":`${pct}%`;
  document.querySelector("#metric-named-note").textContent=statsOnly?"No disponible por año":`${formatNumber(named)} de ${formatNumber(filtered.length)}`;

  const merged=baseData.summary?.source_counts?.merged??0;
  const combined=baseData.summary?.total_pois??0;
  const multiPct=combined?Math.round(merged/combined*100):0;
  document.querySelector("#metric-multisource").textContent=statsOnly?"—":`${multiPct}%`;
  document.querySelector("#metric-multisource-note").textContent=statsOnly?"Sólo histórico OSM":`${formatNumber(merged)} corroboradas por ambas fuentes`;

  const topCell=baseData.summary?.top_cells?.[0];
  document.querySelector("#metric-hot-cell").textContent=statsOnly?"—":formatNumber(topCell?.count??0);
  document.querySelector("#metric-hot-cell-note").textContent=statsOnly?"Sin geometría histórica":topCell?`Celda ${topCell.id} · ${topCell.top_category}`:"Sin datos";

  document.querySelector("#quality-named").textContent=statsOnly?"—":formatNumber(named);
  document.querySelector("#quality-unnamed").textContent=statsOnly?"—":formatNumber(Math.max(0,filtered.length-named));
  const sourceCount=new Set(filtered.flatMap(f=>f.properties?.sources??[f.properties?.source].filter(Boolean))).size;
  document.querySelector("#quality-sources").textContent=statsOnly?"OSM":formatNumber(sourceCount);
  document.querySelector("#quality-other").textContent=statsOnly?"—":formatNumber(filtered.filter(f=>f.properties?.category==="Otros servicios").length);
}
function hasExplicitName(feature){const p=feature.properties??{};const n=(p.name??"").trim();return Boolean(n&&!/^sin nombre$/i.test(n)&&!/ sin nombre$/i.test(n));}
function countByCategory(features){const m=new Map();for(const f of features){const c=f.properties?.category??"Otros servicios";m.set(c,(m.get(c)??0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);}
function drawCategoryChart(features){
  const container=document.querySelector("#category-chart");
  if(state.source_scope==="historical-stats"){
    const rows=(historyIndex.years??[]).filter(item=>Number.isFinite(item.total)&&item.year<currentYear).sort((a,b)=>a.year-b.year);
    const current=rows.find(item=>item.year===state.year);
    const previous=rows.find(item=>item.year===state.year-1);
    const change=current&&previous?current.total-previous.total:null;
    container.innerHTML=`<div class="historical-side">
      <div class="historical-side-item"><span>Total OSM ${state.year}</span><strong>${formatNumber(current?.total??state.statsTotal??0)}</strong></div>
      <div class="historical-side-item"><span>Cambio vs. ${state.year-1}</span><strong>${change===null?"—":`${change>0?"+":""}${formatNumber(change)}`}</strong></div>
      <div class="historical-side-note">El desglose por categoría necesita geometría histórica completa. El total anual sí está verificado.</div>
    </div>`;
    return;
  }
  const counts=countByCategory(features);const max=Math.max(1,...counts.map(x=>x[1]));
  container.innerHTML=counts.map(([category,count])=>`<button class="bar-row ${state.category===category?"is-active":""}" type="button" data-chart-category="${escapeHtml(category)}"><span class="bar-label">${escapeHtml(category)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(2,count/max*100)}%;background:${getCategoryColor(category)}"></span></span><span class="bar-value">${formatNumber(count)}</span></button>`).join("")||'<div class="timeline-help">Sin actividades para los filtros actuales.</div>';
  container.querySelectorAll("[data-chart-category]").forEach(button=>button.addEventListener("click",()=>{state.category=state.category===button.dataset.chartCategory?"__all__":button.dataset.chartCategory;document.querySelector("#category-select").value=state.category;render();}));
}
function drawHistoryChart(){
  const container=document.querySelector("#history-chart");
  const rows=(historyIndex.years??[]).filter(x=>Number.isFinite(x.total)&&x.year<currentYear).sort((a,b)=>a.year-b.year);
  const currentCombined=(historyIndex.years??[]).find(x=>x.year===currentYear&&Number.isFinite(x.total));
  if(!rows.length){container.innerHTML='<div class="timeline-help">La serie histórica aparecerá cuando haya conteos anuales OSM.</div>';return;}
  const w=720,h=180,p=28,max=Math.max(1,...rows.map(x=>x.total)),minYear=rows[0].year,maxYear=rows.at(-1).year;
  const x=year=>p+(year-minYear)/Math.max(1,maxYear-minYear)*(w-p*2);const yy=value=>h-p-(value/max)*(h-p*2);
  const points=rows.map(r=>`${x(r.year)},${yy(r.total)}`).join(" ");
  const dots=rows.map(r=>`<circle class="history-point" cx="${x(r.year)}" cy="${yy(r.total)}" r="4"/><text class="history-label" x="${x(r.year)}" y="${h-6}" text-anchor="middle">${String(r.year).slice(2)}</text>`).join("");
  const latest=rows.at(-1);
  container.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución anual de registros OpenStreetMap 2016 a ${latest.year}"><defs><linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d6b86" stop-opacity=".18"/><stop offset="100%" stop-color="#0d6b86" stop-opacity="0"/></linearGradient></defs><line class="history-axis" x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><polygon class="history-area" points="${p},${h-p} ${points} ${w-p},${h-p}"/><polyline class="history-line" points="${points}"/>${dots}</svg><div class="history-comparison"><strong>Serie comparable OSM: ${rows[0].year}–${latest.year}</strong><span>${currentCombined?`${currentYear}: ${formatNumber(currentCombined.total)} registros en inventario combinado OSM + Overture; se muestra aparte porque no es directamente comparable.`:""}</span></div>`;
}

function buildFilteredGrid(filtered){
  const cellCounts=new Map(),cellCategories=new Map();
  for(const f of filtered){
    let cellId=f.properties?.grid_id;
    if(!cellId)cellId=findGridCell(f.geometry.coordinates);
    if(!cellId)continue;
    const category=f.properties?.category??"Otros servicios";cellCounts.set(cellId,(cellCounts.get(cellId)??0)+1);
    if(!cellCategories.has(cellId))cellCategories.set(cellId,new Map());const m=cellCategories.get(cellId);m.set(category,(m.get(category)??0)+1);
  }
  const features=baseData.grid.features.map(cell=>{const count=cellCounts.get(cell.properties.id)??0;const breakdown=[...(cellCategories.get(cell.properties.id)??new Map()).entries()].sort((a,b)=>b[1]-a[1]).map(([category,value])=>({category,value}));return {...cell,properties:{...cell.properties,count,top_category:breakdown[0]?.category??null,category_breakdown:breakdown,rank:0}};});
  const max=Math.max(1,...features.map(f=>f.properties.count));for(const f of features)f.properties.rank=f.properties.count===0?0:Math.ceil(f.properties.count/max*5);return {type:"FeatureCollection",features};
}
function findGridCell(point){for(const cell of baseData.grid.features){if(pointInRing(point,cell.geometry.coordinates[0]))return cell.properties.id;}return null;}
function pointInRing([lon,lat],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const[xi,yi]=ring[i],[xj,yj]=ring[j];const hit=yi>lat!==yj>lat&&lon<((xj-xi)*(lat-yi))/(yj-yi+Number.EPSILON)+xi;if(hit)inside=!inside;}return inside;}
function gridStyle(feature){const rank=feature.properties.rank??0,count=feature.properties.count??0;return{color:count?"#d8f2ff":"#40617a",weight:count?1:.5,fillColor:GRID_COLORS[rank]??GRID_COLORS[0],fillOpacity:count?.7:.05,opacity:count?.9:.2};}
function bindGridPopup(feature,layer){const p=feature.properties;const rows=(p.category_breakdown??[]).slice(0,4).map(x=>`${escapeHtml(x.category)}: ${formatNumber(x.value)}`).join("<br>");layer.bindPopup(`<h2 class="popup-title">Celda ${escapeHtml(p.id)}</h2><p class="popup-meta">${formatNumber(p.count??0)} actividades visibles<br>${rows||"Sin registros"}</p>`);}
function bindPoiPopup(feature,layer){
  const p=feature.properties??{},sources=p.sources??[p.source].filter(Boolean);
  const links=[p.osm_id?`<a class="popup-link" href="https://www.openstreetmap.org/${escapeHtml(p.osm_id)}" target="_blank" rel="noreferrer">OpenStreetMap</a>`:"",p.overture_id?'<a class="popup-link" href="https://docs.overturemaps.org/guides/places/" target="_blank" rel="noreferrer">Overture Maps</a>':""].filter(Boolean).join(" · ");
  layer.bindPopup(`<h2 class="popup-title">${escapeHtml(p.display_name??p.name??p.subcategory??"Actividad")}</h2><p class="popup-meta"><strong>${escapeHtml(p.subcategory??p.category??"")}</strong><br>${escapeHtml(p.category??"")}<br><small>Fuente: ${escapeHtml(sources.join(" + ")||"OpenStreetMap histórico")}</small></p>${links}`);
}

async function switchMapDimension(dimension){
  if(dimension===state.dimension)return;const map2d=document.querySelector("#map"),map3d=document.querySelector("#map-3d"),status=document.querySelector("#map-status");
  if(dimension==="2d"){if(map3dController){const v=map3dController.getView();map.setView([v.center[1],v.center[0]],v.zoom,{animate:false});}state.dimension="2d";map3d.hidden=true;map2d.hidden=false;status.textContent="";updateDimensionButtons();requestAnimationFrame(()=>map.invalidateSize());return;}
  const probe=document.createElement("canvas");if(!(probe.getContext("webgl2")||probe.getContext("webgl"))){status.textContent="La vista 3D no está disponible. Se mantiene 2D.";return;}
  status.textContent="Cargando vista 3D…";
  try{if(!map3dController){const c=map.getCenter();map3dLoading??=import("./map3d.js").then(({createMap3D})=>createMap3D({container:map3d,data:baseData,center:[c.lng,c.lat],zoom:map.getZoom(),categoryColors:CATEGORY_COLORS}));map3dController=await map3dLoading;}else{const c=map.getCenter();map3dController.setView([c.lng,c.lat],map.getZoom());}state.dimension="3d";map2d.hidden=true;map3d.hidden=false;map3dController.setActivities(getFilteredPois());map3dController.resize();status.textContent="3D contextual de edificios; las métricas siguen siendo del inventario seleccionado.";updateDimensionButtons();}catch(error){console.error(error);map3dLoading=null;status.textContent="No se pudo cargar 3D. El visor 2D sigue disponible.";}
}
function updateDimensionButtons(){document.querySelectorAll("[data-dimension]").forEach(button=>{const active=button.dataset.dimension===state.dimension;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});}
function downloadFilteredGeojson(){const collection={type:"FeatureCollection",name:`actividades_castelldefels_${state.year}`,features:getFilteredPois()};const blob=new Blob([JSON.stringify(collection,null,2)],{type:"application/geo+json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`actividades_castelldefels_${state.year}.geojson`;a.click();URL.revokeObjectURL(url);}
function formatNumber(v){return new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(v??0);}
function escapeHtml(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
