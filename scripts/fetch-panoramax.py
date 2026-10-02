import json
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "panoramax_castelldefels.geojson"
CATALOG = "https://api.panoramax.xyz/data/geoparquet/panoramax.parquet"
BBOX = (1.927375, 41.253492, 2.013197, 41.306452)
ALLOWED_LICENSES = {"CC-BY-SA-4.0", "CC-BY-4.0", "CC0-1.0"}

con = duckdb.connect()
con.execute("INSTALL httpfs")
con.execute("LOAD httpfs")
con.execute("INSTALL spatial")
con.execute("LOAD spatial")

min_lon, min_lat, max_lon, max_lat = BBOX
query = f"""
SELECT
  id,
  ST_X(geometry) AS lon,
  ST_Y(geometry) AS lat,
  datetime,
  license,
  assets,
  providers,
  instance
FROM '{CATALOG}'
WHERE bbox.xmin BETWEEN {min_lon} AND {max_lon}
  AND bbox.ymin BETWEEN {min_lat} AND {max_lat}
"""
rows = con.execute(query).fetchall()

features = []
for image_id, lon, lat, captured_at, license_name, assets, providers, instance in rows:
    if license_name not in ALLOWED_LICENSES:
        continue
    assets = assets or []
    thumb = next((a.get("href") for a in assets if "thumbnail" in (a.get("roles") or [])), None)
    visual = next((a.get("href") for a in assets if "visual" in (a.get("roles") or [])), None)
    if not thumb:
        continue
    provider_names = []
    for provider in providers or []:
        name = provider.get("name")
        if name and name not in provider_names:
            provider_names.append(name)
    instance = instance or {}
    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        "properties": {
            "id": image_id,
            "captured_at": captured_at.isoformat() if captured_at else None,
            "license": license_name,
            "thumbnail_url": thumb,
            "visual_url": visual or thumb,
            "providers": provider_names,
            "instance_name": instance.get("name"),
            "instance_url": instance.get("url"),
            "source": "Panoramax federated catalog"
        }
    })

collection = {
    "type": "FeatureCollection",
    "name": "panoramax_castelldefels",
    "properties": {
        "source": CATALOG,
        "purpose": "Street-level context imagery; not verified storefront photography"
    },
    "features": features
}
OUT.write_text(json.dumps(collection, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Panoramax images: {len(features)}")
print(f"Output: {OUT}")
