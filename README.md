<div align="center">

# 🗺️ SIG Castelldefels

**Análisis geoespacial de servicios urbanos con datos abiertos**

![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat&logo=leaflet&logoColor=white)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat&logo=openstreetmap&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-4169E1?style=flat&logo=postgresql&logoColor=white)
![GeoJSON](https://img.shields.io/badge/GeoJSON-data-5C8C46?style=flat)

[**🌐 Abrir demo**](https://truquinio.github.io/sig-castelldefels/web/index.html) · [**📂 Ver repositorio**](https://github.com/trauquinio/sig-castelldefels)

</div>

---

## 📌 Qué es

Proyecto SIG que analiza la distribución de servicios urbanos en Castelldefels a partir de datos abiertos.

El flujo combina extracción de puntos de interés, filtrado territorial, análisis espacial y visualización web:

```text
OpenStreetMap
    ↓
Overpass API
    ↓
GeoJSON
    ↓
Filtrado municipal
    ↓
PostGIS
    ↓
Malla de análisis 500 m
    ↓
Leaflet
```

## 📸 Capturas

| Vista general | Malla | Vista mixta |
| --- | --- | --- |
| [![Vista general](https://iili.io/C35wAdJ.md.png)](https://freeimage.host/i/C35wAdJ) | [![Vista de malla](https://iili.io/C35wI0g.md.png)](https://freeimage.host/i/C35wI0g) | [![Vista mixta](https://iili.io/C35wTga.md.png)](https://freeimage.host/i/C35wTga) |

## ✨ Funcionalidades

- Visualización de POIs urbanos.
- Filtros por categoría.
- Malla de análisis espacial.
- Popups informativos.
- Consultas espaciales con PostGIS.
- Visor web publicado mediante GitHub Pages.

## 📊 Dataset de esta versión

| Indicador | Valor |
| --- | ---: |
| Área analizada | 12,91 km² |
| Puntos OSM | 870 |
| Celdas de malla | 57 |
| Tamaño de celda | 500 m |

Estos valores describen el dataset incluido en esta versión del proyecto; no deben interpretarse como un censo municipal oficial.

## 🛠️ Tecnologías

| Área | Tecnología |
| --- | --- |
| Datos | OpenStreetMap · Overpass API · GeoJSON |
| Análisis espacial | PostgreSQL / PostGIS |
| Frontend cartográfico | Leaflet · HTML · CSS · JavaScript |
| Referencia territorial | ICGC / límite municipal usado por el proyecto |
| CRS mostrado en los datos web | WGS84 / EPSG:4326 |

## 🗂️ Estructura

```text
sig-castelldefels/
├── data/
├── docs/
├── postgis/
├── scripts/
├── web/
├── index.html
└── README.md
```

## 🐘 Ejemplo PostGIS

```sql
SELECT categoria, COUNT(*)
FROM pois
GROUP BY categoria;
```

## 📚 Fuentes de datos

| Fuente | Uso en el proyecto |
| --- | --- |
| OpenStreetMap | Puntos de interés y servicios |
| Overpass API | Extracción de elementos OSM |
| ICGC | Referencia territorial utilizada por el proyecto |
| WGS84 / EPSG:4326 | Referencia espacial web |

## ⚠️ Alcance y limitaciones

- No representa el Censo de Actividades Económicas municipal.
- No utiliza datos internos ni privados del Ayuntamiento.
- OpenStreetMap puede contener elementos incompletos o desactualizados.
- La malla representa densidad/distribución de puntos, no actividad económica real.
- El proyecto es demostrativo y no sustituye análisis territoriales oficiales.

## 🔭 Evolución posible

- Incorporar capas oficiales complementarias.
- Documentar más consultas espaciales.
- Explorar publicación mediante GeoServer/QGIS Server.
- Añadir nuevos indicadores territoriales verificables.

No hay una licencia de reutilización propia declarada en el repositorio. Los datos de OpenStreetMap mantienen sus términos de licencia correspondientes.

---

**Federico Trucco / [@truquinio](https://github.com/trauquinio)** · [LinkedIn](https://www.linkedin.com/in/federico-trucco/)
