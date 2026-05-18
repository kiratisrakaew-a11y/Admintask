/**
 * Reads LIST once and rebuilds the generated reference sheets in batch.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @return {{companyCount: number, departmentCount: number, totalReferenceCount: number, sourceRowsScanned: number, companyMap: Object<string, string>, departmentMap: Object<string, string>}}
 */
function refreshReferenceSheets_(spreadsheet) {
  const referenceData = readReferenceData_(spreadsheet);

  writeReferenceTable_(
    spreadsheet,
    PROCUREMENT_CONFIG.SHEETS.REF_COMPANY,
    PROCUREMENT_CONFIG.REF_COMPANY_HEADERS,
    referenceData.companyRows
  );
  writeReferenceTable_(
    spreadsheet,
    PROCUREMENT_CONFIG.SHEETS.REF_DEPARTMENT,
    PROCUREMENT_CONFIG.REF_DEPARTMENT_HEADERS,
    referenceData.departmentRows
  );

  return {
    companyCount: referenceData.companyRows.length,
    departmentCount: referenceData.departmentRows.length,
    totalReferenceCount: referenceData.companyRows.length + referenceData.departmentRows.length,
    sourceRowsScanned: referenceData.sourceRowsScanned,
    companyMap: referenceData.companyMap,
    departmentMap: referenceData.departmentMap
  };
}

/**
 * Reads company and department lookup values from the LIST sheet.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @return {{companyRows: Array<Array<string>>, departmentRows: Array<Array<string>>, companyMap: Object<string, string>, departmentMap: Object<string, string>, sourceRowsScanned: number}}
 */
function readReferenceData_(spreadsheet) {
  const listSheet = spreadsheet.getSheetByName(COLUMN_MAPPING.REFERENCE_SHEET);
  if (!listSheet) {
    throw new Error('Required reference sheet not found: ' + COLUMN_MAPPING.REFERENCE_SHEET);
  }

  const values = listSheet.getDataRange().getValues();
  const companyMapping = COLUMN_MAPPING.REFERENCE_MAPPINGS.company;
  const departmentMapping = COLUMN_MAPPING.REFERENCE_MAPPINGS.department;
  const companyRows = extractReferenceRows_(values, companyMapping, ['company', 'company_name']);
  const departmentRows = extractReferenceRows_(values, departmentMapping, ['department', 'department_name']);

  return {
    companyRows: companyRows,
    departmentRows: departmentRows,
    companyMap: buildReferenceMap_(companyRows),
    departmentMap: buildReferenceMap_(departmentRows),
    sourceRowsScanned: Math.max(0, values.length - 1)
  };
}

/**
 * Extracts lookup rows from a bulk getValues result using configured source columns.
 * Rows with a blank lookup code are ignored, even if the display name is populated.
 * @param {Array<Array<*>>} values
 * @param {{startRow: number, sourceColumns: Object<string, string>}} mapping
 * @param {string[]} fields
 * @return {Array<Array<string>>}
 */
function extractReferenceRows_(values, mapping, fields) {
  const startIndex = mapping.startRow - 1;
  const sourceIndexes = fields.map(function(fieldName) {
    return columnLetterToIndex_(mapping.sourceColumns[fieldName]);
  });
  const rows = [];

  values.slice(startIndex).forEach(function(row) {
    const outputRow = sourceIndexes.map(function(sourceIndex) {
      return normalizeReferenceValue_(row[sourceIndex]);
    });

    if (outputRow[0] !== '') {
      rows.push(outputRow);
    }
  });

  return rows;
}


/**
 * Builds a lookup map keyed by code for downstream transformations.
 * @param {Array<Array<string>>} rows
 * @return {Object<string, string>}
 */
function buildReferenceMap_(rows) {
  return rows.reduce(function(map, row) {
    map[row[0]] = row[1] || '';
    return map;
  }, {});
}

/**
 * Rebuilds a generated reference sheet using one header write and one data write.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {string} sheetName
 * @param {string[]} headers
 * @param {Array<Array<string>>} rows
 */
function writeReferenceTable_(spreadsheet, sheetName, headers, rows) {
  const sheet = ensureGeneratedSheet_(spreadsheet, sheetName, headers);
  if (rows.length === 0) {
    return;
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}
/**
 * @param {*} value
 * @return {string}
 */
function normalizeReferenceValue_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}
