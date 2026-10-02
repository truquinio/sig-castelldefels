import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir=join(root,"data");
const historyDir=join(root,"web","history");
const currentYear=new Date().getFullYear();
const startYear=currentYear-10;
await mkdir(historyDir,{recursive:true});

const boundary=JSON.parse(await readFile(join(dataDir,"castelldefels_boundary.geojson"),"utf8"));
const filter="shop=* or office=* or amenity in (restaurant,cafe,bar,pub,fast_food,pharmacy,bank,atm,clinic,doctors,dentist,hospital,school,kindergarten,post_office,fuel,charging_station,marketplace,theatre,cinema,arts_centre) or tourism in (hotel,hostel,apartment,guest_house) or leisure=fitness_centre";
const body=new URLSearchParams({
  bpolys:JSON.stringify(boundary),
  time:`${startYear}-12-31/${currentYear-1}-12-31/P1Y`,
  filter,
});
const response=await fetch("https://api.ohsome.org/v1/elements/count",{
  method:"POST",
  headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"sig-castelldefels/0.3"},
  body,
  signal:AbortSignal.timeout(90_000),
});
if(!response.ok)throw new Error(`ohsome HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
const payload=await response.json();

let index={years:[]};
try{index=JSON.parse(await readFile(join(historyDir,"index.json"),"utf8"));}catch{}
const byYear=new Map((index.years??[]).map(item=>[item.year,item]));
for(const row of payload.result??[]){
  const year=Number(String(row.timestamp).slice(0,4));
  const existing=byYear.get(year)??{year,available:false,source_scope:"historical-osm"};
  byYear.set(year,{
    ...existing,
    year,
    total:Number(row.value),
    stats_available:true,
    stats_source:"ohsome-api",
    stats_at:row.timestamp,
  });
}
const summary=JSON.parse(await readFile(join(dataDir,"summary.json"),"utf8"));
byYear.set(currentYear,{
  ...(byYear.get(currentYear)??{}),
  year:currentYear,
  total:summary.total_pois,
  available:true,
  current:true,
  stats_available:true,
  source_scope:"current-combined",
  categories:summary.categories,
});
const merged={
  generated_at:new Date().toISOString(),
  source_scope:"OpenStreetMap historical statistics via ohsome; optional cartographic snapshots via Overpass",
  note:"Historical totals reflect OSM representation at each year-end and are not an official census. Current year uses combined OSM + Overture data.",
  years:[...byYear.values()].filter(item=>item.year>=startYear&&item.year<=currentYear).sort((a,b)=>a.year-b.year),
};
await writeFile(join(historyDir,"index.json"),JSON.stringify(merged,null,2)+"\n","utf8");
console.log(merged.years.map(x=>`${x.year}: ${x.total??"—"} ${x.available?"map":"stats"}`).join("\n"));
