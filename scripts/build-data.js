#!/usr/bin/env node

/**
 * build-data.js
 *
 * Merges courts.geojson, centers.geojson, and curated schedules.json
 * into a single data/hoop-finder.json for the frontend.
 *
 * Usage: node scripts/build-data.js
 */

const fs = require('fs');
const path = require('path');

const SOURCES_DIR = path.join(__dirname, '..', 'data', 'sources');
const CURATED_DIR = path.join(__dirname, '..', 'data', 'curated');
const OUT_PATH = path.join(__dirname, '..', 'data', 'hoop-finder.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Build a lookup of center names to their IDs for fuzzy matching schedules.
 * We normalize names so "Garfield Community Center" matches regardless of
 * minor variations in the schedule data.
 */
function normalizeCenterName(name) {
  return name
    .toLowerCase()
    .replace(/community center/gi, '')
    .replace(/c\.c\./gi, '')
    .replace(/\bpark\b/gi, '')   // "Jefferson Park CC" -> "Jefferson CC"
    .replace(/[\/]/g, ' ')       // "International District/Chinatown" -> split
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Try multiple matching strategies for a schedule center name against
 * the location lookup. Returns the matched location or null.
 */
function findCenter(centerName, centerLookup) {
  // 1. Exact normalized match
  const key = normalizeCenterName(centerName);
  if (centerLookup.has(key)) return centerLookup.get(key);

  // 2. Check if any lookup key starts with or contains a significant portion
  for (const [locKey, loc] of centerLookup.entries()) {
    // Check if one name contains the other (after normalization)
    if (locKey.includes(key) || key.includes(locKey)) {
      return loc;
    }
  }

  // 3. Word-overlap matching — if 2+ significant words match
  const keyWords = key.split(' ').filter((w) => w.length > 2);
  for (const [locKey, loc] of centerLookup.entries()) {
    const locWords = locKey.split(' ').filter((w) => w.length > 2);
    const overlap = keyWords.filter((w) => locWords.includes(w));
    if (overlap.length >= 1 && overlap.length >= Math.min(keyWords.length, locWords.length) * 0.5) {
      return loc;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Load source files
// ---------------------------------------------------------------------------

function loadJSON(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Process courts
// ---------------------------------------------------------------------------

function processCourts(geojson) {
  return geojson.features.map((f) => {
    const p = f.properties;
    const coords = f.geometry.coordinates; // [lng, lat]
    return {
      id: `court-${p.PMAID || p.OBJECTID}`,
      type: 'outdoor_court',
      name: p.PARKNAME || 'Unknown Court',
      address: p.ADDRESS || '',
      lat: coords[1],
      lng: coords[0],
      court_type: (p.TYPE || 'unknown').toLowerCase(),
      court_count: p.NUMBEROFCOURTS || 1,
      indoor: false,
      cost: 'free',
      events: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Process centers
// ---------------------------------------------------------------------------

function processCenters(geojson) {
  return geojson.features.map((f) => {
    const p = f.properties;
    const coords = f.geometry.coordinates;

    // Build hours object from the day/hours fields
    const hours = {};
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (const day of days) {
      const dayKey = `DAY_${day.toUpperCase()}`;
      const hoursKey = `HOURS_${day.toUpperCase()}`;
      if (p[dayKey] === 'Yes' && p[hoursKey]) {
        hours[day] = p[hoursKey];
      } else if (p[dayKey] === 'No') {
        hours[day] = 'closed';
      }
    }

    // Normalize phone — some entries only have the last 7 digits
    let phone = p.PHONE || '';
    if (phone && !phone.startsWith('206')) {
      phone = '206-' + phone;
    }

    return {
      id: `center-${slugify(p.NAME || '')}`,
      type: 'community_center',
      name: p.NAME || 'Unknown Center',
      address: p.ADDRESS || '',
      lat: coords[1],
      lng: coords[0],
      phone,
      indoor: true,
      cost: 'varies',
      center_hours: Object.keys(hours).length > 0 ? hours : null,
      website: p.WEBSITE_LINK || null,
      basketball_link: p.BASKETBALL_LINK || null,
      events: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Match schedules to locations
// ---------------------------------------------------------------------------

function matchSchedules(locations, schedules) {
  // Build a lookup by normalized center name -> location
  const centerLookup = new Map();
  for (const loc of locations) {
    if (loc.type === 'community_center') {
      const key = normalizeCenterName(loc.name);
      centerLookup.set(key, loc);
    }
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedNames = new Set();

  for (const evt of schedules.events) {
    const centerName = evt.center || '';

    const location = findCenter(centerName, centerLookup);
    if (location) {
      location.events.push({
        program: evt.program,
        type: evt.type,
        ages: evt.ages,
        code: evt.code,
        date_range: evt.date_range,
        cost: evt.cost,
        sessions: evt.sessions,
        notes: evt.notes || null,
      });
      matched++;
    } else {
      unmatched++;
      unmatchedNames.add(centerName);
    }
  }

  console.log(`  Schedule matching: ${matched} matched, ${unmatched} unmatched`);
  if (unmatchedNames.size > 0) {
    console.log('  Unmatched centers from schedules:');
    for (const name of unmatchedNames) {
      console.log(`    - "${name}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('HoopFinder: Building merged data file\n');

  // Load sources
  const courtsPath = path.join(SOURCES_DIR, 'courts.geojson');
  const centersPath = path.join(SOURCES_DIR, 'centers.geojson');
  const schedulesPath = path.join(CURATED_DIR, 'schedules.json');

  if (!fs.existsSync(courtsPath) || !fs.existsSync(centersPath)) {
    console.error('Error: Source data not found. Run `node scripts/fetch-courts.js` first.');
    process.exit(1);
  }

  const courtsGeo = loadJSON(courtsPath);
  const centersGeo = loadJSON(centersPath);
  const schedules = fs.existsSync(schedulesPath)
    ? loadJSON(schedulesPath)
    : { events: [] };

  console.log(`  Courts: ${courtsGeo.features.length} features`);
  console.log(`  Centers: ${centersGeo.features.length} features`);
  console.log(`  Schedule events: ${schedules.events.length}\n`);

  // Process
  const courts = processCourts(courtsGeo);
  const centers = processCenters(centersGeo);
  const locations = [...courts, ...centers];

  // Match schedules to centers
  matchSchedules(locations, schedules);

  // Count locations with events
  const withEvents = locations.filter((l) => l.events.length > 0).length;
  console.log(`  Locations with scheduled events: ${withEvents}`);

  // Build output
  const output = {
    generated_at: new Date().toISOString(),
    seasons: schedules.seasons || null,
    locations,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${locations.length} locations to ${OUT_PATH}`);

  // Generate .ics calendar files
  generateCalendarFiles(locations, schedules);
}

// ---------------------------------------------------------------------------
// .ics Calendar Generation
// ---------------------------------------------------------------------------

const DAYS_LIST = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const CAL_DIR = path.join(__dirname, '..', 'cal');

function expandDays(dayStr) {
  if (!dayStr) return [];
  const s = dayStr.trim();
  const rangeMatch = s.match(/^(\w+)\s*[-–]\s*(\w+)$/);
  if (rangeMatch) {
    const startIdx = resolveDayIndex(rangeMatch[1]);
    const endIdx = resolveDayIndex(rangeMatch[2]);
    if (startIdx >= 0 && endIdx >= 0) {
      const result = [];
      for (let i = startIdx; i <= endIdx; i++) result.push(DAYS_LIST[i]);
      return result;
    }
  }
  if (s.includes('/')) {
    return s.split('/').map(d => resolveDay(d.trim())).filter(Boolean);
  }
  const resolved = resolveDay(s);
  return resolved ? [resolved] : [];
}

function resolveDay(str) {
  if (!str) return null;
  const lower = str.toLowerCase().replace(/[^a-z]/g, '');
  for (const day of DAYS_LIST) {
    if (day.toLowerCase().startsWith(lower.slice(0, 3))) return day;
  }
  return null;
}

function resolveDayIndex(str) {
  const d = resolveDay(str);
  return d ? DAYS_LIST.indexOf(d) : -1;
}

function flattenEvents(locations) {
  const result = [];
  for (const loc of locations) {
    if (!loc.events || loc.events.length === 0) continue;
    for (const evt of loc.events) {
      if (!evt.sessions) continue;
      for (const session of evt.sessions) {
        const days = expandDays(session.day);
        for (const day of days) {
          result.push({
            center: loc.name,
            address: loc.address,
            program: evt.program,
            ages: evt.ages || 'All Ages',
            cost: evt.cost || 'FREE',
            day,
            time: session.time,
            date_range: evt.date_range,
            code: evt.code,
            type: evt.type,
          });
        }
      }
    }
  }
  return result;
}

function isFreeEvent(cost) {
  return !cost || cost === 'FREE' || cost === '$0' || cost === 0;
}

function parseDateRange(str) {
  const match = str.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  const year = 2026;
  return {
    start: new Date(year, parseInt(match[1]) - 1, parseInt(match[2])),
    end: new Date(year, parseInt(match[3]) - 1, parseInt(match[4])),
  };
}

function parseTimeRange(str) {
  const cleaned = str.replace(/\./g, '').trim();
  const noonMatch = cleaned.match(/noon\s*-\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (noonMatch) {
    let endH = parseInt(noonMatch[1]);
    const endM = noonMatch[2] ? parseInt(noonMatch[2]) : 0;
    const endAmpm = (noonMatch[3] || 'pm').toLowerCase();
    if (endAmpm === 'pm' && endH < 12) endH += 12;
    return { startH: 12, startM: 0, endH, endM };
  }
  const match = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*-\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  let startH = parseInt(match[1]);
  const startM = match[2] ? parseInt(match[2]) : 0;
  let endH = parseInt(match[4]);
  const endM = match[5] ? parseInt(match[5]) : 0;
  const endAmpm = (match[6] || '').toLowerCase();
  const startAmpm = (match[3] || '').toLowerCase();
  if (endAmpm === 'pm' && endH < 12) endH += 12;
  if (endAmpm === 'am' && endH === 12) endH = 0;
  if (!startAmpm) {
    if (startH < 8) startH += 12;
    if (startH > endH) { /* AM, keep as-is */ }
  } else {
    if (startAmpm === 'pm' && startH < 12) startH += 12;
    if (startAmpm === 'am' && startH === 12) startH = 0;
  }
  if (endH < startH && endH <= 6) endH += 24;
  if (endH >= 24) { endH = 23; }
  return { startH, startM, endH: Math.min(endH, 23), endM };
}

function firstOccurrence(date, targetDayIdx) {
  const d = new Date(date);
  const diff = (targetDayIdx - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtDT(date, h, m) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${mo}${d}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
}

function fmtDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function icsEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function buildICS(events, calName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HoopFinder//Seattle Basketball//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    'X-WR-TIMEZONE:America/Los_Angeles',
  ];

  let count = 0;
  for (const evt of events) {
    if (!evt.date_range || !evt.time) continue;
    const parsed = parseDateRange(evt.date_range);
    const timeParsed = parseTimeRange(evt.time);
    if (!parsed || !timeParsed) continue;
    const dayIdx = DAYS_LIST.indexOf(evt.day);
    if (dayIdx < 0) continue;
    const rruleDay = RRULE_DAYS[dayIdx];
    const dtstart = firstOccurrence(parsed.start, dayIdx);
    if (!dtstart || dtstart > parsed.end) continue;
    const startDT = fmtDT(dtstart, timeParsed.startH, timeParsed.startM);
    const endDT = fmtDT(dtstart, timeParsed.endH, timeParsed.endM);
    const untilDT = fmtDate(parsed.end) + 'T235900';
    const uid = `${evt.code || 'hf'}-${evt.day.toLowerCase().slice(0,3)}-${count}@hoopfinder`;
    const summary = `${evt.program} @ ${evt.center}`;
    const desc = `Ages: ${evt.ages}\\nCost: ${isFreeEvent(evt.cost) ? 'Free' : evt.cost}\\nDates: ${evt.date_range}`;
    const location = `${evt.center}, ${evt.address}, Seattle, WA`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART;TZID=America/Los_Angeles:${startDT}`);
    lines.push(`DTEND;TZID=America/Los_Angeles:${endDT}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${untilDT}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push(`LOCATION:${icsEscape(location)}`);
    lines.push('END:VEVENT');
    count++;
  }

  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), count };
}

function generateCalendarFiles(locations) {
  if (!fs.existsSync(CAL_DIR)) fs.mkdirSync(CAL_DIR, { recursive: true });

  const allEvents = flattenEvents(locations);
  console.log(`\nCalendar generation: ${allEvents.length} flattened events`);

  const presets = [
    { slug: 'all', label: 'HoopFinder — All Events', filter: () => true },
  ];

  for (const preset of presets) {
    const filtered = allEvents.filter(preset.filter);
    const { ics, count } = buildICS(filtered, preset.label);
    const outPath = path.join(CAL_DIR, `${preset.slug}.ics`);
    fs.writeFileSync(outPath, ics);
    console.log(`  ${preset.slug}.ics — ${count} events`);
  }
}

main();
