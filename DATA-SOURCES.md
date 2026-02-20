# HoopFinder - Data Sources Research

**Research Date:** February 20, 2026
**Purpose:** Assess publicly available data sources for building a map-based Seattle pickup/pay-to-play basketball finder

## Executive Summary

Seattle has **strong foundational data** for court locations and community center info via official ArcGIS APIs. The main gap is **scheduling data** — open gym times, pickup runs, and pay-to-play sessions are locked in PDFs (seasonal brochures) and a JavaScript-heavy registration portal (ActiveCommunities). A curated, single-maintainer model is the right approach for filling schedule gaps with manual research.

---

## 1. Basketball Court Locations (PRIMARY SOURCE)

**Dataset:** Seattle Parks Basketball Court Polygons
**URL:** https://data.seattle.gov/datasets/SeattleCityGIS::basketball-court-polygons
**API:** `https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Basketball_Court_Polygons/FeatureServer/0`

| Attribute | Detail |
|-----------|--------|
| Format | ArcGIS GeoService (JSON/REST). Downloads: GeoJSON, Shapefile, CSV, KML, SQLite |
| Fields | FACILITY_NAME, FACILITY_ID, COURT_ID, court size specs, GIS_AREA, GIS_LENGTH |
| Spatial Ref | 2926 (WA State Plane North) |
| Max per query | 2,000 records |
| Auth | None required |
| Update freq | Weekly |
| Quality | Official Seattle Parks data, maintained by Parks PLANT team |

**Assessment:** This is the foundation layer. Every court in the Seattle Parks system with full geospatial boundaries. No auth, free, well-maintained.

---

## 2. Community Centers (ESSENTIAL)

**Dataset:** Seattle Community Centers
**URL:** https://data.seattle.gov/datasets/SeattleCityGIS::community-centers-3
**API:** `https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Community_Centers/FeatureServer/0`

| Attribute | Detail |
|-----------|--------|
| Format | ArcGIS GeoService (JSON/REST). Downloads: GeoJSON, CSV, Shapefile, KML |
| Fields | Facility name, address, phone, location coords, center type (Local/Neighborhood/Regional), operating hours by day and season, occupancy capacity, programming links, ActiveNet IDs |
| Auth | None required |
| Update freq | Weekly |
| Quality | Official data with hours, programming links, website URLs per facility |

**Assessment:** Essential companion to court data. Operating hours and programming links point to open gym schedules. Center type helps users understand facility size.

---

## 3. Seattle Parks & Rec Seasonal Brochures

**URL:** https://www.seattle.gov/parks-and-recreation/programs
**Spring 2026:** https://www.seattle.gov/documents/Departments/ParksAndRecreation/Programs/2026%20Spring%20Recreation%20Brochure%20ADA.pdf

| Attribute | Detail |
|-----------|--------|
| Format | PDF (seasonal brochures) |
| Content | Adult basketball leagues, drop-in open gym times, pay-to-play sessions, fees, schedules |
| Update freq | Seasonal (4x/year — Spring, Summer, Fall, Winter) |
| Scrapability | Moderate — structured text in PDF, requires parsing/OCR or manual extraction |

**Assessment:** This is where the schedule data lives. Each brochure contains program listings with dates, times, locations, and fees. Not machine-readable, but structured enough for manual extraction or PDF parsing. Four updates per year is manageable for a single maintainer.

---

## 4. ActiveCommunities Registration Portal

**URL:** https://anc.apm.activecommunities.com/seattle/

| Attribute | Detail |
|-----------|--------|
| Format | JavaScript web app (dynamic content) |
| Content | Basketball programs, open gym sessions, registration status, enrollment, dates/times/costs |
| Update freq | Real-time (programs fill/close dynamically) |
| Scrapability | Challenging — requires JS rendering, browser automation |
| Auth | None for browsing; account needed for registration |

**Assessment:** Richest programming data source, but hardest to ingest. Could contact Seattle Parks about API access. For MVP, manual extraction from this portal + brochures is more practical than scraping.

---

## 5. Park Boundaries (CONTEXT)

**Dataset:** Seattle Park Boundary Details
**URL:** https://data.seattle.gov/datasets/SeattleCityGIS::park-boundary-details
**Format:** ArcGIS GeoService (GeoJSON, Shapefile, CSV)

**Assessment:** Useful for map context — shows park boundaries around court locations. Lower priority but nice for UX.

---

## 6. OpenStreetMap (SUPPLEMENTARY)

**URL:** https://www.openstreetmap.org

Basketball court tagging schema:
```
leisure=pitch
sport=basketball
hoops=2 (full court) / hoops=1 (half court)
surface=acrylic|concrete|asphalt
lit=yes|no
covered=yes|no
indoor=yes|no
```

| Attribute | Detail |
|-----------|--------|
| Format | Crowdsourced geographic data |
| Auth | None |
| License | ODbL (attribution required) |
| Seattle coverage | Moderate — catches community/outdoor courts not in Parks system |

**Assessment:** Good for filling gaps — private courts, school yards, outdoor hoops at non-Parks locations. Crowdsourced quality varies.

---

## 7. Other Sources Investigated

### PSBL (Puget Sound Basketball League)
- **URL:** https://psbl.org
- Schedule info available but not machine-readable
- No public API
- Could be manually tracked since it's a known league

### Seattle Public Schools
- No public gym scheduling API
- Gyms controlled by individual schools
- Not a viable programmatic source

### Existing Pickup Basketball Apps
- No comprehensive app covering Seattle specifically found
- Generic apps (PickupBall, CourtFinder) have limited Seattle data
- This is the gap HoopFinder would fill

---

## 8. Mapping & Geocoding Infrastructure

### Mapping: Leaflet + OpenStreetMap (RECOMMENDED for MVP)

| Tool | Cost | Notes |
|------|------|-------|
| **Leaflet.js** | Free (BSD 2-Clause) | 42KB, no dependencies, mobile-friendly, used by GitHub/Facebook/WaPo |
| **OpenStreetMap tiles** | Free (ODbL) | Attribution required, ~3 req/sec per IP |
| **Mapbox** | Free tier, then paid | More polished, higher cost |
| **Google Maps** | $200/mo credit (10k events) | Overkill for MVP |

### Geocoding: Nominatim (RECOMMENDED)

| Attribute | Detail |
|-----------|--------|
| URL | https://nominatim.openstreetmap.org |
| Cost | Free |
| Auth | None (custom user-agent required) |
| Rate limit | 1 request/second |
| License | Free, open source |

**Assessment:** Leaflet + OSM tiles + Nominatim = $0/month for MVP. More than sufficient for a curated, single-maintainer app.

---

## 9. Data Gaps & Challenges

1. **No public scheduling API** — Seattle Parks doesn't expose open gym schedules programmatically. Brochures and ActiveCommunities are the sources, both require manual extraction.
2. **No pickup game directory** — Informal runs aren't tracked anywhere. This is user-contributed or maintainer-curated data.
3. **Pay-to-play venues** — Private facilities not in official databases. Manual research required.
4. **Seasonal changes** — Indoor gym availability shifts quarterly. Requires regular updates tied to brochure releases.
5. **School/private courts** — Permissions and access vary. Not in any central database.

---

## 10. Recommended Approach

### Data Layer 1: Static Court Locations (automated)
- Ingest basketball courts from ArcGIS API (weekly refresh)
- Ingest community centers from ArcGIS API (weekly refresh)
- Supplement with OpenStreetMap data for non-Parks courts

### Data Layer 2: Schedules & Programs (manual/seasonal)
- Extract from seasonal brochures (4x/year)
- Cross-reference with ActiveCommunities portal
- Maintainer curates and updates a structured schedule file (JSON/YAML)

### Data Layer 3: Pickup Runs & Community Knowledge (curated)
- Maintainer adds known pickup runs from personal experience
- Structured format: location, day/time, typical skill level, indoor/outdoor, cost
- Eventually could accept community submissions

### Tech Stack
- **Frontend:** Leaflet + OpenStreetMap tiles
- **Data format:** GeoJSON for courts, JSON for schedules
- **Hosting:** Static site (GitHub Pages or Netlify) for MVP — no backend needed initially
- **Geocoding:** Nominatim (batch geocode addresses at build time)
