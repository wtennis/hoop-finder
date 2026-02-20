# HoopFinder

A map of every place you can play basketball in Seattle -- outdoor courts, community center open gyms, and pickup runs.

## Quick Start

**1. Fetch court and center data from Seattle's ArcGIS APIs:**

```bash
node scripts/fetch-courts.js
```

This saves `data/sources/courts.geojson` (66 outdoor courts) and `data/sources/centers.geojson` (28 community centers).

**2. Build the merged data file:**

```bash
node scripts/build-data.js
```

This merges courts, centers, and curated schedule data (`data/curated/schedules.json`) into a single `data/hoop-finder.json` that the frontend loads.

**3. Open in browser:**

```bash
npx serve .
```

Or open `index.html` directly via a local HTTP server. (Note: `file://` won't work due to fetch() requiring HTTP.)

## Project Structure

```
hoop-finder/
  index.html              # Single-page app
  css/style.css           # Mobile-first styles
  js/app.js               # Map logic (Leaflet + data rendering)
  data/
    hoop-finder.json      # Merged runtime data (generated)
    sources/
      courts.geojson      # From ArcGIS Basketball Court Points
      centers.geojson     # From ArcGIS Community Centers
    curated/
      schedules.json      # Manually maintained schedule data
  scripts/
    fetch-courts.js       # Pulls data from ArcGIS APIs
    build-data.js         # Merges sources + schedules into runtime JSON
```

## Updating Schedule Data

Edit `data/curated/schedules.json` with new open gym times, then rebuild:

```bash
node scripts/build-data.js
```

## Requirements

- Node.js 18+ (uses native fetch)
- No npm dependencies
