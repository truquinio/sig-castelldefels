<div align="center">

# 🗺️ SIG Castelldefels

### Análisis geoespacial de servicios urbanos con datos abiertos

[![Demo](https://img.shields.io/badge/Abrir%20demo-GitHub%20Pages-2ea44f?style=for-the-badge&logo=githubpages&logoColor=white)](https://truquinio.github.io/sig-castelldefels/web/index.html)

![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat&logo=leaflet&logoColor=white)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat&logo=openstreetmap&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-4169E1?style=flat&logo=postgresql&logoColor=white)
![GeoJSON](https://img.shields.io/badge/GeoJSON-data-5C8C46?style=flat)

</div>

---

## 📌 Qué analiza

El proyecto estudia la **distribución de servicios urbanos en Castelldefels** utilizando datos abiertos y una malla espacial de 500 m.

No representa datos internos del Ayuntamiento ni pretende sustituir una fuente oficial: es un proyecto técnico de análisis territorial reproducible.

## 🧭 Flujo de datos

~~~mermaid
flowchart LR
    O["OpenStreetMap"] --> A["Overpass API"]
    A --> G["GeoJSON"]
    G --> F["Filtrado territorial"]
    F --> P[("PostGIS")]
    P --> M["Malla 500 m"]
    M --> L["Visor Leaflet"]
~~~

## 📸 Capturas

| Vista general | Malla | Vista mixta |
| --- | --- | --- |
| [![Vista general](https://iili.io/C35wAdJ.md.png)](https://freeimage.host/i/C35wAdJ) | [![Vista de malla](https://iili.io/C35wI0g.md.png)](https://freeimage.host/i/C35wI0g) | [![Vista mixta](https://iili.io/C35wTga.md.png)](https://freeimage.host/i/C35wTga) |

## ✨ Qué permite hacer

- visualizar POIs urbanos;
- filtrar por categoría;
- comparar distribución mediante malla;
- consultar información mediante popups;
- ejecutar consultas espaciales con PostGIS;
- explorar el resultado en un visor web público.

## 📊 Dataset incluido

| Indicador | Valor |
| --- | ---: |
| Área analizada | 12,91 km² |
| Puntos OSM | 870 |
| Celdas de malla | 57 |
| Tamaño de celda | 500 m |

> Estos valores describen el dataset de esta versión. No son un censo municipal oficial.

## 🧰 Stack

**Datos:** OpenStreetMap · Overpass API · GeoJSON  
**Análisis:** PostgreSQL / PostGIS  
**Mapa:** Leaflet · HTML · CSS · JavaScript  
**Referencia territorial:** ICGC / límite municipal utilizado por el proyecto  
**CRS web:** WGS84 / EPSG:4326

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
| OpenStreetMap | POIs y servicios |
| Overpass API | Extracción de elementos OSM |
| ICGC | Referencia territorial |
| WGS84 / EPSG:4326 | Referencia espacial web |

### Limitaciones

- no representa el Censo de Actividades Económicas municipal;
- no utiliza datos internos ni privados del Ayuntamiento;
- OpenStreetMap puede contener información incompleta o desactualizada;
- la malla representa distribución/densidad de puntos, no actividad económica real;
- no sustituye análisis territoriales oficiales.

## 🔭 Evolución

- incorporar capas oficiales complementarias;
- ampliar consultas espaciales documentadas;
- explorar publicación mediante GeoServer/QGIS Server;
- añadir nuevos indicadores territoriales verificables.

---

**Federico Trucco / [@truquinio](https://github.com/truquinio)** · [LinkedIn](https://www.linkedin.com/in/federico-trucco/)
