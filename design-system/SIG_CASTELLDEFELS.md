# SIG Castelldefels · Design System

## Product intent

SIG Castelldefels is a territorial work surface for locating, counting, classifying and contrasting observed economic establishments. It must read as a municipal/geospatial data tool, not as a generic SaaS dashboard or a marketing landing page.

## Audience

- Municipal staff who work with activities, commerce, planning or territorial analysis.
- Technical reviewers evaluating the project.
- Citizens or professionals consulting the public open-data edition.

## Visual hierarchy

1. Map and territorial context.
2. Establishment search and filters.
3. Establishment card / popup.
4. Category distribution.
5. Primary KPIs.
6. Data quality and historical context.
7. Methodology and author information.

The map is the signature element. Every other block should be quieter and must justify the space it consumes.

## Design principles

- Information density: medium-high.
- Motion: minimal and user-triggered.
- Elevation: only for true overlays such as map controls and popups.
- Borders: semantic separation before decorative shadows.
- Radius: moderate; avoid a uniform SaaS-card look.
- Typography: highly legible, sentence case, short labels.
- Copy: plain language from the user perspective.
- No decorative gradients, glows, autoplay motion or gratuitous badges.
- Do not encode status by color alone.

## Token architecture

### Primitive tokens

- Navy 900: #102a3a
- Navy 700: #17384b
- Teal 700: #0d6b86
- Teal 800: #0a5369
- Surface 50: #f4f7f9
- Border 200: #dbe4e9
- Border 300: #c4d0d8
- Ink 900: #17232d
- Muted 600: #60717d

### Semantic tokens

- Page background → Surface 50
- Navigation background → Navy 900
- Primary action → Teal 700
- Primary action hover → Teal 800
- Primary text → Ink 900
- Secondary text → Muted 600
- Default border → Border 200
- Strong border → Border 300

### Component intent

- Map controls: compact, high-contrast, touch-safe.
- KPI cards: informational, subordinate to the map.
- Category rows: dense and scan-friendly.
- Establishment card: richest component; image/context first, then identity, category, reconciliation and useful details.
- Author block: visible but secondary to the municipal product.

## Establishment imagery policy

Image truthfulness outranks coverage.

1. Explicit image reference attached to the establishment → label as **Imagen vinculada** and show its source.
2. Open street-level imagery within 40 m → label as **Imagen de entorno**, with source, capture date, distance, provider/author and license.
3. No sufficiently attributable image → show **Sin foto abierta vinculada**. Never substitute an unrelated stock image or imply that a distant street image depicts the storefront.

A nearby image is contextual evidence, not proof of the establishment's current facade or administrative status.

## Responsive rules

- Mobile-first.
- No horizontal page scrolling.
- Minimum touch target: 44 × 44 px for primary interactive controls.
- Bottom navigation on narrow layouts; sidebar on desktop.
- Map gets full content width on narrow layouts.
- On wide desktop, target roughly 80–85% of the map/category row for the map when content remains legible.
- Respect safe-area insets and reduced-motion preferences.

## Accessibility floor

- Keyboard-operable navigation and controls.
- Visible focus state.
- Meaningful ARIA labels for icon-only controls.
- Text alternatives for images; captions disclose source/context.
- Contrast target WCAG 2.2 AA.
- Do not remove browser zoom.
- Data/status never depends on hue alone.

## Performance rules

- Heavy 3D assets are lazy-loaded.
- Establishment imagery is lazy-loaded.
- Data enrichment happens at build time whenever possible.
- The frontend filters and renders; it should not redo expensive reconciliation work.
- Service worker uses versioned caches and network-first updates for local application assets.

## Anti-patterns

- Turning every section into an identical rounded card.
- Making 3D more prominent than establishment lookup.
- Oversized category charts that steal map width.
- Treating OSM historical representation as real business openings/closures.
- Calling open-source presence a municipal census or administrative validation.
- Showing a random or distant photo as if it were the establishment.
- Adding UI because it looks impressive but does not answer an operational question.

## Change rule

Before adding a new visual pattern, first check whether an existing pattern can express the same job. If a new pattern is necessary, add its intent here and reuse tokens rather than introducing isolated hardcoded values.
