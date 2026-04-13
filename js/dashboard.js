/**
 * dashboard.js — Apartments.com.au Paid Media Dashboard
 *
 * Architecture: static site → JSONP → Google Apps Script → Google Sheets
 * No build step. All vanilla JS. Update APPS_SCRIPT_URL below if the
 * Apps Script deployment URL ever changes.
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwzV_glU6LyF4cxlrTbMqHu0bZKuhkcfAokC4P-KQ9fCQ94G_zgXDIL8Q5Cue27Pss19A/exec';
const TOKEN              = 'acom_dashboard_2026';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const JSONP_TIMEOUT_MS    = 10000;          // 10 seconds
const ROWS_PER_PAGE       = 50;

// ── State ─────────────────────────────────────────────────────────────────────
let rawData      = [];   // full platforms dataset from Apps Script
let filteredData = [];   // after applying current filters
let sortCol      = 'Date';
let sortDir      = 'desc';
let currentPage  = 1;
let refreshTimer = null;

const filters = {
  dateFrom:    '',
  dateTo:      '',
  projectId:   '',
  projectName: '',
  platform:    '',
  adType:      ''
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  readUrlParams();
  applyFiltersToInputs();
  bindFilterEvents();
  bindTableSortEvents();
  bindPaginationEvents();
  bindRefreshEvents();
  bindCsvUpload();
  fetchData();
  refreshTimer = setInterval(fetchData, REFRESH_INTERVAL_MS);
});

// ── JSONP data fetch ──────────────────────────────────────────────────────────
function fetchData() {
  setStatusLoading();
  const cbName = 'dashboardCallback_' + Date.now();
  const script = document.createElement('script');

  const timer = setTimeout(() => {
    cleanup();
    showError('Request timed out after 10 seconds.');
  }, JSONP_TIMEOUT_MS);

  window[cbName] = (data) => {
    clearTimeout(timer);
    cleanup();
    onDataReceived(data);
  };

  script.src = `${APPS_SCRIPT_URL}?token=${TOKEN}&callback=${cbName}`;
  script.onerror = () => {
    clearTimeout(timer);
    cleanup();
    showError('Failed to load data. Check your connection or the Apps Script URL.');
  };
  document.head.appendChild(script);

  function cleanup() {
    delete window[cbName];
    if (script.parentNode) script.parentNode.removeChild(script);
  }
}

function onDataReceived(data) {
  hideError();

  // Apps Script returns { platforms: [...], projects: [...] }
  // Accept either shape gracefully
  if (Array.isArray(data)) {
    rawData = data;
  } else if (data && Array.isArray(data.platforms)) {
    rawData = data.platforms;
  } else {
    showError('Unexpected data format from server.');
    return;
  }

  populateProjectNameDropdown();
  render();
  setStatusConnected();
}

// ── Render pipeline ───────────────────────────────────────────────────────────
function render() {
  filteredData = applyFilters(rawData);
  updateKpis();
  updateFormatBreakdown();
  updateProjectsTable();
  currentPage = 1;
  renderTablePage();
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters(data) {
  return data.filter(row => {
    const date = row['Date'] || '';

    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo   && date > filters.dateTo)   return false;

    if (filters.projectId) {
      const id = String(row['Project ID'] || '').toLowerCase();
      if (!id.includes(filters.projectId.toLowerCase())) return false;
    }

    if (filters.projectName) {
      if ((row['Project Name'] || '') !== filters.projectName) return false;
    }

    if (filters.platform) {
      if ((row['Platform'] || '').toLowerCase() !== filters.platform.toLowerCase()) return false;
    }

    if (filters.adType) {
      if ((row['Ad Type'] || '') !== filters.adType) return false;
    }

    return true;
  });
}

function bindFilterEvents() {
  el('filter-date-from').addEventListener('change', e => { filters.dateFrom = e.target.value; onFilterChange(); });
  el('filter-date-to').addEventListener('change',   e => { filters.dateTo   = e.target.value; onFilterChange(); });
  el('filter-project-id').addEventListener('input',  e => { filters.projectId   = e.target.value; onFilterChange(); });
  el('filter-project-name').addEventListener('change', e => { filters.projectName = e.target.value; onFilterChange(); });
  el('filter-platform').addEventListener('change',   e => { filters.platform  = e.target.value; onFilterChange(); });
  el('filter-ad-type').addEventListener('change',    e => { filters.adType    = e.target.value; onFilterChange(); });
  el('btn-clear-filters').addEventListener('click', clearFilters);
}

function onFilterChange() {
  updateUrlParams();
  render();
}

function clearFilters() {
  filters.dateFrom    = '';
  filters.dateTo      = '';
  filters.projectId   = '';
  filters.projectName = '';
  filters.platform    = '';
  filters.adType      = '';
  applyFiltersToInputs();
  updateUrlParams();
  render();
}

function applyFiltersToInputs() {
  el('filter-date-from').value    = filters.dateFrom;
  el('filter-date-to').value      = filters.dateTo;
  el('filter-project-id').value   = filters.projectId;
  el('filter-project-name').value = filters.projectName;
  el('filter-platform').value     = filters.platform;
  el('filter-ad-type').value      = filters.adType;
}

function populateProjectNameDropdown() {
  const names = Array.from(new Set(rawData.map(r => r['Project Name'] || '').filter(Boolean))).sort();
  const select = el('filter-project-name');
  const current = filters.projectName;
  select.innerHTML = '<option value="">All projects</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  });
}

// ── URL param persistence ─────────────────────────────────────────────────────
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  filters.dateFrom    = params.get('from')        || '';
  filters.dateTo      = params.get('to')          || '';
  filters.projectId   = params.get('projectId')   || '';
  filters.projectName = params.get('projectName') || '';
  filters.platform    = params.get('platform')    || '';
  filters.adType      = params.get('adType')      || '';
}

function updateUrlParams() {
  const params = new URLSearchParams();
  if (filters.dateFrom)    params.set('from',        filters.dateFrom);
  if (filters.dateTo)      params.set('to',          filters.dateTo);
  if (filters.projectId)   params.set('projectId',   filters.projectId);
  if (filters.projectName) params.set('projectName', filters.projectName);
  if (filters.platform)    params.set('platform',    filters.platform);
  if (filters.adType)      params.set('adType',      filters.adType);
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
}

// ── KPI calculations ──────────────────────────────────────────────────────────
function updateKpis() {
  const data = filteredData;

  const totalSpend       = data.reduce((s, r) => s + toNum(r['Spend']), 0);
  const totalImpressions = data.reduce((s, r) => s + toNum(r['Impressions']), 0);
  const totalReach       = data.reduce((s, r) => s + toNum(r['Reach']), 0);
  const totalClicks      = data.reduce((s, r) => s + toNum(r['Clicks']), 0);
  const avgCtr           = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const projectsLive = new Set(data.map(r => r['Project Name']).filter(Boolean)).size;
  const activeAds    = new Set(data.map(r => r['Ad Name']).filter(Boolean)).size;

  // New ads: unique Ad Names whose earliest date in the FULL dataset falls within the filter range
  const newAds = countNewAdsInPeriod();

  el('kpi-spend').textContent       = formatAUD(totalSpend);
  el('kpi-impressions').textContent = formatCompact(totalImpressions);
  el('kpi-reach').textContent       = 'Reach: ' + formatCompact(totalReach);
  el('kpi-clicks').textContent      = formatCompact(totalClicks);
  el('kpi-ctr').textContent         = 'Avg CTR: ' + avgCtr.toFixed(2) + '%';
  el('kpi-projects').textContent    = projectsLive.toLocaleString();
  el('kpi-new-ads').textContent     = newAds.toLocaleString();
  el('kpi-active-ads').textContent  = activeAds.toLocaleString();
}

function countNewAdsInPeriod() {
  // Build earliest date per Ad Name across the FULL dataset
  const firstSeen = {};
  rawData.forEach(row => {
    const name = row['Ad Name'];
    const date = row['Date'] || '';
    if (!name || !date) return;
    if (!firstSeen[name] || date < firstSeen[name]) firstSeen[name] = date;
  });

  // Count ad names whose first appearance falls within the current date range
  // (using the filter's date window; if no date filter, count all)
  const from = filters.dateFrom || '0000-00-00';
  const to   = filters.dateTo   || '9999-99-99';

  return Object.values(firstSeen).filter(d => d >= from && d <= to).length;
}

// ── Format breakdown ──────────────────────────────────────────────────────────
function updateFormatBreakdown() {
  // Deduplicate by Ad Name, keep first occurrence
  const seen = new Set();
  const deduped = filteredData.filter(row => {
    const name = row['Ad Name'];
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  const counts = { Static: 0, Reel: 0, Video: 0 };
  deduped.forEach(row => {
    const t = row['Ad Type'];
    if (t in counts) counts[t]++;
  });

  const total = counts.Static + counts.Reel + counts.Video || 1;

  setBarSegment('bar-static', counts.Static, total, 'Static');
  setBarSegment('bar-reel',   counts.Reel,   total, 'Reel');
  setBarSegment('bar-video',  counts.Video,  total, 'Video');

  el('legend-static').textContent = `Static — ${counts.Static} ad${counts.Static !== 1 ? 's' : ''} (${pct(counts.Static, total)}%)`;
  el('legend-reel').textContent   = `Reel — ${counts.Reel} ad${counts.Reel !== 1 ? 's' : ''} (${pct(counts.Reel, total)}%)`;
  el('legend-video').textContent  = `Video — ${counts.Video} ad${counts.Video !== 1 ? 's' : ''} (${pct(counts.Video, total)}%)`;
}

function setBarSegment(id, count, total, label) {
  const seg = el(id);
  seg.style.flex = String(count || 0.01); // avoid zero-width segments
  const p = pct(count, total);
  seg.querySelector('span').textContent = count > 0 && p >= 5 ? `${label} ${p}%` : '';
}

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

// ── Projects with active ads table ───────────────────────────────────────────
function updateProjectsTable() {
  const byProject = {};

  filteredData.forEach(row => {
    const name = row['Project Name'] || '(unknown)';
    if (!byProject[name]) byProject[name] = { spend: 0, types: new Set() };
    byProject[name].spend += toNum(row['Spend']);
    const t = row['Ad Type'];
    if (t) byProject[name].types.add(t);
  });

  const rows = Object.entries(byProject)
    .sort((a, b) => b[1].spend - a[1].spend);

  const tbody = el('projects-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No data for selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([name, info]) => {
    const tags = ['Static', 'Reel', 'Video']
      .filter(t => info.types.has(t))
      .map(t => `<span class="format-tag ${t.toLowerCase()}">${t}</span>`)
      .join('');
    return `<tr>
      <td>${escHtml(name)}</td>
      <td><div class="format-tags">${tags || '&mdash;'}</div></td>
      <td class="num">${formatAUD(info.spend)}</td>
    </tr>`;
  }).join('');
}

// ── Main sortable data table ──────────────────────────────────────────────────
function bindTableSortEvents() {
  document.querySelectorAll('#data-table thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      currentPage = 1;
      renderTablePage();
    });
  });
}

function renderTablePage() {
  updateSortIndicators();

  const sorted = sortData([...filteredData], sortCol, sortDir);
  const totalRows  = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageRows = sorted.slice(start, start + ROWS_PER_PAGE);

  const tbody = el('data-tbody');

  if (pageRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No data for selected filters.</td></tr>';
  } else {
    tbody.innerHTML = pageRows.map(row => {
      const platform = (row['Platform'] || '').toLowerCase();
      const date     = formatDate(row['Date'] || '');
      const ctr      = toNum(row['CTR']) * 100;
      return `<tr>
        <td>${escHtml(date)}</td>
        <td><span class="platform-badge ${escHtml(platform)}">${escHtml(row['Platform'] || '')}</span></td>
        <td>${escHtml(row['Project Name'] || '')}</td>
        <td>${escHtml(row['Ad Name'] || '')}</td>
        <td>${escHtml(row['Ad Type'] || '')}</td>
        <td class="num">${formatCompact(toNum(row['Impressions']))}</td>
        <td class="num">${toNum(row['Clicks']).toLocaleString()}</td>
        <td class="num">${formatAUD(toNum(row['Spend']))}</td>
        <td class="num">${ctr.toFixed(2)}%</td>
      </tr>`;
    }).join('');
  }

  // Pagination info
  const fromRow = totalRows > 0 ? start + 1 : 0;
  const toRow   = Math.min(start + ROWS_PER_PAGE, totalRows);
  el('pagination-info').textContent = `Showing ${fromRow}–${toRow} of ${totalRows.toLocaleString()} rows`;
  el('btn-prev').disabled     = currentPage <= 1;
  el('btn-next').disabled     = currentPage >= totalPages;
  el('page-jump-input').value = currentPage;
  el('page-jump-total').textContent = `of ${totalPages}`;
}

function sortData(data, col, dir) {
  const numeric = ['Impressions', 'Reach', 'Clicks', 'Spend', 'CTR', 'Leads', 'CPL'];
  const mult = dir === 'asc' ? 1 : -1;

  return data.sort((a, b) => {
    let av = a[col] ?? '';
    let bv = b[col] ?? '';

    if (numeric.includes(col)) {
      av = toNum(av);
      bv = toNum(bv);
      return (av - bv) * mult;
    }

    // Date sort: YYYY-MM-DD strings compare correctly as strings
    av = String(av).toLowerCase();
    bv = String(bv).toLowerCase();
    return av < bv ? -mult : av > bv ? mult : 0;
  });
}

function updateSortIndicators() {
  document.querySelectorAll('#data-table thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortCol) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ── Pagination events ─────────────────────────────────────────────────────────
function bindPaginationEvents() {
  el('btn-prev').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTablePage(); }
  });
  el('btn-next').addEventListener('click', () => {
    currentPage++;
    renderTablePage();
  });
  el('page-jump-input').addEventListener('change', e => {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n) && n >= 1) { currentPage = n; renderTablePage(); }
  });
}

// ── Manual refresh ────────────────────────────────────────────────────────────
function bindRefreshEvents() {
  el('btn-refresh').addEventListener('click', () => {
    clearInterval(refreshTimer);
    fetchData();
    refreshTimer = setInterval(fetchData, REFRESH_INTERVAL_MS);
  });
  el('btn-retry').addEventListener('click', () => {
    hideError();
    fetchData();
  });
}

// ── CSV fallback ──────────────────────────────────────────────────────────────
function bindCsvUpload() {
  el('csv-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseCsv(ev.target.result);
        onDataReceived(parsed);
      } catch (err) {
        showError('Could not parse CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows.');

  const headers = splitCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 0) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Status / error UI ─────────────────────────────────────────────────────────
function setStatusLoading() {
  const dot = el('status-dot');
  dot.className = 'status-dot loading';
  dot.title = 'Loading…';
}

function setStatusConnected() {
  const dot = el('status-dot');
  dot.className = 'status-dot';
  dot.title = 'Connected';
  el('last-updated').textContent = 'Updated ' + formatDateTime(new Date());
}

function showError(msg) {
  const dot = el('status-dot');
  dot.className = 'status-dot error';
  dot.title = 'Connection error';
  el('last-updated').textContent = 'Error';

  el('error-message').textContent = msg;
  el('error-banner').removeAttribute('hidden');
}

function hideError() {
  el('error-banner').setAttribute('hidden', '');
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD/MM/YYYY */
function formatDate(str) {
  if (!str || !str.includes('-')) return str;
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Date object → DD/MM/YYYY HH:MM */
function formatDateTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** AUD currency format */
function formatAUD(n) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compact number with K/M suffix */
function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

/** Safe numeric parse */
function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/** XSS-safe string */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** getElementById shorthand */
function el(id) { return document.getElementById(id); }
