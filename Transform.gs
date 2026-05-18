/**
 * Converts extracted source rows into MASTER_PR_APPROVED objects.
 * @param {Array<Object>} extractedRecords
 * @param {{companyMap: Object<string, string>, departmentMap: Object<string, string>}} referenceData
 * @param {string} batchId
 * @return {Array<Object>}
 */
function transformToMasterRows_(extractedRecords, referenceData, batchId) {
  const loadedAt = Utilities.formatDate(new Date(), PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return extractedRecords.map(function(record) {
    return transformSourceRecord_(record, referenceData, batchId, loadedAt);
  });
}

/**
 * @param {Object} record
 * @param {{companyMap: Object<string, string>, departmentMap: Object<string, string>}} referenceData
 * @param {string} batchId
 * @param {string} loadedAt
 * @return {Object}
 */
function transformSourceRecord_(record, referenceData, batchId, loadedAt) {
  const master = createBlankMasterObject_();
  const messages = [];
  const sourceColumns = record.sourceConfig.sourceColumns;

  master.record_id = 'SRC::' + record.sourceSheetName + '::ROW::' + record.sourceRowNo;
  master.source_file_name = PROCUREMENT_CONFIG.SOURCE_FILE_NAME;
  master.source_sheet_name = record.sourceSheetName;
  master.source_row_no = record.sourceRowNo;
  master.source_owner_name = record.sourceConfig.ownerName || '';
  master.source_scope_text = record.scopeText || '';
  master.load_batch_id = batchId;
  master.loaded_at = loadedAt;
  master.raw_row_hash = hashValues_(record.rowValues);
  master.mapping_status = record.sourceConfig.mappingStatus || 'mapped';

  Object.keys(sourceColumns).forEach(function(fieldName) {
    const columnLetter = sourceColumns[fieldName];
    if (!columnLetter) {
      return;
    }
    const rawValue = record.rowValues[columnLetterToIndex_(columnLetter)];
    applyMappedValue_(master, fieldName, rawValue, messages);
  });

  if (master.company !== '') {
    master.company_name = referenceData.companyMap[master.company] || '';
  }
  if (master.department !== '') {
    master.department_name = referenceData.departmentMap[master.department] || '';
  }

  const contractPeriod = parseContractPeriod_(master.contract_period_raw);
  master.contract_start_date = contractPeriod.startDate;
  master.contract_end_date = contractPeriod.endDate;
  contractPeriod.messages.forEach(function(message) { messages.push(message); });

  if (record.sourceConfig.legacy) {
    messages.push('legacy_source: Source sheet is Special License legacy data.');
  }

  master.validation_message = messages.join(' | ');
  master.validation_status = messages.length ? 'warning' : 'pass';
  return master;
}

/**
 * @return {Object}
 */
function createBlankMasterObject_() {
  return PROCUREMENT_CONFIG.MASTER_HEADERS.reduce(function(object, header) {
    object[header] = '';
    return object;
  }, {});
}

/**
 * @param {Object} master
 * @param {string} fieldName
 * @param {*} rawValue
 * @param {string[]} messages
 */
function applyMappedValue_(master, fieldName, rawValue, messages) {
  if (fieldName === 'quotation_or_lur_no') {
    const value = cleanText_(rawValue);
    if (/lur/i.test(value)) {
      master.lur_no = value;
    } else {
      master.quotation_no = value;
    }
    return;
  }

  if (fieldName === 'duplicate_submit_time_unclear') {
    const duplicateTime = cleanText_(rawValue);
    if (duplicateTime !== '' && duplicateTime !== master.submit_time) {
      messages.push('duplicate_submit_time_unclear: ' + duplicateTime);
    }
    return;
  }

  if (isDateField_(fieldName)) {
    const parsedDate = parseDateValue_(rawValue);
    master[fieldName] = parsedDate.value;
    if (parsedDate.message) {
      messages.push(fieldName + ': ' + parsedDate.message);
    }
    return;
  }

  if (isBooleanField_(fieldName)) {
    master[fieldName] = parseBooleanFlag_(rawValue);
    return;
  }

  master[fieldName] = cleanText_(rawValue);
}

/**
 * @param {string} fieldName
 * @return {boolean}
 */
function isDateField_(fieldName) {
  return [
    'request_date',
    'due_date',
    'request_cheque_date',
    'po_open_date',
    'admin_received_date',
    'ro_received_date'
  ].indexOf(fieldName) !== -1;
}

/**
 * @param {string} fieldName
 * @return {boolean}
 */
function isBooleanField_(fieldName) {
  return [
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
  ].indexOf(fieldName) !== -1;
}
