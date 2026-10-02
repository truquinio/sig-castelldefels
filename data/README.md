# Datos generados

Archivos creados por `scripts/build-data.mjs`.

## Archivos

- `castelldefels_boundary.geojson`: límite municipal de Castelldefels desde ICGC.
- `osm_pois_castelldefels.geojson`: snapshot OSM normalizado y mantenido separado de otras fuentes.
- `overture_places_castelldefels.geojson`: candidatos extraídos de Overture Maps Places antes de la deduplicación final.
- `activities_castelldefels.geojson`: dataset combinado OSM + Overture, clasificado, filtrado y deduplicado para el visor.
- `poi_grid_500m.geojson`: malla métrica de 500 m construida en EPSG:25831 y publicada en GeoJSON EPSG:4326.
- `summary.json`: resumen de resultados, procedencia, estadísticas de integración y limitaciones.
- `overpass-query.txt`: consulta exacta utilizada para OSM.

## Nota

OpenStreetMap y Overture Maps son fuentes externas con sus propias licencias y atribuciones. El dataset combinado conserva trazabilidad y no representa un inventario municipal oficial. La presencia de un registro no implica validación administrativa, y la ausencia de un registro no implica inexistencia de la actividad.
