<div align="center">

# 🗺️ SIG Castelldefels

### SIG 2D-first de actividades económicas con datos abiertos y vista 3D opcional

[![Demo](https://img.shields.io/badge/Abrir%20demo-GitHub%20Pages-2ea44f?style=for-the-badge&logo=githubpages&logoColor=white)](https://truquinio.github.io/sig-castelldefels/web/index.html)

![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat&logo=leaflet&logoColor=white)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat&logo=openstreetmap&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-4169E1?style=flat&logo=postgresql&logoColor=white)
![GeoJSON](https://img.shields.io/badge/GeoJSON-data-5C8C46?style=flat)

</div>

---

## 📌 Qué analiza

El proyecto estudia la **distribución de actividades económicas observadas en Castelldefels** mediante fuentes públicas y reutilizables. El análisis principal es 2D; la vista 3D de edificios es opcional y aporta contexto visual.

No representa datos internos del Ayuntamiento ni pretende sustituir una fuente oficial: es un proyecto técnico de análisis territorial reproducible.

## 🧭 Flujo de datos

~~~mermaid
flowchart LR
    O["OpenStreetMap"] --> A["Overpass API"]
    V["Overture Maps Places"] --> C["Clasificación + confianza"]
    A --> G["OSM GeoJSON"]
    G --> D["Deduplicación / enriquecimiento"]
    C --> D
    D --> F["Filtrado territorial ICGC"]
    F --> M["Malla 500 m · EPSG:25831"]
    M --> L["Leaflet 2D + MapLibre 3D"]
~~~

## 📸 Capturas

| Vista general | Malla | Vista mixta |
| --- | --- | --- |
| [![Vista general](https://iili.io/C35wAdJ.md.png)](https://freeimage.host/i/C35wAdJ) | [![Vista de malla](https://iili.io/C35wI0g.md.png)](https://freeimage.host/i/C35wI0g) | [![Vista mixta](https://iili.io/C35wTga.md.png)](https://freeimage.host/i/C35wTga) |

## ✨ Qué permite hacer

- visualizar actividades económicas observadas en OpenStreetMap y Overture Maps Places;
- filtrar por categoría;
- comparar distribución mediante malla;
- consultar información mediante popups;
- ejecutar consultas espaciales con PostGIS;
- alternar entre análisis 2D y una vista 3D ligera de edificios;
- explorar el resultado en un visor web público.

## 📊 Dataset incluido

| Indicador | Valor |
| --- | ---: |
| Área analizada | 12,91 km² |
| Actividades combinadas | 985 |
| Registros OSM base | 343 |
| Overture-only tras filtros/deduplicación | 642 |
| Coincidencias OSM + Overture fusionadas | 129 |
| Celdas de malla | 56 |
| Tamaño de celda | 500 m |

> Estos valores describen el dataset de esta versión. No son un censo municipal oficial.

## 🔁 Reproducibilidad

~~~bash
npm install
python -m pip install -r requirements-overture.txt
npm run fetch:overture
node scripts/build-data.mjs
npm test
npm run check
~~~

Si Overpass está temporalmente caído, `npm run rebuild:offline` reconstruye clasificación, deduplicación y malla usando el último snapshot OSM guardado, sin presentarlo como una descarga nueva.

## 🧰 Stack

**Datos:** OpenStreetMap · Overpass API · Overture Maps Places · GeoJSON
**Análisis:** PostgreSQL / PostGIS  
**Mapa:** Leaflet (2D) · MapLibre GL JS/OpenFreeMap (3D opcional) · HTML · CSS · JavaScript
**Referencia territorial:** ICGC / límite municipal utilizado por el proyecto  
**CRS:** ETRS89 / UTM 31N (EPSG:25831) para la malla métrica · WGS84 / EPSG:4326 para GeoJSON/web

## 🐘 Ejemplo PostGIS

~~~sql
SELECT categoria, COUNT(*)
FROM pois
GROUP BY categoria;
~~~

## 📁 Estructura

<details>
<summary><strong>Ver estructura del repositorio</strong></summary>

~~~text
sig-castelldefels/
├── data/
├── docs/
├── postgis/
├── scripts/
├── web/
├── index.html
└── README.md
~~~

</details>

## 📚 Fuentes y alcance

| Fuente | Uso |
| --- | --- |
| OpenStreetMap | Actividades/establecimientos observables; ODbL |
| Overpass API | Extracción reproducible de elementos OSM |
| Overture Maps Places | Segunda fuente de lugares/negocios con confianza y taxonomía; licencias permisivas según proveedor |
| ICGC | Límite municipal y referencia territorial |
| EPSG:25831 | Construcción métrica de la malla de 500 m |
| WGS84 / EPSG:4326 | Publicación GeoJSON y web |

### Limitaciones

- no representa el Censo de Actividades Económicas municipal;
- no utiliza datos internos ni privados del Ayuntamiento;
- OpenStreetMap y Overture Maps pueden contener información incompleta, desactualizada o clasificada incorrectamente;
- Overture se filtra por confianza, taxonomía, nombre, límite municipal y reglas de deduplicación; no se acepta ciegamente su categoría;
- Google Maps y directorios web no se copian al dataset persistente cuando sus condiciones de reutilización no lo permiten;
- la malla de 500 m se genera en EPSG:25831 y representa concentración de actividades observadas, no actividad económica real;
- el 3D es una capa visual contextual, no un Digital Twin ni una representación oficial de edificios;
- no sustituye análisis territoriales oficiales.

## 🔭 Evolución

- incorporar capas oficiales complementarias;
- ampliar consultas espaciales documentadas;
- explorar publicación mediante GeoServer/QGIS Server;
- añadir nuevos indicadores territoriales verificables.

## 🔏 Uso y reutilización

El código se publica como parte de un portfolio técnico, pero **no concede actualmente una licencia open source de reutilización**.

Los datos y servicios de terceros mantienen sus propias licencias y condiciones de uso.

© 2026 Federico Trucco. All rights reserved.

---

**Federico Trucco / [@truquinio](https://github.com/truquinio)** · [LinkedIn](https://www.linkedin.com/in/federico-trucco/)
