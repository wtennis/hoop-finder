/**
 * HoopFinder - Main Application
 *
 * Vanilla JS. No framework. Loads data/hoop-finder.json and renders
 * basketball court and community center markers on a Leaflet map.
 * Supports filtering, schedule view, and .ics calendar export.
 */

(function () {
  'use strict';

  // ---- Config ----
  const SEATTLE_CENTER = [47.6062, -122.3321];
  const DEFAULT_ZOOM = 12;
  const DATA_URL = 'data/hoop-finder.json';
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---- State ----
  let allLocations = [];
  let allEvents = []; // flattened: { center, address, program, ages, cost, day, time, date_range, code }
  let markersLayer = L.featureGroup();
  let activeDay = DAYS[new Date().getDay()]; // default to today

  const filters = {
    location: new Set(['outdoor', 'indoor']),
    age: new Set(['adult', 'teen', 'youth', 'all']),
    gender: new Set(['open', 'womens', 'mens']),
    cost: new Set(['free', 'paid']),
    schedule: new Set(),
  };

  // ---- Map Setup ----
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
  }).setView(SEATTLE_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  if (window.innerWidth < 768) {
    map.zoomControl.setPosition('bottomright');
  }

  // ---- Marker Styles ----
  function courtMarker(latlng) {
    return L.circleMarker(latlng, {
      radius: 7, fillColor: '#f97316', color: '#c2410c',
      weight: 1.5, opacity: 1, fillOpacity: 0.85,
    });
  }

  function centerMarker(latlng) {
    return L.circleMarker(latlng, {
      radius: 8, fillColor: '#3b82f6', color: '#1d4ed8',
      weight: 1.5, opacity: 1, fillOpacity: 0.85,
    });
  }

  // ---- Popup Content ----

  function formatCourtType(type) {
    if (!type || type === 'unknown') return '';
    const labels = { full: 'Full court', half: 'Half court', both: 'Full + Half' };
    return labels[type] || type;
  }

  function buildPopupHTML(location) {
    const isCenter = location.type === 'community_center';
    const typeBadge = isCenter
      ? '<span class="type-badge indoor">Indoor Gym</span>'
      : '<span class="type-badge outdoor">Outdoor Court</span>';

    let html = `
      <div class="popup-header">
        <h3>${esc(location.name)}</h3>
        <div class="address">${esc(location.address)}</div>
        ${typeBadge}
      </div>`;

    if (!isCenter) {
      const courtType = formatCourtType(location.court_type);
      const courtCount = location.court_count || 1;
      html += `
        <div class="popup-meta">
          ${courtType ? `<div class="meta-row"><span class="meta-label">Type:</span> ${esc(courtType)}</div>` : ''}
          <div class="meta-row"><span class="meta-label">Hoops:</span> ${courtCount}</div>
        </div>`;
    }

    if (isCenter && location.phone) {
      html += `
        <div class="popup-meta">
          <div class="meta-row"><span class="meta-label">Phone:</span> ${esc(location.phone)}</div>
        </div>`;
    }

    const activeEvents = (location.events || []).filter(evt => {
      if (!evt.date_range) return true;
      const parsed = parseDateRange(evt.date_range);
      return !parsed || (TODAY >= parsed.start && TODAY <= parsed.end);
    });

    if (activeEvents.length > 0) {
      html += `<div class="popup-events"><h4>Basketball Schedule</h4>`;
      for (const evt of activeEvents) {
        const costStr = formatCost(evt.cost);
        const costClass = (!evt.cost || evt.cost === 'FREE' || evt.cost === '$0') ? 'free' : 'paid';

        html += `<div class="popup-event">`;
        html += `<div class="event-name">${esc(evt.program)}</div>`;
        if (evt.ages) html += `<div class="event-detail">Ages: ${esc(evt.ages)}</div>`;
        if (evt.sessions && evt.sessions.length > 0) {
          for (const s of evt.sessions) {
            html += `<div class="event-detail">${esc(s.day)}: ${esc(s.time)}</div>`;
          }
        }
        if (evt.date_range) html += `<div class="event-detail">Dates: ${esc(evt.date_range)}</div>`;
        html += `<div class="event-cost ${costClass}">${esc(costStr)}</div>`;
        if (evt.notes) html += `<div class="event-detail" style="font-style:italic; margin-top:4px;">${esc(evt.notes)}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    const addr = encodeURIComponent(location.address + ', Seattle, WA');
    html += `<a class="popup-directions" href="https://www.google.com/maps/dir/?api=1&destination=${addr}" target="_blank" rel="noopener">Get Directions</a>`;
    return html;
  }

  function formatCost(cost) {
    if (!cost || cost === 'FREE' || cost === '$0' || cost === 0) return 'Free';
    return String(cost);
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ---- Day Matching ----

  // Expand compound day strings into individual day names
  function expandDays(dayStr) {
    if (!dayStr) return [];
    const s = dayStr.trim();

    // Handle ranges like "Monday-Friday" or "Monday-Thursday" or "Mon-Fri"
    const rangeMatch = s.match(/^(\w+)\s*[-–]\s*(\w+)$/);
    if (rangeMatch) {
      const startIdx = dayIndex(rangeMatch[1]);
      const endIdx = dayIndex(rangeMatch[2]);
      if (startIdx >= 0 && endIdx >= 0) {
        const result = [];
        for (let i = startIdx; i <= endIdx; i++) result.push(DAYS[i]);
        return result;
      }
    }

    // Handle slash-separated like "Mon/Fri" or "Tue/Thu" or "Mon/Tue/Wed/Fri"
    if (s.includes('/')) {
      return s.split('/').map(d => resolveDay(d.trim())).filter(Boolean);
    }

    // Single day
    const resolved = resolveDay(s);
    return resolved ? [resolved] : [];
  }

  function dayIndex(str) {
    const d = resolveDay(str);
    return d ? DAYS.indexOf(d) : -1;
  }

  function resolveDay(str) {
    if (!str) return null;
    const lower = str.toLowerCase().replace(/[^a-z]/g, '');
    for (const day of DAYS) {
      if (day.toLowerCase().startsWith(lower.slice(0, 3))) return day;
    }
    return null;
  }

  // ---- Flatten Events ----

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
              day: day,
              time: session.time,
              date_range: evt.date_range,
              code: evt.code,
              type: evt.type,
            });
          }
        }
      }
    }
    // Sort by time within each day
    result.sort((a, b) => parseTime(a.time) - parseTime(b.time));
    return result;
  }

  function parseTime(timeStr) {
    if (!timeStr) return 0;
    // Extract start time, e.g. "12:30-3:30pm" -> "12:30"
    const start = timeStr.split('-')[0].trim();
    const match = start.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i);
    if (!match) return 0;
    let hour = parseInt(match[1]);
    const min = match[2] ? parseInt(match[2]) : 0;
    const ampm = (match[3] || '').replace(/\./g, '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    // Heuristic: bare numbers > 0 and < 8 are likely PM for basketball schedules
    if (!ampm && hour >= 1 && hour < 8) hour += 12;
    return hour * 60 + min;
  }

  // ---- Date Filtering ----

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  function isEventActive(evt) {
    if (!evt.date_range) return true; // no date range = always show
    const parsed = parseDateRange(evt.date_range);
    if (!parsed) return true;
    return TODAY >= parsed.start && TODAY <= parsed.end;
  }

  function isSeasonExpired() {
    return allEvents.length > 0 && allEvents.every(evt => !isEventActive(evt));
  }

  // ---- Filtering (shared) ----

  function classifyAgeGroups(agesStr) {
    if (!agesStr) return ['adult', 'teen', 'youth', 'all'];
    const s = agesStr.toLowerCase();
    if (s.includes('all ages')) return ['adult', 'teen', 'youth', 'all'];
    if (s.includes('18 and older') || s.includes('18+')) return ['adult'];
    // "X and older" — open to everyone aged X+
    if (s.match(/\d+\s+and\s+older/)) {
      const m = s.match(/(\d+)\s+and\s+older/);
      const age = parseInt(m[1]);
      if (age <= 10) return ['adult', 'teen', 'youth', 'all'];
      if (age <= 17) return ['teen', 'adult'];
      return ['adult'];
    }
    const match = s.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (match) {
      const low = parseInt(match[1]);
      const high = parseInt(match[2]);
      if (low >= 11 && high <= 19) return ['teen'];
      if (high <= 12) return ['youth'];
    }
    if (s.includes('5 and under') || s.match(/\b[5-9]\b/) || s.includes('little') || s.includes('mini')) return ['youth'];
    return ['adult', 'teen', 'youth', 'all'];
  }

  function eventMatchesAgeFilter(evt, activeAges) {
    return classifyAgeGroups(evt.ages).some(g => activeAges.has(g));
  }

  function classifyGender(program) {
    if (!program) return 'open';
    const s = program.toLowerCase();
    if (s.includes("women's") || s.includes('women')) return 'womens';
    if (s.includes("men's") || s.match(/\bmen\b/)) return 'mens';
    return 'open';
  }

  function eventMatchesGenderFilter(evt, activeGenders) {
    return activeGenders.has(classifyGender(evt.program));
  }

  function eventMatchesCostFilter(evt, activeCosts) {
    const isFree = !evt.cost || evt.cost === 'FREE' || evt.cost === '$0' || evt.cost === 0;
    return isFree ? activeCosts.has('free') : activeCosts.has('paid');
  }

  function locationPassesFilter(loc) {
    if (loc.type === 'outdoor_court' && !filters.location.has('outdoor')) return false;
    if (loc.type === 'community_center' && !filters.location.has('indoor')) return false;
    const activeEvts = (loc.events || []).filter(isEventActive);
    if (filters.schedule.has('yes') && activeEvts.length === 0) return false;
    if (activeEvts.length === 0) return true;
    return activeEvts.some(evt =>
      eventMatchesAgeFilter(evt, filters.age) &&
      eventMatchesGenderFilter(evt, filters.gender) &&
      eventMatchesCostFilter(evt, filters.cost)
    );
  }

  function applyFilters() {
    markersLayer.clearLayers();
    let count = 0;
    for (const loc of allLocations) {
      if (!locationPassesFilter(loc)) continue;
      count++;
      const latlng = [loc.lat, loc.lng];
      const marker = loc.type === 'community_center' ? centerMarker(latlng) : courtMarker(latlng);
      marker.bindPopup(buildPopupHTML(loc), {
        maxWidth: 320, maxHeight: 400, autoPanPadding: [20, 60],
      });
      marker.addTo(markersLayer);
    }
    document.getElementById('filter-count').textContent = `${count} of ${allLocations.length} locations`;
  }

  // ---- Schedule View ----

  function getEventsForDay(day) {
    return allEvents.filter(evt => {
      if (evt.day !== day) return false;
      if (!isEventActive(evt)) return false;
      if (!eventMatchesAgeFilter(evt, filters.age)) return false;
      if (!eventMatchesGenderFilter(evt, filters.gender)) return false;
      if (!eventMatchesCostFilter(evt, filters.cost)) return false;
      return true;
    });
  }

  function buildDayTabs() {
    const container = document.getElementById('day-tabs');
    container.innerHTML = '';
    const todayIdx = new Date().getDay();

    for (let i = 0; i < 7; i++) {
      const day = DAYS[i];
      const count = getEventsForDay(day).length;
      const btn = document.createElement('button');
      btn.className = 'day-tab' + (day === activeDay ? ' active' : '') + (i === todayIdx ? ' today' : '');
      btn.innerHTML = `${DAY_ABBR[i]}<span class="tab-count">${count}</span>`;
      btn.addEventListener('click', () => {
        activeDay = day;
        buildDayTabs();
        renderScheduleList();
      });
      container.appendChild(btn);
    }
  }

  function renderScheduleList() {
    const list = document.getElementById('schedule-list');
    const events = getEventsForDay(activeDay);

    if (events.length === 0) {
      list.innerHTML = `<div class="schedule-empty">No basketball events on ${activeDay}s</div>`;
      return;
    }

    list.innerHTML = events.map(evt => {
      const isFree = !evt.cost || evt.cost === 'FREE' || evt.cost === '$0';
      const costClass = isFree ? 'free' : 'paid';
      const costLabel = isFree ? 'Free' : evt.cost;
      return `
        <div class="schedule-card">
          <div class="sc-time">${esc(evt.time)}</div>
          <div class="sc-program">${esc(evt.program)}</div>
          <div class="sc-center">${esc(evt.center)} — ${esc(evt.address)}</div>
          <div class="sc-meta">
            <span class="sc-tag">${esc(evt.ages)}</span>
            <span class="sc-tag ${costClass}">${esc(costLabel)}</span>
            ${evt.date_range ? `<span>${esc(evt.date_range)}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ---- .ics Export ----

  function getFilteredEvents() {
    return allEvents.filter(evt => {
      if (!isEventActive(evt)) return false;
      if (!eventMatchesAgeFilter(evt, filters.age)) return false;
      if (!eventMatchesGenderFilter(evt, filters.gender)) return false;
      if (!eventMatchesCostFilter(evt, filters.cost)) return false;
      return true;
    });
  }

  function generateICS(events) {
    if (!events) events = getFilteredEvents();

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HoopFinder//Seattle Basketball//EN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:HoopFinder Seattle Basketball',
      'X-WR-TIMEZONE:America/Los_Angeles',
    ];

    for (const evt of events) {
      if (!evt.date_range || !evt.time) continue;

      const parsed = parseDateRange(evt.date_range);
      const timeParsed = parseTimeRange(evt.time);
      if (!parsed || !timeParsed) continue;

      const dayIdx = DAYS.indexOf(evt.day);
      if (dayIdx < 0) continue;

      const rruleDay = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][dayIdx];

      // Find the first occurrence of this weekday on or after the start date
      const dtstart = firstOccurrence(parsed.start, dayIdx);
      if (!dtstart || dtstart > parsed.end) continue;

      const startDT = formatICSDateTime(dtstart, timeParsed.startH, timeParsed.startM);
      const endDT = formatICSDateTime(dtstart, timeParsed.endH, timeParsed.endM);
      const untilDT = formatICSDate(parsed.end) + 'T235900';

      const uid = `${evt.code || 'hf'}-${evt.day}-${Date.now()}@hoopfinder`;
      const summary = `${evt.program} @ ${evt.center}`;
      const description = `Ages: ${evt.ages}\\nCost: ${formatCost(evt.cost)}\\nDates: ${evt.date_range}`;
      const location = `${evt.center}, ${evt.address}, Seattle, WA`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTART;TZID=America/Los_Angeles:${startDT}`);
      lines.push(`DTEND;TZID=America/Los_Angeles:${endDT}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${untilDT}`);
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      lines.push(`DESCRIPTION:${icsEscape(description)}`);
      lines.push(`LOCATION:${icsEscape(location)}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function parseDateRange(str) {
    // "4/6-6/12" -> { start: Date, end: Date } (year = current year)
    const match = str.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;
    const year = 2026; // season year
    return {
      start: new Date(year, parseInt(match[1]) - 1, parseInt(match[2])),
      end: new Date(year, parseInt(match[3]) - 1, parseInt(match[4])),
    };
  }

  function parseTimeRange(str) {
    // "12:30-3:30pm" or "6-8:30pm" or "Noon-4pm"
    const cleaned = str.replace(/\./g, '').trim();

    // Handle "Noon" special case
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

    // Apply PM to end time
    if (endAmpm === 'pm' && endH < 12) endH += 12;
    if (endAmpm === 'am' && endH === 12) endH = 0;

    // Infer start AM/PM from end
    if (!startAmpm) {
      if (startH < 8) startH += 12; // e.g. "6-8pm" means 6pm
      else if (startH <= 12 && startH > endH - 12) {
        // Same half-day
      }
      // If start > end after adjustment, start is AM (e.g., "11:30am-1:30pm")
      if (startH > endH) {
        // startH is already correct (AM)
      }
    } else {
      if (startAmpm === 'pm' && startH < 12) startH += 12;
      if (startAmpm === 'am' && startH === 12) startH = 0;
    }

    // Handle midnight crossing for late night events
    if (endH < startH && endH <= 6) endH += 24; // e.g., 7pm-Midnight

    // Cap at 24
    if (endH >= 24) endH = 23, endM = 59;

    return { startH, startM, endH: Math.min(endH, 23), endM };
  }

  function firstOccurrence(date, targetDayIdx) {
    const d = new Date(date);
    const diff = (targetDayIdx - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function formatICSDateTime(date, hour, min) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    const mi = String(min).padStart(2, '0');
    return `${y}${m}${d}T${h}${mi}00`;
  }

  function formatICSDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  function icsEscape(str) {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function downloadICS() {
    const filtered = getFilteredEvents();
    if (filtered.length === 0) {
      alert('No events match the current filters.');
      return;
    }
    const ics = generateICS(filtered);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hoopfinder-spring-2026.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Filter UI ----

  function initFilterUI() {
    const filterToggle = document.getElementById('filter-toggle');
    const filterPanel = document.getElementById('filter-panel');
    const scheduleToggle = document.getElementById('schedule-toggle');
    const schedulePanel = document.getElementById('schedule-panel');

    filterToggle.addEventListener('click', () => {
      const isHidden = filterPanel.classList.toggle('hidden');
      filterToggle.classList.toggle('active', !isHidden);
      // Close schedule panel when opening filters
      if (!isHidden) {
        schedulePanel.classList.add('hidden');
        scheduleToggle.classList.remove('active');
      }
      setTimeout(() => map.invalidateSize(), 250);
    });

    scheduleToggle.addEventListener('click', () => {
      const isHidden = schedulePanel.classList.toggle('hidden');
      scheduleToggle.classList.toggle('active', !isHidden);
      const legend = document.getElementById('legend');
      // Close filter panel when opening schedule
      if (!isHidden) {
        filterPanel.classList.add('hidden');
        filterToggle.classList.remove('active');
        if (legend) legend.style.display = 'none';
        buildDayTabs();
        renderScheduleList();
      } else {
        if (legend) legend.style.display = '';
      }
      setTimeout(() => map.invalidateSize(), 250);
    });

    // Chip clicks
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const filterName = chip.dataset.filter;
        const value = chip.dataset.value;
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          filters[filterName].add(value);
        } else {
          filters[filterName].delete(value);
        }
        applyFilters();
        // Update schedule view if visible
        if (!schedulePanel.classList.contains('hidden')) {
          buildDayTabs();
          renderScheduleList();
        }
      });
    });

    // Reset
    document.getElementById('filter-reset').addEventListener('click', () => {
      filters.location = new Set(['outdoor', 'indoor']);
      filters.age = new Set(['adult', 'teen', 'youth', 'all']);
      filters.gender = new Set(['open', 'womens', 'mens']);
      filters.cost = new Set(['free', 'paid']);
      filters.schedule = new Set();
      document.querySelectorAll('.chip').forEach(chip => {
        const filterName = chip.dataset.filter;
        const value = chip.dataset.value;
        chip.classList.toggle('active', filters[filterName].has(value));
      });
      applyFilters();
      if (!schedulePanel.classList.contains('hidden')) {
        buildDayTabs();
        renderScheduleList();
      }
    });

    // Export modal
    document.getElementById('export-cal').addEventListener('click', showExportModal);
    document.getElementById('export-ics').addEventListener('click', downloadICS);
    document.getElementById('close-modal').addEventListener('click', () => {
      document.getElementById('export-modal').classList.add('hidden');
    });
    document.getElementById('export-modal').addEventListener('click', (e) => {
      if (e.target.id === 'export-modal') e.target.classList.add('hidden');
    });
    document.getElementById('copy-url').addEventListener('click', () => {
      const input = document.getElementById('subscribe-url');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        const btn = document.getElementById('copy-url');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    });
  }

  // ---- Export Modal ----

  function showExportModal() {
    const url = `${getBaseUrl()}cal/all.ics`;
    document.getElementById('subscribe-url').value = url;
    document.getElementById('copy-url').textContent = 'Copy';
    document.getElementById('export-modal').classList.remove('hidden');
  }

  function getBaseUrl() {
    // If deployed, use the actual URL. Otherwise show placeholder.
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return 'https://wtennis.github.io/hoop-finder/';
    }
    return loc.origin + loc.pathname.replace(/\/[^/]*$/, '/');
  }

  // ---- Load Data & Render ----

  async function loadData() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      allLocations = data.locations || [];
      allEvents = flattenEvents(allLocations);
      markersLayer.addTo(map);
      applyFilters();

      if (isSeasonExpired()) {
        showSeasonBanner(data.season || 'Spring 2026');
      }
    } catch (err) {
      console.error('Failed to load HoopFinder data:', err);
      L.popup()
        .setLatLng(SEATTLE_CENTER)
        .setContent(
          '<div style="padding:12px;text-align:center;">' +
            '<strong>Could not load court data.</strong><br>' +
            '<small>Make sure to serve this site via HTTP<br>(not file://). Try: npx serve .</small>' +
            '</div>'
        )
        .openOn(map);
    }
  }

  // ---- Legend ----

  function addLegend() {
    const legend = document.createElement('div');
    legend.id = 'legend';
    legend.innerHTML = `
      <div class="legend-item"><span class="legend-dot orange"></span> Outdoor Court</div>
      <div class="legend-item"><span class="legend-dot blue"></span> Community Center</div>
    `;
    document.body.appendChild(legend);
  }

  // ---- Season Banner ----

  function showSeasonBanner(season) {
    const banner = document.createElement('div');
    banner.id = 'season-banner';
    banner.innerHTML =
      `<strong>${esc(season)} schedule has ended.</strong> ` +
      'Courts are still shown on the map. Check back for updated programming.';
    document.body.appendChild(banner);
  }

  // ---- Init ----
  addLegend();
  initFilterUI();
  loadData();
})();
