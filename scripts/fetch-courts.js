#!/usr/bin/env node

/**
 * fetch-courts.js
 *
 * Fetches basketball court locations and community center data from
 * Seattle's ArcGIS APIs. Saves raw GeoJSON to data/sources/.
 *
 * Usage: node scripts/fetch-courts.js
 * No dependencies beyond Node.js built-ins (uses native fetch).
 */

const fs = require('fs');
const path = require('path');

const COURTS_URL =
  'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Basketball_Court_Points/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326';

const CENTERS_URL =
  'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Community_Centers/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326';

const SOURCES_DIR = path.join(__dirname, '..', 'data', 'sources');

async function fetchAndSave(url, filename, label) {
  console.log(`Fetching ${label}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();

  const count = data.features ? data.features.length : 0;
  console.log(`  Got ${count} features`);

  const outPath = path.join(SOURCES_DIR, filename);
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  Saved to ${outPath}`);

  return data;
}

async function main() {
  console.log('HoopFinder: Fetching data from ArcGIS APIs\n');

  const courts = await fetchAndSave(COURTS_URL, 'courts.geojson', 'Basketball Court Points');
  const centers = await fetchAndSave(CENTERS_URL, 'centers.geojson', 'Community Centers');

  console.log('\nDone!');
  console.log(`  Courts: ${courts.features?.length ?? 0} locations`);
  console.log(`  Centers: ${centers.features?.length ?? 0} locations`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
