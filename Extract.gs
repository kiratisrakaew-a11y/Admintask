/**
 * Reads all configured transaction source sheets in batch and returns meaningful raw rows.
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @return {{records: Array<Object>, sheetCounts: Object<string, number>, errors: string[]}}
 */
function extractSourceRows_(spreadsheet) {
  const records = [];
  const sheetCounts = {};
  const errors = [];
  const sourceSheets = COLUMN_MAPPING.SOURCE_SHEETS;

  Object.keys(sourceSheets).forEach(function(sheetName) {
    const sourceConfig = sourceSheets[sheetName];
    if (sourceConfig.legacy && !COLUMN_MAPPING.INCLUDE_LEGACY_SPECIAL_LICENSE) {
      return;
    }

    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      errors.push('Missing source sheet: ' + sheetName);
      sheetCounts[sheetName] = 0;
      return;
    }

    const values = sheet.getDataRange().getValues();
    const scopeText = values[sourceConfig.scopeRow - 1] ? cleanText_(values[sourceConfig.scopeRow - 1][0]) : '';
    const startIndex = sourceConfig.dataStartRow - 1;
    let count = 0;

    values.slice(startIndex).forEach(function(row, index) {
      const sourceRowNo = startIndex + index + 1;
      if (!isMeaningfulSourceRow_(row, sourceConfig)) {
        return;
      }

      records.push({
        sourceSheetName: sheetName,
        sourceRowNo: sourceRowNo,
        rowValues: row,
        sourceConfig: sourceConfig,
        scopeText: scopeText
      });
      count += 1;
    });

    sheetCounts[sheetName] = count;
  });

  return {records: records, sheetCounts: sheetCounts, errors: errors};
}

/**
 * Skips blank/template rows and default unchecked checkbox rows.
 * @param {Array<*>} row
 * @param {Object} sourceConfig
 * @return {boolean}
 */
function isMeaningfulSourceRow_(row, sourceConfig) {
  const mappedColumns = sourceConfig.sourceColumns;
  const meaningfulFields = Object.keys(mappedColumns).filter(function(fieldName) {
    return [
      'source_sequence_no',
      'has_po_original',
      'has_pr_original',
      'has_pr_copy',
      'has_invoice_original',
      'has_invoice_copy',
      'has_tax_invoice',
      'has_delivery_note',
      'has_handover_doc',
      'has_handover_image',
      'has_credit_note',
      'has_memo'
    ].indexOf(fieldName) === -1;
  });

  return meaningfulFields.some(function(fieldName) {
    const columnLetter = mappedColumns[fieldName];
    if (!columnLetter) {
      return false;
    }
    return cleanText_(row[columnLetterToIndex_(columnLetter)]) !== '';
  });
}
