/**
 * Code.gs — Apartments.com.au Paid Media Dashboard
 *
 * Imports leads from the Leads Data sheet, enriches each row with project
 * metadata from the Projects Database, and appends only NEW rows (identified
 * by Reference ID) to the destination sheet.
 *
 * Trigger: run manually or set a time-driven trigger in Apps Script.
 */

var CONFIG = {
  // Source: leads
  LEADS_SPREADSHEET_ID: '1yB8swKHWDBDaokdinq_0mqio_Sg_tWap26LnI0zuhpk',
  LEADS_SHEET_NAME: 'Leads Data',

  // Source: projects
  PROJECTS_SPREADSHEET_ID: '1LsezVyZ9OosdJYO1Q37NG8vifV-AKzB4keymQU30Kn4',
  PROJECTS_SHEET_NAME: 'Projects Database',

  // Destination
  DEST_SPREADSHEET_ID: '1pRg_BqxJuZ0jdNJuor8BiXkFG_6PIBbea_2YRxDfoIE',
  DEST_SHEET_NAME: 'Leads Data',

  // Column header names
  ID_HEADER: 'Project ID',
  UNIQUE_KEY_HEADER: 'Reference ID',

  // Only import leads on or after this date
  CUTOFF_DATE: new Date('2025-01-01')
};

/**
 * Leads columns (in order, as they appear in the source sheet):
 *   Date, Project ID, Reference ID, Campaign Type, Source, Medium, Paid,
 *   Source Group, Cleaned Source, Traffic Channel, Campaign, Content
 *
 * Appended columns added by this script:
 *   Project name, Suburb, State
 */

function importAndMergeLeadsWithProjects_AppendNewOnly() {
  // ── 1. Load leads ──────────────────────────────────────────────────────────
  var leadsSS   = SpreadsheetApp.openById(CONFIG.LEADS_SPREADSHEET_ID);
  var leadsSheet = leadsSS.getSheetByName(CONFIG.LEADS_SHEET_NAME);
  if (!leadsSheet) {
    Logger.log('ERROR: Leads sheet "' + CONFIG.LEADS_SHEET_NAME + '" not found.');
    return;
  }

  var leadsData = leadsSheet.getDataRange().getValues();
  if (leadsData.length < 2) {
    Logger.log('No data in leads sheet.');
    return;
  }

  var leadsHeaders = leadsData[0];
  var leadsRows    = leadsData.slice(1);

  // Map header names to column indices
  var leadsIdx = {};
  leadsHeaders.forEach(function(h, i) { leadsIdx[h] = i; });

  var dateCol      = leadsIdx['Date'];
  var projectIdCol = leadsIdx[CONFIG.ID_HEADER];
  var refIdCol     = leadsIdx[CONFIG.UNIQUE_KEY_HEADER];

  if (dateCol === undefined || projectIdCol === undefined || refIdCol === undefined) {
    Logger.log('ERROR: Required column(s) missing in leads sheet. Found: ' + leadsHeaders.join(', '));
    return;
  }

  // ── 2. Load projects → lookup map { projectId: { name, suburb, state } } ──
  var projectsSS    = SpreadsheetApp.openById(CONFIG.PROJECTS_SPREADSHEET_ID);
  var projectsSheet = projectsSS.getSheetByName(CONFIG.PROJECTS_SHEET_NAME);
  if (!projectsSheet) {
    Logger.log('ERROR: Projects sheet "' + CONFIG.PROJECTS_SHEET_NAME + '" not found.');
    return;
  }

  var projectsData    = projectsSheet.getDataRange().getValues();
  var projectsHeaders = projectsData[0];
  var projectsRows    = projectsData.slice(1);

  var projIdx = {};
  projectsHeaders.forEach(function(h, i) { projIdx[h] = i; });

  var projIdCol    = projIdx[CONFIG.ID_HEADER];
  var projNameCol  = projIdx['Project name'];
  var projSuburbCol = projIdx['Suburb'];
  var projStateCol  = projIdx['State'];

  if (projIdCol === undefined) {
    Logger.log('ERROR: "' + CONFIG.ID_HEADER + '" column not found in projects sheet.');
    return;
  }

  var projectsMap = {};
  projectsRows.forEach(function(row) {
    var id = String(row[projIdCol]).trim();
    if (id) {
      projectsMap[id] = {
        name:   projNameCol  !== undefined ? row[projNameCol]   : '',
        suburb: projSuburbCol !== undefined ? row[projSuburbCol] : '',
        state:  projStateCol  !== undefined ? row[projStateCol]  : ''
      };
    }
  });

  // ── 3. Load destination → collect existing Reference IDs ──────────────────
  var destSS    = SpreadsheetApp.openById(CONFIG.DEST_SPREADSHEET_ID);
  var destSheet = destSS.getSheetByName(CONFIG.DEST_SHEET_NAME);
  if (!destSheet) {
    Logger.log('ERROR: Destination sheet "' + CONFIG.DEST_SHEET_NAME + '" not found.');
    return;
  }

  var destData = destSheet.getDataRange().getValues();
  var existingRefIds = new Set();

  if (destData.length >= 1) {
    var destHeaders = destData[0];
    var destRefIdCol = destHeaders.indexOf(CONFIG.UNIQUE_KEY_HEADER);

    if (destRefIdCol >= 0 && destData.length > 1) {
      destData.slice(1).forEach(function(row) {
        var refId = String(row[destRefIdCol]).trim();
        if (refId) existingRefIds.add(refId);
      });
    }
  }

  Logger.log('Existing rows in destination: ' + existingRefIds.size);

  // ── 4. Build rows to append ────────────────────────────────────────────────
  var rowsToAppend = [];

  leadsRows.forEach(function(row) {
    // Date filter
    var rawDate = row[dateCol];
    var rowDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(rowDate.getTime()) || rowDate < CONFIG.CUTOFF_DATE) return;

    // Deduplicate by Reference ID
    var refId = String(row[refIdCol]).trim();
    if (!refId || existingRefIds.has(refId)) return;

    // Enrich with project data
    var projectId = String(row[projectIdCol]).trim();
    var project   = projectsMap[projectId] || { name: '', suburb: '', state: '' };

    // Build output row matching leads columns + enrichment
    var outputRow = [
      row[leadsIdx['Date']            ] || '',
      row[leadsIdx[CONFIG.ID_HEADER]  ] || '',
      refId,
      row[leadsIdx['Campaign Type']   ] || '',
      row[leadsIdx['Source']          ] || '',
      row[leadsIdx['Medium']          ] || '',
      row[leadsIdx['Paid']            ] || '',
      row[leadsIdx['Source Group']    ] || '',
      row[leadsIdx['Cleaned Source']  ] || '',
      row[leadsIdx['Traffic Channel'] ] || '',
      row[leadsIdx['Campaign']        ] || '',
      row[leadsIdx['Content']         ] || '',
      project.name,
      project.suburb,
      project.state
    ];

    rowsToAppend.push(outputRow);
    existingRefIds.add(refId); // prevent duplicates within the same run
  });

  // ── 5. Write header row if destination is empty, then append ───────────────
  if (destSheet.getLastRow() === 0) {
    var headerRow = [
      'Date', CONFIG.ID_HEADER, CONFIG.UNIQUE_KEY_HEADER,
      'Campaign Type', 'Source', 'Medium', 'Paid',
      'Source Group', 'Cleaned Source', 'Traffic Channel', 'Campaign', 'Content',
      'Project name', 'Suburb', 'State'
    ];
    destSheet.appendRow(headerRow);
    Logger.log('Header row written to destination.');
  }

  if (rowsToAppend.length > 0) {
    var lastRow = destSheet.getLastRow();
    destSheet.getRange(lastRow + 1, 1, rowsToAppend.length, rowsToAppend[0].length)
      .setValues(rowsToAppend);
    Logger.log('Appended ' + rowsToAppend.length + ' new row(s) to destination.');
  } else {
    Logger.log('No new rows to append.');
  }
}
