<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?size=23&color=199900&center=true&vCenter=true&width=1000&height=60&lines=SIG+Castelldefels;Actividades+y+Servicios+Urbanos;Leaflet+%7C+GeoJSON+%7C+OpenStreetMap+%7C+PostGIS;Mini+proyecto+SIG+con+datos+abiertos;Análisis+y+visualización+geoespacial"/>
</p>

<div align="center">

# 🗺️ SIG Castelldefels - Actividades y Servicios Urbanos

![Leaflet](https://img.shields.io/badge/Leaflet.js-Mapa_Interactivo-199900?style=for-the-badge&logo=leaflet)
![GeoJSON](https://img.shields.io/badge/GeoJSON-Datos_Geoespaciales-2f6f9f?style=for-the-badge)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-Datos_Abiertos-7ebc6f?style=for-the-badge&logo=openstreetmap)
![PostGIS](https://img.shields.io/badge/PostGIS-Consultas_Espaciales-336791?style=for-the-badge&logo=postgresql)
![Estado](https://img.shields.io/badge/Estado-Mini_Proyecto_SIG-0f766e?style=for-the-badge)

Mini-proyecto SIG de análisis y visualización web para el municipio de **Castelldefels (Barcelona)**, desarrollado con tecnologías open source y datos geográficos abiertos.

</div>

---

## 📌 Descripción

Este proyecto demuestra un flujo completo de trabajo SIG utilizando herramientas y estándares abiertos:

✅ Obtención de datos geoespaciales  
✅ Tratamiento y limpieza de GeoJSON  
✅ Filtrado espacial municipal  
✅ Análisis mediante malla regular de 500 m  
✅ Consultas espaciales con PostGIS  
✅ Publicación mediante visor web interactivo

El visor representa una selección de actividades, equipamientos y servicios urbanos presentes en OpenStreetMap dentro del límite municipal oficial de Castelldefels.

> Este proyecto constituye una práctica SIG basada en datos abiertos y no debe interpretarse como un inventario oficial ni como un censo municipal validado.

---

## 🎯 Objetivos

- Mostrar un flujo SIG reproducible de principio a fin.
- Trabajar con fuentes abiertas y estándares geoespaciales.
- Generar análisis básicos de distribución espacial.
- Publicar resultados mediante una aplicación web ligera.
- Complementar un perfil orientado a urbanismo, territorio y datos municipales.

---

## 🛠️ Tech Stack

### GIS & Datos

![GeoJSON](https://img.shields.io/badge/GeoJSON-000000?style=flat&logo=json&logoColor=white)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7ebc6f?style=flat&logo=openstreetmap&logoColor=white)
![Overpass API](https://img.shields.io/badge/Overpass_API-336791?style=flat)
![PostGIS](https://img.shields.io/badge/PostGIS-336791?style=flat&logo=postgresql&logoColor=white)
![ICGC](https://img.shields.io/badge/ICGC-Datos_Oficiales-orange?style=flat)

### Desarrollo Web

![HTML5](https://img.shields.io/badge/HTML5-E34F26.svg?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6.svg?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E.svg?style=flat&logo=javascript&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900.svg?style=flat&logo=leaflet&logoColor=white)

---

## 📊 Resultado Actual

**Última generación local:** 30/05/2026

| Indicador | Valor |
|-----------|-------:|
| Municipio | Castelldefels |
| Comarca | Baix Llobregat |
| Área municipal ICGC | 12,91 km² |
| Puntos OSM seleccionados | 870 |
| Celdas de malla | 57 |
| Tamaño de celda | 500 m |

> Los resultados pueden variar si se vuelve a ejecutar la descarga porque OpenStreetMap es una base de datos viva.

---

## ✨ Funcionalidades

### 🗺️ Visualización

- Visualización del límite municipal oficial.
- Carga de puntos OSM clasificados por categoría.
- Vista de puntos.
- Vista de malla.
- Vista mixta.

### 🔎 Exploración

- Buscador por nombre.
- Buscador por categoría.
- Filtro por categorías.
- Popups informativos.
- Enlace directo al elemento en OpenStreetMap.

### 📈 Análisis

- Conteo de puntos por celda.
- Visualización de densidad.
- Categoría dominante por celda.
- Descarga de GeoJSON filtrado.

### 🐘 PostGIS

- Consultas espaciales.
- Intersecciones.
- Validaciones geométricas.
- Conteos y análisis de proximidad.

---

## 🗂️ Estructura del Proyecto

```text
sig-castelldefels/
├── index.html
├── README.md
├── data/
│   ├── castelldefels_boundary.geojson
│   ├── osm_pois_castelldefels.geojson
│   ├── poi_grid_500m.geojson
│   ├── overpass-query.txt
│   ├── summary.json
│   └── README.md
├── docs/
│   ├── metodologia.md
│   └── texto_cv_psig.md
├── postgis/
│   └── consultas_postgis.sql
├── scripts/
│   └── build-data.mjs
└── web/
    ├── index.html
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js
        └── data.js
```

---

## 🚀 Cómo usar

### Abrir directamente

```text
index.html
```

o

```text
web/index.html
```

### Servidor local

```bash
python -m http.server 8080
```

Abrir:

```text
http://localhost:8080
```

---

## 🐘 Consultas PostGIS

El archivo:

```text
postgis/consultas_postgis.sql
```

incluye ejemplos para:

- Crear índices espaciales.
- Contar puntos por categoría.
- Validar puntos dentro del municipio.
- Contar puntos por celda.
- Obtener la categoría dominante.
- Realizar búsquedas por proximidad.

Ejemplo:

```sql
SELECT categoria, COUNT(*)
FROM pois
GROUP BY categoria;
```

---

## 📚 Fuentes de Datos

| Fuente | Descripción |
|----------|-------------|
| ICGC | División administrativa municipal oficial |
| OpenStreetMap | Puntos de interés y servicios |
| Overpass API | Extracción de datos OSM |
| WGS84 / EPSG:4326 | Sistema de referencia espacial |

---

## 👨‍💼 Contexto Profesional

Este mini-proyecto complementa un perfil orientado a:

- Urbanismo
- Datos territoriales
- Gestión municipal
- Sistemas de Información Geográfica
- Open Data

No pretende acreditar experiencia avanzada en SIG, sino mostrar una base práctica y honesta utilizando herramientas habituales del sector:

**GeoJSON · Leaflet · OpenStreetMap · Overpass API · ICGC · PostGIS**

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

### Federico Alberto Trucco

📍 Castelldefels, Barcelona

[![LinkedIn](https://img.shields.io/badge/LinkedIn-%230077B5.svg?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/federico-trucco)

[![GitHub](https://img.shields.io/badge/GitHub-181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/truquinio)

---

## 📜 Licencia

Datos OpenStreetMap bajo licencia ODbL.

© OpenStreetMap Contributors

https://www.openstreetmap.org/copyright

---

<div align="center">

⭐ Si te interesa el análisis territorial, GIS, urbanismo y datos abiertos, considera dejar una estrella al proyecto.

</div>