import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBbox,
  pointInFeature,
  elementToPoi,
  sortByCategoryThenName,
} from "./build-data.mjs";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir=join(root,"data");
const historyDir=join(root,"web","history");
const currentYear=new Date().getFullYear();
const defaultStart=currentYear-10;
const onlyYearArg=process.argv.find(arg=>arg.startsWith("--year="));
const onlyYear=onlyYearArg?Number(onlyYearArg.split("=")[1]):null;
const HISTORY_ENDPOINTS=[
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const SELECTORS=[
  '["amenity"~"^(restaurant|cafe|bar|pub|fast_food|pharmacy|bank|atm|clinic|doctors|dentist|hospital|school|kindergarten|post_office|fuel|charging_station|marketplace|theatre|cinema|arts_centre)$"]',
  '["shop"]',
  '["office"]',
  '["tourism"~"^(hotel|hostel|apartment|guest_house)$"]',
  '["leisure"="fitness_centre"]',
];

await mkdir(historyDir,{recursive:true});
const boundaryCollection=JSON.parse(await readFile(join(dataDir,"castelldefels_boundary.geojson"),"utf8"));
const boundary=boundaryCollection.features?.[0];
if(!boundary)throw new Error("No municipal boundary available.");
const bbox=getBbox(boundary);

function buildHistoricalQuery(selector,snapshotDate){
  const south=bbox.minLat.toFixed(6),west=bbox.minLon.toFixed(6),north=bbox.maxLat.toFixed(6),east=bbox.maxLon.toFixed(6);
  const box=`${south},${west},${north},${east}`;
  return `[out:json][timeout:60][date:"${snapshotDate}"];
(
  node${selector}(${box});
  way${selector}(${box});
  relation${selector}(${box});
);
out center tags;`;
}

async function fetchHistoricalQuery(query){
  let lastError;
  for(const endpoint of HISTORY_ENDPOINTS){
    try{
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"sig-castelldefels/0.3"},
        body:`data=${encodeURIComponent(query)}`,
        signal:AbortSignal.timeout(45_000),
      });
      if(!response.ok){
        const body=await response.text();
        throw new Error(`HTTP ${response.status}: ${body.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,180)}`);
      }
      return {payload:await response.json(),endpoint};
    }catch(error){
      lastError=error;
      console.warn(`  endpoint failed: ${endpoint} · ${error.message}`);
    }
  }
  throw lastError;
}

async function buildYear(year){
  const snapshotDate=`${year}-12-31T23:59:59Z`;
  const elements=[];
  let endpointUsed=null;
  for(let index=0;index<SELECTORS.length;index+=1){
    console.log(`  ${year}: group ${index+1}/${SELECTORS.length}`);
    const {payload,endpoint}=await fetchHistoricalQuery(buildHistoricalQuery(SELECTORS[index],snapshotDate));
    endpointUsed=endpointUsed??endpoint;
    elements.push(...(payload.elements??[]));
  }

  const seen=new Set();
  const features=elements
    .map(elementToPoi)
    .filter(Boolean)
    .filter(f=>pointInFeature(f.geometry.coordinates,boundary))
    .filter(f=>{if(seen.has(f.properties.osm_id))return false;seen.add(f.properties.osm_id);return true;})
    .sort(sortByCategoryThenName)
    .map(f=>({...f,properties:{...f.properties,source_scope:"historical-osm",snapshot_year:year}}));

  const counts=new Map();let named=0;
  for(const f of features){
    const p=f.properties;counts.set(p.category,(counts.get(p.category)??0)+1);
    const n=(p.name??"").trim();if(n&&!/^sin nombre$/i.test(n)&&!/ sin nombre$/i.test(n))named+=1;
  }
  const filename=`${year}.geojson`;
  const collection={type:"FeatureCollection",name:`actividades_castelldefels_osm_${year}`,properties:{source_scope:"historical-osm",snapshot_year:year,snapshot_at:snapshotDate,endpoint:endpointUsed},features};
  await writeFile(join(historyDir,filename),JSON.stringify(collection),"utf8");
  return {year,total:features.length,named_count:named,available:true,file:`./history/${filename}`,source_scope:"historical-osm",categories:[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([category,count])=>({category,count}))};
}

let existing={years:[]};
try{existing=JSON.parse(await readFile(join(historyDir,"index.json"),"utf8"));}catch{}
const existingByYear=new Map((existing.years??[]).map(item=>[item.year,item]));
const years=onlyYear?[onlyYear]:Array.from({length:currentYear-defaultStart},(_,i)=>defaultStart+i);

for(const year of years){
  console.log(`History ${year}: requesting…`);
  try{
    const result=await buildYear(year);existingByYear.set(year,result);
    console.log(`History ${year}: ${result.total} activities`);
  }catch(error){
    console.warn(`History ${year}: unavailable - ${error.message}`);
    const previous=existingByYear.get(year)??{};
    existingByYear.set(year,{
      ...previous,
      year,
      available:false,
      source_scope:"historical-osm",
      error:String(error.message).slice(0,180),
    });
  }
}

const currentSummary=JSON.parse(await readFile(join(dataDir,"summary.json"),"utf8"));
existingByYear.set(currentYear,{year:currentYear,total:currentSummary.total_pois,named_count:null,available:true,current:true,source_scope:"current-combined",categories:currentSummary.categories});
const index={generated_at:new Date().toISOString(),source_scope:"OpenStreetMap historical statistics via ohsome; optional cartographic snapshots via Overpass",note:"Historical totals reflect OSM representation at each year-end and are not an official census. Cartographic snapshots are added only when Overpass attic is available. Current year uses the combined OSM + Overture inventory.",years:[...existingByYear.values()].filter(x=>x.year>=defaultStart&&x.year<=currentYear).sort((a,b)=>a.year-b.year)};
await writeFile(join(historyDir,"index.json"),JSON.stringify(index,null,2)+"\n","utf8");
console.log(`History index written: ${index.years.filter(x=>x.available).length}/${index.years.length} years available`);
