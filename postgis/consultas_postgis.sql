-- Mini-proyecto SIG Castelldefels
-- Consultas PostGIS básicas sobre los GeoJSON generados.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS sig;

-- Importación sugerida con GDAL/ogr2ogr desde la raíz del proyecto:
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/castelldefels_boundary.geojson -nln sig.castelldefels_boundary ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/osm_pois_castelldefels.geojson -nln sig.osm_pois_castelldefels ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/poi_grid_500m.geojson -nln sig.poi_grid_500m ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite

CREATE INDEX IF NOT EXISTS idx_boundary_geom
  ON sig.castelldefels_boundary
  USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_pois_geom
  ON sig.osm_pois_castelldefels
  USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_grid_geom
  ON sig.poi_grid_500m
  USING gist (geom);

-- 1. Conteo de puntos por categoría.
SELECT
  category,
  COUNT(*) AS total
FROM sig.osm_pois_castelldefels
GROUP BY category
ORDER BY total DESC;

-- 2. Validación espacial: puntos OSM dentro del límite municipal.
SELECT
  COUNT(*) AS puntos_dentro_municipio
FROM sig.osm_pois_castelldefels AS p
JOIN sig.castelldefels_boundary AS m
  ON ST_Contains(m.geom, p.geom);

-- 3. Conteo por celda de malla usando intersección espacial.
SELECT
  g.id,
  COUNT(p.*) AS total_puntos
FROM sig.poi_grid_500m AS g
LEFT JOIN sig.osm_pois_castelldefels AS p
  ON ST_Intersects(g.geom, p.geom)
GROUP BY g.id
ORDER BY total_puntos DESC;

-- 4. Categoría dominante por celda.
WITH counts AS (
  SELECT
    g.id AS grid_id,
    p.category,
    COUNT(*) AS total
  FROM sig.poi_grid_500m AS g
  JOIN sig.osm_pois_castelldefels AS p
    ON ST_Intersects(g.geom, p.geom)
  GROUP BY g.id, p.category
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY grid_id ORDER BY total DESC) AS rn
  FROM counts
)
SELECT
  grid_id,
  category AS categoria_dominante,
  total
FROM ranked
WHERE rn = 1
ORDER BY total DESC;

-- 5. Puntos cercanos al Ajuntament de Castelldefels.
-- Coordenadas aproximadas de la plaza de la Iglesia/Ajuntament en EPSG:4326.
WITH ajuntament AS (
  SELECT ST_SetSRID(ST_MakePoint(1.9819, 41.2803), 4326)::geography AS geom
)
SELECT
  p.name,
  p.category,
  p.primary_tag,
  ROUND(ST_Distance(p.geom::geography, a.geom)) AS distancia_m
FROM sig.osm_pois_castelldefels AS p
CROSS JOIN ajuntament AS a
WHERE ST_DWithin(p.geom::geography, a.geom, 500)
ORDER BY distancia_m ASC
LIMIT 25;

-- 6. Exportación de una capa filtrada: restauración dentro del municipio.
CREATE OR REPLACE VIEW sig.vw_restauracion_castelldefels AS
SELECT
  p.*
FROM sig.osm_pois_castelldefels AS p
JOIN sig.castelldefels_boundary AS m
  ON ST_Contains(m.geom, p.geom)
WHERE p.category = 'Restauración';
