/**
 * Reads LIST once and rebuilds the generated reference sheets in batch.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @return {{companyCount: number, departmentCount: number, sourceRowsScanned: number}}
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
    sourceRowsScanned: referenceData.sourceRowsScanned
  };
}

/**
 * Reads company and department lookup values from the LIST sheet.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @return {{companyRows: Array<Array<string>>, departmentRows: Array<Array<string>>, sourceRowsScanned: number}}
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
    sourceRowsScanned: Math.max(0, values.length - 1)
  };
}

/**
 * Extracts lookup rows from a bulk getValues result using configured source columns.
 * Rows with both lookup fields blank are ignored.
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

    if (outputRow.some(function(value) { return value !== ''; })) {
      rows.push(outputRow);
    }
  });

  return rows;
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
 * Converts an A1 column letter to a zero-based array index.
 * @param {string} columnLetter
 * @return {number}
 */
function columnLetterToIndex_(columnLetter) {
  return columnLetter.split('').reduce(function(total, letter) {
    return (total * 26) + letter.toUpperCase().charCodeAt(0) - 64;
  }, 0) - 1;
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
