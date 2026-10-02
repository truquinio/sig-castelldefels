import duckdb
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "overture_places_castelldefels.geojson"
RELEASE = "2026-09-23.1"

con = duckdb.connect()
con.execute("INSTALL spatial")
con.execute("LOAD spatial")
con.execute("INSTALL httpfs")
con.execute("LOAD httpfs")
con.execute("SET s3_region='us-west-2'")

query = f"""
COPY (
  SELECT
    id,
    names.primary AS name,
    taxonomy.primary AS taxonomy,
    ROUND(confidence, 3) AS confidence,
    operating_status,
    geometry
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/{RELEASE}/theme=places/*/*'
  )
  WHERE bbox.xmin BETWEEN 1.927375 AND 2.013197
    AND bbox.ymin BETWEEN 41.253492 AND 41.306452
    AND names.primary IS NOT NULL
    AND confidence >= 0.70
    AND (operating_status IS NULL OR operating_status <> 'closed')
) TO '{OUT.as_posix()}'
WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
"""
con.execute(query)
print(f"Overture release: {RELEASE}")
print(f"Output: {OUT}")
