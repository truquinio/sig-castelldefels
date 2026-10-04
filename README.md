<div align="center">

# 🗺️ SIG Castelldefels

### Visor territorial mobile-first y PWA de establecimientos económicos con datos abiertos

[![Demo](https://img.shields.io/badge/Abrir%20demo-GitHub%20Pages-2ea44f?style=flat-square)](https://truquinio.github.io/sig-castelldefels/web/index.html)

![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat-square)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat-square)
![PostGIS](https://img.shields.io/badge/PostGIS-4169E1?style=flat-square)
![GeoJSON](https://img.shields.io/badge/GeoJSON-data-5C8C46?style=flat-square)

</div>

---

## 📌 Qué analiza

El proyecto estudia **establecimientos económicos observados en Castelldefels** mediante fuentes públicas y reutilizables. La unidad visible es un establecimiento observado, no un expediente ni un registro administrativo municipal. La vista 3D y la malla son herramientas contextuales dentro del mapa, no el centro del producto.

No representa datos internos del Ayuntamiento ni pretende sustituir una fuente oficial: es un proyecto técnico de análisis territorial reproducible.

## 🧭 Flujo de datos

~~~mermaid
flowchart TD
    O["OpenStreetMap"] --> A["Overpass API"]
    V["Overture Maps Places"] --> C["Clasificación + confianza"]
    A --> G["OSM GeoJSON"]
    G --> D["Deduplicación / enriquecimiento"]
    C --> D
    D --> F["Filtrado territorial ICGC"]
    F --> M["Malla 500 m · EPSG:25831"]
    M --> L["Leaflet 2D + MapLibre 3D"]
~~~

## ✨ Qué permite hacer

- consultar un **dashboard simple** con cuatro KPIs principales, mapa y distribución por categoría;
- localizar establecimientos observados en OpenStreetMap y Overture Maps Places;
- filtrar por categoría y buscar por nombre/subcategoría;
- identificar si un establecimiento está **corroborado por OSM + Overture** o sólo aparece en una fuente;
- mostrar imágenes vinculadas cuando una fuente las aporta y, de forma diferenciada, **imágenes de entorno Panoramax a ≤40 m** con fecha/distancia/atribución;
- consultar la evolución anual comparable de registros OSM 2016–2025 como contexto, sin confundirla con un censo administrativo;
- usar malla de 500 m y 3D contextual como controles secundarios dentro del mapa;
- exportar el resultado filtrado a GeoJSON;
- instalar el visor como **PWA** y seguir accediendo al inventario previamente cargado sin conexión;
- utilizar la interfaz con navegación táctil, teclado y diseño responsive desde móvil hasta escritorio.

## 📊 Dataset incluido

| Indicador | Valor |
| --- | ---: |
| Área analizada | 12,91 km² |
| Establecimientos observados combinados | 985 |
| Registros OSM base | 343 |
| Overture-only tras filtros/deduplicación | 642 |
| Establecimientos corroborados OSM + Overture | 127 |
| Celdas de malla | 56 |
| Tamaño de celda | 500 m |

> Estos valores describen el dataset de esta versión. No son un censo municipal oficial.

## 🔁 Reproducibilidad

~~~bash
npm install
python -m pip install -r requirements-overture.txt
npm run fetch:overture
npm run fetch:panoramax
node scripts/build-data.mjs
npm run history:stats
# npm run history:maps   # opcional; depende de disponibilidad de Overpass attic
npm test
npm run check
~~~

Si Overpass está temporalmente caído, `npm run rebuild:offline` reconstruye clasificación, deduplicación y malla usando el último snapshot OSM guardado, sin presentarlo como una descarga nueva.

El histórico se mantiene separado del inventario actual: `npm run history:stats` obtiene la serie anual OSM mediante **ohsome API** con el límite municipal exacto. La interfaz usa esa serie sólo como contexto temporal comparable. No existe un slider que prometa un mapa histórico cuando no hay geometría histórica fiable.

## 🧰 Stack

**Datos:** OpenStreetMap · Overpass API · Overture Maps Places · Panoramax · GeoJSON
**Análisis:** PostgreSQL / PostGIS  
**Mapa:** Leaflet (2D) · MapLibre GL JS/OpenFreeMap (3D opcional) · HTML · CSS · JavaScript
**UX/PWA:** mobile-first · manifest web app · service worker · offline fallback · safe areas · targets táctiles · foco visible · reduced motion
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
| Overpass API | Extracción reproducible de elementos OSM y snapshots históricos cartográficos cuando el servicio attic está disponible |
| ohsome API | Serie estadística histórica anual de OSM, recortada al límite municipal |
| Overture Maps Places | Segunda fuente actual de lugares/negocios con confianza y taxonomía; licencias permisivas según proveedor |
| ICGC | Límite municipal y referencia territorial |
| EPSG:25831 | Construcción métrica de la malla de 500 m |
| WGS84 / EPSG:4326 | Publicación GeoJSON y web |

### Limitaciones

- no representa el Censo de Actividades Económicas municipal;
- no utiliza datos internos ni privados del Ayuntamiento;
- OpenStreetMap y Overture Maps pueden contener información incompleta, desactualizada o clasificada incorrectamente;
- la serie histórica refleja **qué estaba representado en OSM al cierre de cada año**, no el número real de establecimientos existentes en ese momento;
- Overture se filtra por confianza, taxonomía, nombre, límite municipal y reglas de deduplicación; no se acepta ciegamente su categoría;
- Google Maps y directorios web no se copian al dataset persistente cuando sus condiciones de reutilización no lo permiten;
- la malla de 500 m se genera en EPSG:25831 y representa concentración de actividades observadas, no actividad económica real;
- el 3D es una capa visual contextual, no un Digital Twin ni una representación oficial de edificios;
- no sustituye análisis territoriales oficiales.

## 🔭 Evolución

La siguiente evolución prioriza **utilidad para un área municipal de Actividades**, no más controles visuales:

- consolidar el modelo conceptual `establecimiento → actividad → observaciones de fuentes`;
- mejorar conciliación y detección de discrepancias entre fuentes abiertas;
- incorporar direcciones, contacto y otros atributos sólo cuando la fuente permita reutilizarlos;
- preparar, como línea futura separada y no pública, la posible relación con identificadores, expedientes y situación administrativa si existieran autorización y acceso adecuados;
- mantener 3D, malla e histórico como herramientas secundarias, no como eje del dashboard.

## 🔏 Uso y reutilización

El código se publica como parte de un portfolio técnico, pero **no concede actualmente una licencia open source de reutilización**.

Los datos y servicios de terceros mantienen sus propias licencias y condiciones de uso.

© 2026 Federico Trucco. All rights reserved.

---

**Federico Trucco / [@truquinio](https://github.com/truquinio)** · [LinkedIn](https://www.linkedin.com/in/federico-trucco/)

---

**by [truquinio](https://github.com/truquinio)** · [LinkedIn](https://www.linkedin.com/in/federico-trucco/)
