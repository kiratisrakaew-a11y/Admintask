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
 * Refreshes the full procurement master pipeline from raw sheets into generated outputs.
 */
function refreshProcurementMaster() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const batchId = createLoadBatchId_();
    const referenceResult = refreshReferenceSheets_(spreadsheet);
    const extractionResult = extractSourceRows_(spreadsheet);
    const masterRows = transformToMasterRows_(extractionResult.records, referenceResult, batchId);
    const validationResult = validateMasterRows_(masterRows);
    const analyticsRows = buildAdminWorkloadAnalytics_(validationResult.masterRows);

    writeTable_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.MASTER, PROCUREMENT_CONFIG.MASTER_HEADERS, objectsToRows_(validationResult.masterRows, PROCUREMENT_CONFIG.MASTER_HEADERS));
    writeTable_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.ANALYTICS, PROCUREMENT_CONFIG.ANALYTICS_HEADERS, objectsToRows_(analyticsRows, PROCUREMENT_CONFIG.ANALYTICS_HEADERS));
    writeTable_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.DATA_QUALITY, PROCUREMENT_CONFIG.DATA_QUALITY_HEADERS, objectsToRows_(validationResult.issues, PROCUREMENT_CONFIG.DATA_QUALITY_HEADERS));
    writeSourceMappingSheet_(spreadsheet);

    appendRunLog_(
      spreadsheet,
      batchId,
      'refreshProcurementMaster',
      extractionResult.errors.length ? 'warning' : 'success',
      buildRefreshSummaryMessage_(referenceResult, extractionResult, validationResult, analyticsRows),
      {
        sourceRowCount: extractionResult.records.length,
        masterRowCount: validationResult.masterRows.length,
        analyticsRowCount: analyticsRows.length,
        dataQualityIssueCount: validationResult.issues.length
      }
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Milestone 2: reads LIST and rebuilds reference lookup sheets.
 */
function refreshReferences() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const batchId = createLoadBatchId_();
    const counts = refreshReferenceSheets_(spreadsheet);

    appendRunLog_(
      spreadsheet,
      batchId,
      'refreshReferences',
      'success',
      'REF_COMPANY: ' + counts.companyCount + ' rows, REF_DEPARTMENT: ' +
        counts.departmentCount + ' rows, LIST rows scanned: ' + counts.sourceRowsScanned + '.',
      {sourceRowCount: counts.totalReferenceCount}
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Clears and recreates all generated sheets with their configured headers.
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
    appendRunLog_(spreadsheet, batchId, 'rebuildAllGeneratedSheets', 'scaffold_complete', 'All generated sheet headers rebuilt; raw sheets were not modified.');
  } finally {
    lock.releaseLock();
  }
}


/**
 * Creates every required generated sheet with the exact configured headers for Milestone 1.
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
    {
      name: PROCUREMENT_CONFIG.SHEETS.MASTER,
      headers: PROCUREMENT_CONFIG.MASTER_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.ANALYTICS,
      headers: PROCUREMENT_CONFIG.ANALYTICS_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.DATA_QUALITY,
      headers: PROCUREMENT_CONFIG.DATA_QUALITY_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.SOURCE_MAPPING,
      headers: PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.REF_COMPANY,
      headers: PROCUREMENT_CONFIG.REF_COMPANY_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.REF_DEPARTMENT,
      headers: PROCUREMENT_CONFIG.REF_DEPARTMENT_HEADERS
    },
    {
      name: PROCUREMENT_CONFIG.SHEETS.RUN_LOG,
      headers: PROCUREMENT_CONFIG.RUN_LOG_HEADERS
    }
  ];
}


/**
 * Rebuilds a generated table with headers and data rows using batch writes.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} sheetName
 * @param {string[]} headers
 * @param {Array<Array<*>>} rows
 * @return {SpreadsheetApp.Sheet}
 */
function writeTable_(spreadsheet, sheetName, headers, rows) {
  const sheet = ensureGeneratedSheet_(spreadsheet, sheetName, headers);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return sheet;
}

/**
 * @param {Object} referenceResult
 * @param {Object} extractionResult
 * @param {Object} validationResult
 * @param {Array<Object>} analyticsRows
 * @return {string}
 */
function buildRefreshSummaryMessage_(referenceResult, extractionResult, validationResult, analyticsRows) {
  const sheetCounts = Object.keys(extractionResult.sheetCounts).map(function(sheetName) {
    return sheetName + ': ' + extractionResult.sheetCounts[sheetName];
  }).join(', ');
  const errors = extractionResult.errors.length ? ' Errors: ' + extractionResult.errors.join(' | ') : '';
  return 'Refresh complete. Company refs: ' + referenceResult.companyCount + ', department refs: ' + referenceResult.departmentCount + ', source rows: ' + extractionResult.records.length + ', master rows: ' + validationResult.masterRows.length + ', analytics rows: ' + analyticsRows.length + ', data quality issues: ' + validationResult.issues.length + '. Source counts: ' + sheetCounts + '.' + errors;
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
 * Builds a human-readable source mapping sheet from COLUMN_MAPPING.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 */
function writeSourceMappingSheet_(spreadsheet) {
  const rows = [PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS];
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
  if (rows.length > 1) {
    sheet.getRange(2, 1, rows.length - 1, PROCUREMENT_CONFIG.SOURCE_MAPPING_HEADERS.length).setValues(rows.slice(1));
  }
}

/**
 * Appends a run log row while preserving existing log history.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} batchId
 * @param {string} action
 * @param {string} status
 * @param {string} message
 * @param {{sourceRowCount: number, masterRowCount: number, analyticsRowCount: number, dataQualityIssueCount: number}=} counts
 */
function appendRunLog_(spreadsheet, batchId, action, status, message, counts) {
  let sheet = spreadsheet.getSheetByName(PROCUREMENT_CONFIG.SHEETS.RUN_LOG);
  if (!sheet) {
    sheet = ensureGeneratedSheet_(spreadsheet, PROCUREMENT_CONFIG.SHEETS.RUN_LOG, PROCUREMENT_CONFIG.RUN_LOG_HEADERS);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, PROCUREMENT_CONFIG.RUN_LOG_HEADERS.length).setValues([PROCUREMENT_CONFIG.RUN_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }

  const runCounts = counts || {};
  const now = Utilities.formatDate(new Date(), PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    now,
    batchId,
    action,
    status,
    runCounts.sourceRowCount || 0,
    runCounts.masterRowCount || 0,
    runCounts.analyticsRowCount || 0,
    runCounts.dataQualityIssueCount || 0,
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
