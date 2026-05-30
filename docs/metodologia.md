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
6. Se clasifican por categorías funcionales: comercio, restauración, administración/servicios, salud, educación, ocio/turismo, oficinas y otros servicios.
7. Se genera una malla de 500 metros y se cuentan los puntos por celda.
8. Se exportan GeoJSON y un archivo `web/js/data.js` para visualizar el resultado en Leaflet.

## Criterios de selección OSM

No se descarga todo OpenStreetMap. Se usa una selección para evitar ruido excesivo:

- `shop`: comercios.
- `office`: oficinas y servicios profesionales.
- `amenity`: restauración, salud, educación, bancos, administración, aparcamiento, carga, movilidad y equipamientos concretos.
- `tourism`: hoteles, información turística, atracciones y puntos relacionados.
- `leisure`: parques, zonas deportivas, jardines, juegos y espacios de ocio.

Se excluyen elementos muy granulares como bancos, papeleras, duchas o piscinas privadas porque inflan el conteo y no ayudan al caso de uso.

## Análisis incluido

- Conteo total de puntos seleccionados.
- Conteo por categoría.
- Distribución espacial mediante malla de 500 m.
- Identificación visual de zonas con mayor concentración de puntos.
- Filtro por categoría y búsqueda por nombre o etiqueta.

## Limitaciones

Este proyecto no afirma que los datos OSM sean oficiales. OpenStreetMap es una fuente abierta colaborativa y puede tener omisiones o errores. Por eso el mapa debe describirse como una muestra de flujo SIG con datos abiertos, no como inventario municipal validado.

La malla de 500 m no mide densidad económica, empleo, facturación ni afluencia. Solo resume concentración de puntos OSM seleccionados.

Los centros de vías y relaciones pueden simplificar geometrías grandes, por ejemplo parques o zonas deportivas. Para análisis más riguroso convendría conservar polígonos y aplicar intersecciones reales en PostGIS o QGIS.

## Relación con QGIS y PostGIS

Los GeoJSON generados se pueden cargar directamente en QGIS. Desde ahí se puede diseñar un mapa impreso, revisar simbología, etiquetar categorías y exportar una composición.

Para PostGIS, el proyecto incluye consultas de ejemplo en `postgis/consultas_postgis.sql`: creación de índices espaciales, conteos por categoría, unión espacial con la malla y consulta de puntos cercanos.

## Siguientes pasos razonables

- Validar una muestra de puntos comparándola con ortofoto, callejero o datos municipales.
- Separar actividad económica, equipamientos públicos e infraestructura urbana en capas distintas.
- Añadir secciones censales o barrios oficiales si se consigue una fuente pública fiable.
- Publicar el mapa en GitHub Pages.
- Crear un proyecto QGIS con simbología y layout en PDF.
