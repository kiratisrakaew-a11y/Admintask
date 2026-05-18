/**
 * Adds the Procurement Master menu to the active Google Sheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(PROCUREMENT_CONFIG.MENU.NAME)
    .addItem(PROCUREMENT_CONFIG.MENU.REFRESH_REFERENCES, 'refreshReferences')
    .addItem(PROCUREMENT_CONFIG.MENU.REFRESH_MASTER, 'refreshProcurementMaster')
    .addSeparator()
    .addItem(PROCUREMENT_CONFIG.MENU.REBUILD_ALL, 'rebuildAllGeneratedSheets')
    .addToUi();
}

/**
 * Refreshes MASTER_PR_APPROVED, DATA_QUALITY_ISSUES, and ADMIN_WORKLOAD_ANALYTICS
 * from the raw transaction source sheets. Raw sheets are never modified.
 */
function refreshProcurementMaster() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const batchId = createLoadBatchId_();
    const counts = {sourceRowCount: 0, masterRowCount: 0, analyticsRowCount: 0, dataQualityIssueCount: 0};

    try {
      const referenceMaps = buildReferenceMaps_(readReferenceData_(spreadsheet));
      const extraction = extractSourceRows_(spreadsheet);
      counts.sourceRowCount = extraction.records.length;

      const masterRows = transformToMasterRows_(extraction.records, referenceMaps, batchId);
      const validated = validateMasterRows_(masterRows);
      const analyticsRows = buildAdminWorkloadAnalytics_(validated.masterRows);

      writeObjectRowsToSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.MASTER, PROCUREMENT_CONFIG.MASTER_HEADERS, validated.masterRows);
      writeObjectRowsToSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.DATA_QUALITY, PROCUREMENT_CONFIG.DATA_QUALITY_HEADERS, validated.issues);
      writeObjectRowsToSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.ANALYTICS, PROCUREMENT_CONFIG.ANALYTICS_HEADERS, analyticsRows);

      counts.masterRowCount = validated.masterRows.length;
      counts.analyticsRowCount = analyticsRows.length;
      counts.dataQualityIssueCount = validated.issues.length;

      const sheetSummary = summarizeSheetCounts_(extraction.sheetCounts);
      const extractionWarnings = extraction.errors.length ? ' | extraction_warnings: ' + extraction.errors.join('; ') : '';
      appendRunLog_(spreadsheet, batchId, 'refreshProcurementMaster', 'success',
        'Master refresh complete. ' + sheetSummary + extractionWarnings, counts);
    } catch (error) {
      appendRunLog_(spreadsheet, batchId, 'refreshProcurementMaster', 'error', String(error && error.stack || error), counts);
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads the LIST sheet and rebuilds the REF_COMPANY and REF_DEPARTMENT generated sheets.
 */
function refreshReferences() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const batchId = createLoadBatchId_();

    try {
      const result = refreshReferenceSheets_(spreadsheet);
      const counts = {
        sourceRowCount: result.sourceRowsScanned,
        masterRowCount: 0,
        analyticsRowCount: 0,
        dataQualityIssueCount: 0
      };
      appendRunLog_(spreadsheet, batchId, 'refreshReferences', 'success',
        'Reference refresh complete. company_rows=' + result.companyCount + ' department_rows=' + result.departmentCount,
        counts);
    } catch (error) {
      appendRunLog_(spreadsheet, batchId, 'refreshReferences', 'error', String(error && error.stack || error),
        {sourceRowCount: 0, masterRowCount: 0, analyticsRowCount: 0, dataQualityIssueCount: 0});
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Clears and recreates all generated sheets, then re-runs reference and master refresh.
 * This function intentionally does not touch raw source sheets.
 */
function rebuildAllGeneratedSheets() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const batchId = createLoadBatchId_();

    createAllGeneratedSheetHeaders_(spreadsheet);
    writeSourceMappingSheet_(spreadsheet);
    appendRunLog_(spreadsheet, batchId, 'rebuildAllGeneratedSheets', 'headers_rebuilt',
      'All generated sheet headers rebuilt; raw sheets were not modified.',
      {sourceRowCount: 0, masterRowCount: 0, analyticsRowCount: 0, dataQualityIssueCount: 0});
  } finally {
    lock.releaseLock();
  }

  refreshReferences();
  refreshProcurementMaster();
}


/**
 * Creates every required generated sheet with the exact configured headers.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 */
function createAllGeneratedSheetHeaders_(spreadsheet) {
  const sheetDefinitions = getGeneratedSheetDefinitions_();
  sheetDefinitions.forEach(function(sheetDefinition) {
    ensureGeneratedSheet_(spreadsheet, sheetDefinition.name, sheetDefinition.headers);
  });
}

/**
 * @return {Array<{name: string, headers: string[]}>}
 */
function getGeneratedSheetDefinitions_() {
  return [
    {name: PROCUREMENT_CONFIG.SHEETS.MASTER, headers: PROCUREMENT_CONFIG.MASTER_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.ANALYTICS, headers: PROCUREMENT_CONFIG.ANALYTICS_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.DATA_QUALITY, headers: PROCUREMENT_CONFIG.DATA_QUALITY_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.SOURCE_MAPPING, headers: PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.REF_COMPANY, headers: PROCUREMENT_CONFIG.REF_COMPANY_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.REF_DEPARTMENT, headers: PROCUREMENT_CONFIG.REF_DEPARTMENT_HEADERS},
    {name: PROCUREMENT_CONFIG.SHEETS.RUN_LOG, headers: PROCUREMENT_CONFIG.RUN_LOG_HEADERS}
  ];
}

/**
 * Creates or clears a generated sheet and writes exactly one header row.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} sheetName
 * @param {string[]} headers
 * @return {SpreadsheetApp.Sheet}
 */
function ensureGeneratedSheet_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Writes object rows to a generated sheet in one batch using the configured header order.
 * The sheet is always recreated with headers; raw sheets are never touched.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} sheetName
 * @param {string[]} headers
 * @param {Array<Object>} objects
 */
function writeObjectRowsToSheet_(spreadsheet, sheetName, headers, objects) {
  const sheet = ensureGeneratedSheet_(spreadsheet, sheetName, headers);
  if (!objects || objects.length === 0) {
    return;
  }
  const rows = objectsToRows_(objects, headers);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

/**
 * Converts reference row arrays from readReferenceData_ into lookup maps used by Transform.gs.
 * @param {{companyRows: Array<Array<string>>, departmentRows: Array<Array<string>>}} referenceData
 * @return {{companyMap: Object<string, string>, departmentMap: Object<string, string>}}
 */
function buildReferenceMaps_(referenceData) {
  return {
    companyMap: rowsToLookupMap_(referenceData.companyRows),
    departmentMap: rowsToLookupMap_(referenceData.departmentRows)
  };
}

/**
 * @param {Array<Array<string>>} rows
 * @return {Object<string, string>}
 */
function rowsToLookupMap_(rows) {
  return rows.reduce(function(map, row) {
    const code = cleanText_(row[0]);
    if (code !== '') {
      map[code] = cleanText_(row[1]);
    }
    return map;
  }, {});
}

/**
 * @param {Object<string, number>} sheetCounts
 * @return {string}
 */
function summarizeSheetCounts_(sheetCounts) {
  const parts = Object.keys(sheetCounts).map(function(name) {
    return name.trim() + '=' + sheetCounts[name];
  });
  return 'source_row_counts: ' + parts.join(', ');
}

/**
 * Builds a human-readable source mapping sheet from COLUMN_MAPPING.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 */
function writeSourceMappingSheet_(spreadsheet) {
  const rows = [];
  const sourceSheets = COLUMN_MAPPING.SOURCE_SHEETS;

  Object.keys(sourceSheets).forEach(function(sourceSheetName) {
    const sourceConfig = sourceSheets[sourceSheetName];
    const sourceColumns = sourceConfig.sourceColumns;

    Object.keys(sourceColumns).forEach(function(masterField) {
      const sourceColumn = sourceColumns[masterField];
      rows.push([
        sourceSheetName,
        sourceConfig.dataStartRow,
        sourceColumn || '',
        getSourceMeaning_(masterField),
        masterField,
        getMappingNote_(sourceConfig, masterField)
      ]);
    });
  });

  const sheet = ensureGeneratedSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.SOURCE_MAPPING, PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS.length).setValues(rows);
  }
}

/**
 * Appends a run log row while preserving existing log history.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} batchId
 * @param {string} action
 * @param {string} status
 * @param {string} message
 * @param {{sourceRowCount: number, masterRowCount: number, analyticsRowCount: number, dataQualityIssueCount: number}} counts
 */
function appendRunLog_(spreadsheet, batchId, action, status, message, counts) {
  let sheet = spreadsheet.getSheetByName(PROCUREMENT_CONFIG.SHEETS.RUN_LOG);
  if (!sheet) {
    sheet = ensureGeneratedSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.RUN_LOG, PROCUREMENT_CONFIG.RUN_LOG_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, PROCUREMENT_CONFIG.RUN_LOG_HEADERS.length).setValues([PROCUREMENT_CONFIG.RUN_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }

  const safeCounts = counts || {sourceRowCount: 0, masterRowCount: 0, analyticsRowCount: 0, dataQualityIssueCount: 0};
  const now = Utilities.formatDate(new Date(), PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    now,
    batchId,
    action,
    status,
    safeCounts.sourceRowCount || 0,
    safeCounts.masterRowCount || 0,
    safeCounts.analyticsRowCount || 0,
    safeCounts.dataQualityIssueCount || 0,
    message
  ]);
  console.log(action + ': ' + status + ' - ' + message);
}

/**
 * @return {string}
 */
function createLoadBatchId_() {
  return Utilities.formatDate(new Date(), PROCUREMENT_CONFIG.TIMEZONE, "yyyyMMdd'T'HHmmss");
}

/**
 * @param {Object} sourceConfig
 * @param {string} masterField
 * @return {string}
 */
function getMappingNote_(sourceConfig, masterField) {
  if (!sourceConfig.notes || !sourceConfig.notes[masterField]) {
    return '';
  }
  return sourceConfig.notes[masterField];
}

/**
 * @param {string} masterField
 * @return {string}
 */
function getSourceMeaning_(masterField) {
  const meanings = COLUMN_MAPPING.FIELD_MEANINGS;
  if (!meanings || !meanings[masterField]) {
    return '';
  }
  return meanings[masterField];
}
