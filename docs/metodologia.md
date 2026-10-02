# Metodología

## Objetivo

Construir un mini-proyecto SIG real, sencillo y defendible: obtener datos geográficos abiertos, tratarlos, analizarlos de forma básica y publicarlos en un mapa web.

El caso elegido es Castelldefels porque conecta con experiencia municipal, información territorial y gestión urbana.

## Flujo de trabajo

1. Se descarga el límite municipal de Castelldefels desde el servicio público de ICGC en GeoJSON y EPSG:4326.
2. Se calcula la envolvente del municipio para consultar OpenStreetMap mediante Overpass API.
3. Se descargan puntos y geometrías con etiquetas seleccionadas: `amenity`, `shop`, `office`, `tourism` y `leisure`.
4. Se convierten nodos, vías y relaciones OSM a puntos. En vías y relaciones se usa el centro devuelto por Overpass.
5. Se filtran los puntos que caen dentro del límite municipal oficial de ICGC.
6. Se excluyen equipamientos e infraestructuras que no constituyen actividad económica y se clasifican los registros restantes por categorías funcionales.
7. Se genera una malla exacta de 500 m en ETRS89 / UTM zona 31N (EPSG:25831), asignando cada actividad a su celda y transformando el resultado a EPSG:4326 para GeoJSON/web.
8. Se exportan GeoJSON y `web/js/data.js` para el visor Leaflet 2D; la vista MapLibre 3D se carga sólo bajo demanda.

## Criterios de selección OSM

No se descarga todo OpenStreetMap. Se usa una selección para evitar ruido excesivo:

- `shop`: comercios.
- `office`: oficinas y servicios profesionales.
- `amenity`: restauración, salud, educación, servicios financieros, combustible/carga, mercado y ocio económico seleccionado.
- `tourism`: alojamiento (`hotel`, `hostel`, `apartment`, `guest_house`).
- `leisure`: únicamente `fitness_centre` dentro de esta extracción.

Se excluyen parques, jardines, áreas de juego, pistas, aparcamientos, administración pública y otros equipamientos o infraestructuras que inflaban el conteo sin representar adecuadamente el objeto de estudio.

## Análisis incluido

- Conteo total de puntos seleccionados.
- Conteo por categoría.
- Distribución espacial mediante malla de 500 m.
- Identificación visual de zonas con mayor concentración de puntos.
- Filtro por categoría y búsqueda por nombre o etiqueta.

## Limitaciones

Este proyecto no afirma que los datos OSM sean oficiales. OpenStreetMap es una fuente abierta colaborativa y puede tener omisiones o errores. Por eso el mapa debe describirse como una muestra de flujo SIG con datos abiertos, no como inventario municipal validado.

La malla de 500 m no mide densidad económica, empleo, facturación ni afluencia. Solo resume concentración de puntos OSM seleccionados.

Los centros de vías y relaciones pueden simplificar geometrías de establecimientos representados como polígonos. Para análisis más riguroso convendría conservar polígonos y aplicar intersecciones reales en PostGIS o QGIS.

## Relación con QGIS y PostGIS

Los GeoJSON generados se pueden cargar directamente en QGIS. Desde ahí se puede diseñar un mapa impreso, revisar simbología, etiquetar categorías y exportar una composición.

Para PostGIS, el proyecto incluye consultas de ejemplo en `postgis/consultas_postgis.sql`: creación de índices espaciales, conteos por categoría, unión espacial con la malla y consulta de puntos cercanos.

## Siguientes pasos razonables

- Validar una muestra de registros comparándola con ortofoto, callejero o fuentes oficiales públicas y reutilizables.
- Separar actividad económica, equipamientos públicos e infraestructura urbana en capas distintas.
- Añadir secciones censales o barrios oficiales si se consigue una fuente pública fiable.
- Publicar el mapa en GitHub Pages.
- Crear un proyecto QGIS con simbología y layout en PDF.
