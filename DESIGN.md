# HoopFinder -- MVP Design Document

**Created:** February 20, 2026
**Status:** Draft
**Author:** Maintainer + Claude

---

## 1. Product Vision

HoopFinder is a mobile-friendly map of every place you can play basketball in Seattle -- outdoor courts, community center open gyms, pay-to-play sessions, and known pickup runs. It is built for the player who wants to hoop tonight and needs to know where, when, and how much. Unlike generic court-finder apps with sparse, stale data, HoopFinder is curated by someone who actually plays in Seattle and keeps the info current. It is a single-maintainer, community-oriented project: no accounts, no ads, no data extraction. Just a map that answers "where can I play right now?"

---

## 2. MVP Scope

### In v1

- Interactive map of Seattle showing all basketball court locations (66 parks courts from Seattle Parks data)
- Community center markers (28 centers) with hours and links to basketball programming
- Manually curated schedule data for open gym sessions and pay-to-play at community centers
- Manually curated pickup run data (days/times/vibe) from maintainer's firsthand knowledge
- Filter by: outdoor vs indoor, free vs paid, day of week, "happening today"
- Tap a marker to see court details, schedule, and any known runs
- Mobile-first responsive layout
- Static site, no backend, $0/month hosting

### Explicitly deferred (not in v1)

- User accounts or authentication
- Crowdsourced submissions (community contributions form)
- Push notifications or alerts
- Real-time court occupancy or check-ins
- School gyms, private facilities, or non-Seattle-Parks courts
- OpenStreetMap court supplementation
- PSBL league schedule integration
- Automated scraping of ActiveCommunities portal
- Automated PDF parsing of seasonal brochures
- Search by address or "near me" geolocation
- PWA offline support

---

## 3. User Stories

1. **Find a court nearby.** As a player looking at my phone, I want to see basketball courts on a map so I can find one near me and get directions.

2. **Check if a gym is open tonight.** As someone who wants to play indoors, I want to see which community centers have open gym tonight and what time, so I can plan my evening.

3. **Find a pickup run.** As a player new to Seattle (or new to a neighborhood), I want to see where known pickup runs happen, what days/times, and what the vibe is (competitive vs casual), so I can show up prepared.

4. **Filter for free courts.** As a player on a budget, I want to filter the map to show only free outdoor courts so I skip the paid open gym sessions.

5. **Filter by day of week.** As someone planning my week, I want to see what is available on a specific day (e.g., "What runs on Wednesday?") so I can schedule around work.

6. **See what is happening today.** As a player who wants to hoop right now, I want a "today" filter that shows courts with activity today, ordered by soonest start time.

7. **Get details on a specific court.** As a player tapping a marker, I want to see: park name, address, court type (full/half), number of courts, whether it is lit, any known schedule or runs, and a link to Google Maps directions.

8. **Know when data was last updated.** As a user, I want to see when the schedule data was last updated so I know if the info is fresh or stale.

---

## 4. Data Model

All data lives in static JSON files committed to the repo. Two source data files plus one curated file, merged into a single runtime file at build time.

### 4.1 Courts Data (auto-fetched from ArcGIS)

File: `data/sources/courts.geojson`

Fetched from the Basketball Court Points API (not Polygons -- the Points dataset has park names, addresses, and court counts whereas the Polygons dataset has null facility names across all records). Stored as GeoJSON with normalized field names.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.363, 47.561]
      },
      "properties": {
        "id": "court-450",
        "source_id": "450",
        "name": "Delridge Playfield",
        "address": "4458 Delridge Way SW",
        "court_type": "full",
        "court_count": 1,
        "lat": 47.561,
        "lng": -122.363
      }
    }
  ]
}
```

**Source API:** `Basketball_Court_Points/FeatureServer/0`
**Key fields from source:** PARKNAME, ADDRESS, TYPE (Full/Half/Both), NUMBEROFCOURTS, LATITUDE, LONGITUDE, PMAID

### 4.2 Community Centers Data (auto-fetched from ArcGIS)

File: `data/sources/centers.geojson`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.311, 47.600]
      },
      "properties": {
        "id": "center-garfield",
        "source_id": "GARFIELD",
        "name": "Garfield Community Center",
        "address": "2323 E Cherry St",
        "phone": "206-684-4788",
        "center_type": "neighborhood",
        "website": "https://...",
        "basketball_link": "https://...",
        "hours": {
          "monday": "10:00 AM - 9:00 PM",
          "tuesday": "10:00 AM - 9:00 PM",
          "wednesday": "10:00 AM - 9:00 PM",
          "thursday": "10:00 AM - 9:00 PM",
          "friday": "10:00 AM - 9:00 PM",
          "saturday": "10:00 AM - 5:00 PM",
          "sunday": "closed"
        }
      }
    }
  ]
}
```

**Source API:** `Community_Centers/FeatureServer/0`
**Key fields from source:** NAME, ADDRESS, PHONE, CCTYPE, WEBSITE_LINK, BASKETBALL_LINK, HOURS_MONDAY through HOURS_SATURDAY, LATITUDE, LONGITUDE

### 4.3 Curated Schedule and Run Data (manually maintained)

File: `data/curated/schedules.json`

This is the core value-add -- the data that does not exist anywhere else in structured form. The maintainer updates this file directly.

```json
{
  "last_updated": "2026-02-20",
  "season": "Spring 2026",
  "brochure_url": "https://www.seattle.gov/documents/Departments/ParksAndRecreation/Programs/2026%20Spring%20Recreation%20Brochure%20ADA.pdf",
  "events": [
    {
      "id": "evt-garfield-open-gym-mwf",
      "location_id": "center-garfield",
      "type": "open_gym",
      "title": "Open Gym - Adult Basketball",
      "indoor": true,
      "cost": 5.00,
      "cost_note": "Drop-in fee",
      "schedule": {
        "days": ["monday", "wednesday", "friday"],
        "start_time": "11:30",
        "end_time": "13:30",
        "exceptions": "No session on holidays"
      },
      "season_start": "2026-03-01",
      "season_end": "2026-05-31",
      "notes": "Competitive. Runs full court 5v5. Gets crowded by noon.",
      "vibe": "competitive",
      "source": "brochure"
    },
    {
      "id": "evt-greenlake-pickup-sat",
      "location_id": "court-307",
      "type": "pickup",
      "title": "Green Lake Saturday Runs",
      "indoor": false,
      "cost": 0,
      "cost_note": null,
      "schedule": {
        "days": ["saturday", "sunday"],
        "start_time": "10:00",
        "end_time": "14:00",
        "exceptions": "Weather dependent"
      },
      "season_start": "2026-04-01",
      "season_end": "2026-09-30",
      "notes": "Outdoor full court. Regulars show up around 10:30. All levels welcome.",
      "vibe": "casual",
      "source": "firsthand"
    }
  ]
}
```

**Enums:**

| Field | Values |
|-------|--------|
| Event type | `open_gym`, `pickup`, `league`, `drop_in` |
| Vibe | `competitive`, `casual`, `mixed`, `unknown` |
| Source | `brochure`, `activecommunities`, `firsthand`, `community_tip` |

### 4.4 Merged Runtime Data (generated at build time)

File: `data/hoop-finder.json`

A build script merges courts, centers, and schedules into one file optimized for the frontend. Each location gets its associated events attached.

```json
{
  "generated_at": "2026-02-20T10:00:00Z",
  "data_version": "2026-spring-v1",
  "locations": [
    {
      "id": "court-307",
      "type": "outdoor_court",
      "name": "Green Lake Park",
      "address": "7201 East Green Lake Dr N",
      "lat": 47.680,
      "lng": -122.328,
      "court_type": "both",
      "court_count": 2,
      "indoor": false,
      "cost": "free",
      "events": [
        {
          "id": "evt-greenlake-pickup-sat",
          "type": "pickup",
          "title": "Green Lake Saturday Runs",
          "days": ["saturday", "sunday"],
          "start_time": "10:00",
          "end_time": "14:00",
          "cost": 0,
          "vibe": "casual",
          "notes": "Outdoor full court. Regulars show up around 10:30. All levels welcome.",
          "season_start": "2026-04-01",
          "season_end": "2026-09-30"
        }
      ]
    },
    {
      "id": "center-garfield",
      "type": "community_center",
      "name": "Garfield Community Center",
      "address": "2323 E Cherry St",
      "lat": 47.600,
      "lng": -122.311,
      "indoor": true,
      "cost": "paid",
      "center_hours": {
        "monday": "10:00 AM - 9:00 PM",
        "tuesday": "10:00 AM - 9:00 PM"
      },
      "basketball_link": "https://...",
      "events": []
    }
  ]
}
```

---

## 5. Architecture

```
+------------------+     +------------------+     +-----------------+
|  ArcGIS APIs     |     |  Seasonal        |     |  Maintainer's   |
|  (Courts,        |---->|  Brochure PDF    |---->|  Knowledge      |
|  Centers)        |     |  (manual read)   |     |  (pickup runs)  |
+--------+---------+     +--------+---------+     +--------+--------+
         |                        |                        |
    fetch script            manual entry              manual entry
         |                        |                        |
         v                        v                        v
  data/sources/            data/curated/            data/curated/
  courts.geojson           schedules.json           schedules.json
  centers.geojson
         |                        |                        |
         +----------+-------------+------------------------+
                    |
              build script
              (merge.js)
                    |
                    v
          data/hoop-finder.json
                    |
                    v
         +-------------------+
         |   Static Site     |
         |   index.html      |
         |   app.js          |
         |   style.css       |
         |   Leaflet + OSM   |
         +-------------------+
                    |
                    v
         +-------------------+
         |  GitHub Pages     |
         |  (or Netlify)     |
         +-------------------+
```

**Key principle:** The frontend is a single-page static site that loads one JSON file and renders everything client-side. No server, no API calls at runtime (except map tile requests to OpenStreetMap). All data processing happens at build time via simple Node scripts.

---

## 6. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Map library** | Leaflet.js | 42KB, zero dependencies, mobile-friendly, free, battle-tested. No framework needed. |
| **Map tiles** | OpenStreetMap (default) | Free, attribution only. Good enough for MVP. |
| **Frontend** | Vanilla HTML/CSS/JS | No framework. One HTML file, one JS file, one CSS file. Zero build step for the frontend itself. Frameworks add complexity without value at this scale. |
| **Data processing** | Node.js scripts | Simple fetch-and-merge scripts. Node is already installed. Could also be Python or shell scripts -- the choice is not load-bearing. |
| **Hosting** | GitHub Pages | Free, deploys from repo, custom domain support, HTTPS included. No CI/CD needed for MVP -- just push to main. |
| **Source control** | Git + GitHub | Standard. Repo is the single source of truth for both code and data. |
| **Geocoding** | Not needed for MVP | ArcGIS data already includes lat/lng. Defer "search by address" to post-MVP. |

**What is deliberately not in the stack:** React, TypeScript, Tailwind, Vite, any bundler, any CSS framework, any database, any serverless functions, any CI/CD pipeline. Every one of these can be added later if needed. None are needed now.

---

## 7. UI/UX Concept

### Mobile layout (primary)

```
+------------------------------------------+
|  HOOPFINDER                    [filters] |
|  Seattle Pickup Basketball               |
+------------------------------------------+
|                                          |
|              MAP                         |
|         (full viewport)                  |
|                                          |
|       [O] outdoor court                  |
|       [C] community center              |
|       [P] pickup run marker             |
|                                          |
|                                          |
|                                          |
|                                          |
+------------------------------------------+
|  Today: Wed Feb 20                       |
|  3 sessions happening today              |
+------------------------------------------+
```

Tapping a marker opens a bottom sheet:

```
+------------------------------------------+
|  ================================  (drag)|
|                                          |
|  Green Lake Park                         |
|  7201 East Green Lake Dr N               |
|  Outdoor | Full + Half court | 2 hoops   |
|  [Directions]                            |
|                                          |
|  --- RUNS ---                            |
|  Sat-Sun 10am-2pm                        |
|  Casual pickup. Regulars by 10:30.       |
|  Free | Weather dependent                |
|  Season: Apr 1 - Sep 30                  |
|                                          |
|  Last updated: Feb 20, 2026             |
+------------------------------------------+
```

### Desktop layout

Same content, but the detail panel appears as a sidebar on the right (roughly 360px wide) rather than a bottom sheet. Map takes the remaining width.

### Map markers

- **Orange circle** -- Outdoor court (no known schedule/run)
- **Blue circle** -- Community center with gym
- **Pulsing ring on any marker** -- Has an event happening today
- Marker size scales slightly with court count (1 court = small, 2+ = medium)

### Filter panel (slide-down from header)

```
+------------------------------------------+
|  Show:  [x] Outdoor  [x] Indoor         |
|         [x] Free     [x] Paid           |
|                                          |
|  Day:   [Any] [Today] [Mon] [Tue] ...   |
|                                          |
|  Vibe:  [Any] [Casual] [Competitive]    |
+------------------------------------------+
```

Filters are toggle chips, not dropdowns. Fast to tap on mobile. State persists in URL hash so links are shareable (e.g., `#indoor=true&day=wednesday`).

### Interactions

- **Map loads** centered on Seattle (47.6062, -122.3321), zoom level 12
- **Tap a marker** -- Bottom sheet (mobile) or sidebar (desktop) slides up with location details and any associated events
- **Tap "Directions"** -- Opens Google Maps directions in a new tab
- **Filter changes** -- Markers instantly show/hide. No loading spinner needed (all data is client-side)
- **"Happening today" bar** -- A small bar below the header showing count of today's events. Tapping it zooms the map to fit all today's markers.

---

## 8. Data Pipeline

### 8.1 Automated: ArcGIS court and center data

A Node script (`scripts/fetch-data.js`) queries the two ArcGIS APIs and writes the results to `data/sources/`.

```
scripts/fetch-data.js
  -> GET Basketball_Court_Points?where=1=1&outFields=*&f=geojson&outSR=4326
  -> GET Community_Centers?where=1=1&outFields=*&f=geojson&outSR=4326
  -> Normalize field names (lowercase, consistent)
  -> Generate stable IDs from PMAID (courts) and NAME slug (centers)
  -> Write data/sources/courts.geojson
  -> Write data/sources/centers.geojson
```

**Frequency:** Run manually when desired. Court locations rarely change -- monthly is fine for MVP. Could be automated via GitHub Actions post-MVP.

**Important API notes:**
- Both APIs have a `resultRecordCount` limit but `exceededTransferLimit` flag indicates truncation. The fetch script must paginate if needed (unlikely -- 66 courts and 28 centers both fit in one request well under the 2,000 record limit).
- Request `outSR=4326` to get WGS84 coordinates (lat/lng) instead of the default WA State Plane projection.

### 8.2 Manual: Schedules and pickup runs

The maintainer edits `data/curated/schedules.json` directly. This is the high-value, labor-intensive part.

**Workflow:**
1. New season brochure drops (4x/year)
2. Maintainer reads PDF, extracts basketball-related programs
3. Updates `schedules.json` with new events, removes expired ones
4. Cross-references with ActiveCommunities portal for any corrections
5. Adds/updates pickup run info from personal experience or community tips

**Time estimate:** 2-3 hours per seasonal update. Smaller ad hoc updates (new pickup run discovered, time change) take 5 minutes.

### 8.3 Build: Merge step

A Node script (`scripts/build-data.js`) merges the three source files into one runtime file.

```
scripts/build-data.js
  -> Read data/sources/courts.geojson
  -> Read data/sources/centers.geojson
  -> Read data/curated/schedules.json
  -> Join events to locations by location_id
  -> Compute derived fields (indoor/outdoor, cost category)
  -> Validate: warn on events referencing non-existent location_ids
  -> Write data/hoop-finder.json
```

**Frequency:** Run before every deploy. Takes less than 1 second.

### 8.4 End-to-end update workflow

```bash
# Refresh ArcGIS data (optional, locations rarely change)
node scripts/fetch-data.js

# Edit schedule data
$EDITOR data/curated/schedules.json

# Rebuild merged data
node scripts/build-data.js

# Test locally
npx serve .  # or just open index.html

# Deploy
git add data/ && git commit -m "Update spring 2026 schedules" && git push
# GitHub Pages auto-deploys from main
```

---

## 9. Project Structure

```
hoop-finder/
  index.html                  # Single page app entry point
  css/
    style.css                 # All styles, mobile-first
  js/
    app.js                    # Main application logic
    map.js                    # Leaflet map setup and marker management
    filters.js                # Filter state and UI
    detail.js                 # Bottom sheet / sidebar detail panel
  data/
    hoop-finder.json          # Merged runtime data (generated, committed)
    sources/
      courts.geojson          # From ArcGIS Basketball Court Points
      centers.geojson         # From ArcGIS Community Centers
    curated/
      schedules.json          # Manually maintained events and runs
  scripts/
    fetch-data.js             # Pulls data from ArcGIS APIs
    build-data.js             # Merges sources + curated into runtime JSON
  assets/
    favicon.ico
    og-image.png              # Social sharing image
  DESIGN.md                   # This document
  DATA-SOURCES.md             # Data source research
  LICENSE                     # MIT
```

**Total frontend files:** 1 HTML + 1 CSS + 4 small JS modules. No build step for the frontend. JS modules loaded via `<script type="module">` (native ES modules, supported by all modern browsers). No bundler needed.

**The generated `data/hoop-finder.json` is committed to the repo.** This means the site works immediately on GitHub Pages without any build step during deploy. The build script is only run locally when data changes.

---

## 10. Milestones

### Milestone 1: Static Map with Courts

**Target:** 1 week of evenings
**Goal:** Get a live page with a map showing all 66 basketball courts.

- [ ] Set up repo and GitHub Pages
- [ ] Write `scripts/fetch-data.js` to pull court points from ArcGIS
- [ ] Create `index.html` with Leaflet map, centered on Seattle
- [ ] Load `courts.geojson` and render orange circle markers
- [ ] Tap a marker shows park name, address, court type, court count in a basic Leaflet popup
- [ ] Mobile-responsive (map fills viewport)
- [ ] Deploy to GitHub Pages

**Done when:** You can open it on your phone and see every Seattle Parks basketball court on a map.

### Milestone 2: Add Community Centers and Detail Panel

**Target:** 1 week of evenings
**Goal:** Add the 28 community centers and upgrade from popups to a proper detail panel.

- [ ] Extend `scripts/fetch-data.js` to also fetch community centers
- [ ] Add center markers with blue color to distinguish from courts
- [ ] Build bottom sheet component (mobile) and sidebar variant (desktop)
- [ ] Show center hours, phone, website link, basketball programming link
- [ ] Add "Directions" link (opens Google Maps with address)
- [ ] Write `scripts/build-data.js` to merge courts and centers
- [ ] Add "last updated" timestamp to page footer

**Done when:** Tapping any marker shows a clean detail panel with all relevant info.

### Milestone 3: Add Schedules and Pickup Runs

**Target:** 1-2 weeks of evenings
**Goal:** The core value -- schedule data that does not exist anywhere else.

- [ ] Seed `data/curated/schedules.json` with open gym sessions from current brochure
- [ ] Add known pickup runs from personal experience (start with 5-10 reliable ones)
- [ ] Update `scripts/build-data.js` to join events to locations
- [ ] Display events in the detail panel for each location
- [ ] Build filter UI: outdoor/indoor, free/paid, day of week, vibe
- [ ] Add "happening today" pulsing indicator on markers
- [ ] Add "today" summary bar below header
- [ ] Persist filter state in URL hash for shareable links

**Done when:** You can open the app on your phone, tap "Today", and see every basketball session happening in Seattle right now.

### Milestone 4: Polish and Ship

**Target:** 1 week of evenings
**Goal:** Make it feel finished enough to share publicly.

- [ ] Add OpenGraph meta tags for social sharing (title, description, image)
- [ ] Create a simple favicon
- [ ] Add an "About" section: what this is, who maintains it, how often data is updated
- [ ] Add a "Data freshness" indicator showing last schedule update date
- [ ] Test on iOS Safari, Android Chrome, desktop Chrome/Firefox
- [ ] Fix any UX papercuts found during real-world testing
- [ ] Optional: set up custom domain if a good one is available
- [ ] Share with basketball community (pickup regulars, PSBL group chat, r/Seattle)

**Done when:** You are comfortable texting the link to your basketball group chat.

---

## Appendix A: Key API Endpoints

**Basketball Courts (66 records):**
```
https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Basketball_Court_Points/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326
```
Fields: PARKNAME, ADDRESS, TYPE (Full/Half/Both), NUMBEROFCOURTS, LATITUDE, LONGITUDE, PMAID

**Community Centers (28 records):**
```
https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Community_Centers/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326
```
Fields: NAME, ADDRESS, PHONE, CCTYPE, WEBSITE_LINK, BASKETBALL_LINK, HOURS_MONDAY through HOURS_SATURDAY, LATITUDE, LONGITUDE, ACTIVE_SITE_ID

## Appendix B: Why Court Points, Not Court Polygons

The ArcGIS data offers two basketball court datasets:

- **Basketball_Court_Points** -- 66 records with PARKNAME, ADDRESS, TYPE (Full/Half/Both), NUMBEROFCOURTS, and coordinates. This is the one to use.
- **Basketball_Court_Polygons** -- Precise court boundary polygons, but FACILITY_NAME is null across all records. Only useful for drawing court outlines on the map, which is not needed for MVP.

The Points dataset is the correct primary source because it has all the human-readable metadata needed for the detail panel. The Polygons dataset could be layered on later for visual polish.

## Appendix C: Design Principles

1. **Data is the product.** Anyone can put pins on a map. The value is in knowing which gym has competitive open gym on Wednesdays and which park has casual pickup on Saturday mornings. Invest time in data quality, not frontend polish.

2. **Ship something small and real.** Milestone 1 is useful the day it ships. A map of every court in Seattle, on your phone, with tap-for-details -- that is already better than what exists.

3. **Boring technology.** Leaflet has been stable for a decade. Vanilla JS does not break between framework versions. Static hosting does not go down. These choices free up time and attention for the actual hard part: maintaining good data.

4. **Single-maintainer sustainability.** Every design decision is filtered through "can one person keep this running in 30 minutes a week?" No crowdsourcing to moderate, no servers to patch, no frameworks to upgrade. The update workflow is: edit a JSON file, run a script, push.

5. **Mobile-first but not mobile-only.** Most users will check on their phone before heading to a court. The desktop experience matters less but should not be broken.
