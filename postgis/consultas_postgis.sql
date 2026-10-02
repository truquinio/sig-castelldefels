-- SIG Castelldefels
-- Consultas PostGIS sobre el dataset combinado de actividades económicas.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS sig;

-- Importación sugerida con GDAL/ogr2ogr desde la raíz del proyecto:
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/castelldefels_boundary.geojson -nln sig.castelldefels_boundary ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/activities_castelldefels.geojson -nln sig.activities_castelldefels ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite
--
-- ogr2ogr -f "PostgreSQL" PG:"dbname=sig user=postgres password=postgres" ^
--   data/poi_grid_500m.geojson -nln sig.poi_grid_500m ^
--   -lco GEOMETRY_NAME=geom -lco FID=id -overwrite

CREATE INDEX IF NOT EXISTS idx_boundary_geom
  ON sig.castelldefels_boundary USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_activities_geom
  ON sig.activities_castelldefels USING gist (geom);

CREATE INDEX IF NOT EXISTS idx_grid_geom
  ON sig.poi_grid_500m USING gist (geom);

-- 1. Conteo de actividades por categoría.
SELECT category, COUNT(*) AS total
FROM sig.activities_castelldefels
GROUP BY category
ORDER BY total DESC;

-- 2. Conteo por categoría y subcategoría.
SELECT category, subcategory, COUNT(*) AS total
FROM sig.activities_castelldefels
GROUP BY category, subcategory
ORDER BY category, total DESC;

-- 3. Validación espacial: actividades dentro del límite municipal.
SELECT COUNT(*) AS actividades_dentro_municipio
FROM sig.activities_castelldefels AS a
JOIN sig.castelldefels_boundary AS m
  ON ST_Contains(m.geom, a.geom);

-- 4. Conteo por celda de malla.
SELECT
  g.id,
  COUNT(a.*) AS total_actividades
FROM sig.poi_grid_500m AS g
LEFT JOIN sig.activities_castelldefels AS a
  ON ST_Intersects(g.geom, a.geom)
GROUP BY g.id
ORDER BY total_actividades DESC;

-- 5. Categoría dominante por celda.
WITH counts AS (
  SELECT
    g.id AS grid_id,
    a.category,
    COUNT(*) AS total
  FROM sig.poi_grid_500m AS g
  JOIN sig.activities_castelldefels AS a
    ON ST_Intersects(g.geom, a.geom)
  GROUP BY g.id, a.category
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY grid_id ORDER BY total DESC, category) AS rn
  FROM counts
)
SELECT grid_id, category AS categoria_dominante, total
FROM ranked
WHERE rn = 1
ORDER BY total DESC;

-- 6. Actividades cercanas al Ajuntament de Castelldefels.
WITH ajuntament AS (
  SELECT ST_SetSRID(ST_MakePoint(1.9819, 41.2803), 4326)::geography AS geom
)
SELECT
  a.display_name,
  a.category,
  a.subcategory,
  a.source,
  ROUND(ST_Distance(a.geom::geography, x.geom)) AS distancia_m
FROM sig.activities_castelldefels AS a
CROSS JOIN ajuntament AS x
WHERE ST_DWithin(a.geom::geography, x.geom, 500)
ORDER BY distancia_m ASC
LIMIT 25;

-- 7. Vista de restauración dentro del municipio.
CREATE OR REPLACE VIEW sig.vw_restauracion_castelldefels AS
SELECT a.*
FROM sig.activities_castelldefels AS a
JOIN sig.castelldefels_boundary AS m
  ON ST_Contains(m.geom, a.geom)
WHERE a.category = 'Restauración';

-- 8. Trazabilidad por fuente.
SELECT
  source,
  COUNT(*) AS total
FROM sig.activities_castelldefels
GROUP BY source
ORDER BY total DESC;
