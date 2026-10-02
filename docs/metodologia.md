# Metodología

## Objetivo

Construir un mini-proyecto SIG real, sencillo y defendible: obtener datos geográficos abiertos, tratarlos, analizarlos de forma básica y publicarlos en un mapa web.

El caso elegido es Castelldefels porque conecta con experiencia municipal, información territorial y gestión urbana.

## Flujo de trabajo

1. Se usa el límite municipal público de ICGC en GeoJSON / EPSG:4326.
2. OpenStreetMap se consulta mediante Overpass API con una selección de etiquetas económicas.
3. Overture Maps Places se extrae para el mismo ámbito territorial y se filtra por nombre, estado, confianza y taxonomía.
4. Los elementos OSM se normalizan y clasifican con categoría y subcategoría económica.
5. Los lugares Overture se reclasifican con reglas defensivas; las contradicciones evidentes entre nombre y taxonomía se corrigen antes de integrar.
6. OSM y Overture se deduplican por nombre normalizado, proximidad y categoría. Overture también puede aportar un nombre a un elemento OSM sin nombre sólo cuando la coincidencia es suficientemente fuerte.
7. Los registros sin identidad fiable conservan una etiqueta semántica explícita, por ejemplo “Cafetería sin nombre”, en lugar de inventar un comercio.
8. Se filtra todo contra el límite municipal ICGC.
9. Se genera una malla exacta de 500 m en ETRS89 / UTM zona 31N (EPSG:25831), transformada después a EPSG:4326 para publicación GeoJSON/web.
10. Se conserva por separado el snapshot OSM y se genera un GeoJSON combinado para el visor Leaflet 2D y MapLibre 3D.

## Criterios de selección OSM

No se descarga todo OpenStreetMap. Se usa una selección para evitar ruido excesivo:

- `shop`: comercios.
- `office`: oficinas y servicios profesionales.
- `amenity`: restauración, salud, educación, servicios financieros, combustible/carga, mercado y ocio económico seleccionado.
- `tourism`: alojamiento (`hotel`, `hostel`, `apartment`, `guest_house`).
- `leisure`: únicamente `fitness_centre` dentro de esta extracción.

Se excluyen parques, jardines, áreas de juego, pistas, aparcamientos, administración pública y otros equipamientos o infraestructuras que inflaban el conteo sin representar adecuadamente el objeto de estudio.

## Integración Overture y nombres

Overture Maps Places se usa como segunda fuente abierta de descubrimiento. No se acepta ciegamente su taxonomía: se aplica un umbral de confianza, se descartan categorías no económicas y se usan reglas basadas en el nombre para corregir contradicciones evidentes.

La coincidencia con OSM se basa en nombre normalizado y distancia. Para elementos OSM sin nombre se exige una coincidencia espacial y de categoría más estricta antes de adoptar un nombre de Overture. Si la evidencia es ambigua, se mantiene un nombre semántico genérico.

Google Maps y directorios web pueden servir como referencia manual, pero no se copian al dataset persistente cuando sus condiciones de uso no permiten esa reutilización.

## Análisis incluido

- Conteo total de actividades observadas.
- Conteo por categoría y subcategoría.
- Distribución espacial mediante malla de 500 m.
- Identificación visual de zonas con mayor concentración.
- Filtro por categoría y búsqueda por nombre, subcategoría o etiqueta.
- Trazabilidad de la fuente de cada registro.

## Limitaciones

Este proyecto no afirma que OSM ni Overture sean fuentes oficiales. Ambas pueden tener omisiones, duplicados, cierres no actualizados o errores de clasificación. La integración mejora cobertura, pero no equivale a un inventario municipal validado.

La malla de 500 m no mide densidad económica, empleo, facturación ni afluencia. Solo resume concentración de actividades observadas en las fuentes seleccionadas.

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
