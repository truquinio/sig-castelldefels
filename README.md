<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?size=23&color=199900&center=true&vCenter=true&width=1000&height=60&lines=SIG+Castelldefels;Análisis+de+Servicios+Urbanos;Leaflet+%7C+OpenStreetMap+%7C+PostGIS"/>
</p>

<div align="center">

# 🗺️ SIG Castelldefels

### Análisis geoespacial de servicios urbanos con datos abiertos

![Leaflet](https://img.shields.io/badge/Leaflet-Mapa_Interactivo-199900?style=for-the-badge&logo=leaflet)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-Datos_Abiertos-7ebc6f?style=for-the-badge&logo=openstreetmap)
![PostGIS](https://img.shields.io/badge/PostGIS-Análisis_Espacial-336791?style=for-the-badge&logo=postgresql)

</div>

---

## 🌐 Demo

🔗 https://truquinio.github.io/sig-castelldefels/web/index.html

---

## 📸 Capturas

### Vista general
[![Vista General](https://iili.io/C35wAdJ.md.png)](https://freeimage.host/i/C35wAdJ)

### Vista de malla
[![Vista Malla](https://iili.io/C35wI0g.md.png)](https://freeimage.host/i/C35wI0g)

### Vista mixta
[![Vista Mixta](https://iili.io/C35wTga.md.png)](https://freeimage.host/i/C35wTga)

---

## 📌 Descripción

Proyecto SIG que analiza la distribución de servicios urbanos en Castelldefels utilizando datos abiertos de OpenStreetMap.

El sistema permite:

- Extraer datos geoespaciales
- Filtrar por límite municipal
- Analizar distribución mediante malla
- Visualizar resultados en un visor web

---

## 🧭 Flujo del proyecto

```text
OpenStreetMap
→ Overpass API
→ GeoJSON
→ Filtrado municipal (ICGC)
→ PostGIS
→ Análisis espacial (malla 500m)
→ Visualización con Leaflet
```

---

## 🛠️ Tecnologías

- OpenStreetMap
- Overpass API
- GeoJSON
- PostGIS
- Leaflet.js
- HTML / CSS / JavaScript

---

## 📊 Resultados

| Indicador | Valor |
|-----------|------:|
| Área analizada | 12,91 km² |
| Puntos OSM | 870 |
| Celdas de malla | 57 |
| Tamaño de celda | 500 m |

---

## ✨ Funcionalidades

- Visualización de POIs urbanos
- Filtros por categoría
- Malla de análisis espacial
- Popups informativos
- Consultas espaciales (PostGIS)

---

## 🗂️ Estructura

```text
sig-castelldefels/
├── data/
├── docs/
├── postgis/
├── scripts/
├── web/
└── README.md
```

---

## 🐘 PostGIS

Ejemplo:

```sql
SELECT categoria, COUNT(*)
FROM pois
GROUP BY categoria;
```

---

---

## 📚 Fuentes de Datos

| Fuente | Descripción |
|----------|-------------|
| ICGC | División administrativa municipal oficial |
| OpenStreetMap | Puntos de interés y servicios |
| Overpass API | Extracción de datos OSM |
| WGS84 / EPSG:4326 | Sistema de referencia espacial |

---

## ⚠️ Limitaciones

- No representa el Censo de Actividades Económicas municipal.
- No utiliza datos internos ni privados del Ayuntamiento.
- Los datos OSM pueden contener errores o elementos desactualizados.
- La malla representa densidad de puntos, no actividad económica real.
- No sustituye estudios territoriales oficiales ni auditorías SIG profesionales.

---

## 🔮 Próximos Pasos

- [ ] Diseñar una versión cartográfica en QGIS.
- [ ] Publicar el visor mediante GitHub Pages.
- [ ] Documentar consultas PostGIS con capturas.
- [ ] Incorporar capas oficiales complementarias.
- [ ] Explorar despliegue con GeoServer.
- [ ] Explorar despliegue con QGIS Server.
- [ ] Añadir indicadores territoriales básicos.

---

## 👨‍💻 Autor

### Federico Trucco / @truquinio

[![LinkedIn](https://img.shields.io/badge/LinkedIn-%230077B5.svg?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/federico-trucco) [![GitHub](https://img.shields.io/badge/GitHub-181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/truquinio)

---

## 📜 Licencia

Datos OpenStreetMap bajo licencia ODbL.

© OpenStreetMap Contributors

https://www.openstreetmap.org/copyright

---

<div align="center">

⭐ Si te interesa el análisis territorial, GIS, urbanismo y datos abiertos, considera dejar una estrella al proyecto.

</div>
