/**
 * Applies row-level validation and duplicate PR warnings, then builds issue rows.
 * @param {Array<Object>} masterRows
 * @return {{masterRows: Array<Object>, issues: Array<Object>}}
 */
function validateMasterRows_(masterRows) {
  const prCounts = countPrNumbers_(masterRows);
  const issues = [];

  masterRows.forEach(function(row) {
    const rowIssues = collectValidationIssues_(row, prCounts);
    const existingMessage = cleanText_(row.validation_message);
    const issueMessages = rowIssues.map(function(issue) { return issue.message; });
    const allMessages = existingMessage ? [existingMessage].concat(issueMessages) : issueMessages;

    row.validation_message = allMessages.join(' | ');
    row.validation_status = deriveValidationStatus_(row.validation_status, rowIssues);

    rowIssues.forEach(function(issue, index) {
      issues.push(createDataQualityIssue_(row, issue, index + 1));
    });

    if (existingMessage) {
      issues.push(createDataQualityIssue_(row, {
        fieldName: 'validation_message',
        issueType: 'transform_warning',
        severity: row.validation_status === 'pass' ? 'warning' : row.validation_status,
        message: existingMessage,
        rawValue: ''
      }, rowIssues.length + 1));
    }
  });

  return {masterRows: masterRows, issues: issues};
}

/**
 * @param {Array<Object>} masterRows
 * @return {Object<string, number>}
 */
function countPrNumbers_(masterRows) {
  return masterRows.reduce(function(counts, row) {
    const prNo = cleanText_(row.pr_no);
    if (prNo !== '') {
      counts[prNo] = (counts[prNo] || 0) + 1;
    }
    return counts;
  }, {});
}

/**
 * @param {Object} row
 * @param {Object<string, number>} prCounts
 * @return {Array<Object>}
 */
function collectValidationIssues_(row, prCounts) {
  const issues = [];

  if (cleanText_(row.pr_no) === '' && !isInvoiceOnlyRow_(row)) {
    issues.push(validationIssue_('pr_no', 'missing_required_value', 'warning', 'Missing PR No.', row.pr_no));
  }
  if (cleanText_(row.supplier_name) === '') {
    issues.push(validationIssue_('supplier_name', 'missing_required_value', 'warning', 'Missing supplier name.', row.supplier_name));
  }
  if (cleanText_(row.description) === '') {
    issues.push(validationIssue_('description', 'missing_required_value', 'warning', 'Missing description.', row.description));
  }
  if (cleanText_(row.department) === '') {
    issues.push(validationIssue_('department', 'missing_required_value', 'warning', 'Missing department.', row.department));
  }
  if (cleanText_(row.company) !== '' && cleanText_(row.company_name) === '') {
    issues.push(validationIssue_('company', 'lookup_not_found', 'warning', 'Company code not found in LIST: ' + row.company, row.company));
  }
  if (cleanText_(row.department) !== '' && cleanText_(row.department_name) === '') {
    issues.push(validationIssue_('department', 'lookup_not_found', 'warning', 'Department code not found in LIST: ' + row.department, row.department));
  }
  if (cleanText_(row.pr_no) !== '' && prCounts[row.pr_no] > 1) {
    issues.push(validationIssue_('pr_no', 'duplicate_pr', 'warning', 'Duplicate PR No. appears ' + prCounts[row.pr_no] + ' times.', row.pr_no));
  }

  return issues;
}

/**
 * @param {Object} row
 * @return {boolean}
 */
function isInvoiceOnlyRow_(row) {
  return cleanText_(row.pr_no) === '' && (
    cleanText_(row.invoice_no) !== '' ||
    cleanText_(row.tax_invoice_no) !== '' ||
    cleanText_(row.memo_no) !== '' ||
    row.has_invoice_original === true ||
    row.has_invoice_copy === true ||
    row.has_tax_invoice === true ||
    row.has_credit_note === true ||
    row.has_memo === true
  );
}

/**
 * @param {string} fieldName
 * @param {string} issueType
 * @param {string} severity
 * @param {string} message
 * @param {*} rawValue
 * @return {Object}
 */
function validationIssue_(fieldName, issueType, severity, message, rawValue) {
  return {
    fieldName: fieldName,
    issueType: issueType,
    severity: severity,
    message: message,
    rawValue: cleanText_(rawValue)
  };
}

/**
 * @param {string} currentStatus
 * @param {Array<Object>} issues
 * @return {string}
 */
function deriveValidationStatus_(currentStatus, issues) {
  if (issues.some(function(issue) { return issue.severity === 'error'; })) {
    return 'error';
  }
  if (issues.some(function(issue) { return issue.severity === 'manual_review'; }) || currentStatus === 'manual_review') {
    return 'manual_review';
  }
  if (issues.length > 0 || currentStatus === 'warning') {
    return 'warning';
  }
  return 'pass';
}

/**
 * @param {Object} row
 * @param {Object} issue
 * @param {number} issueNumber
 * @return {Object}
 */
function createDataQualityIssue_(row, issue, issueNumber) {
  return {
    issue_id: row.record_id + '::ISSUE::' + issueNumber,
    record_id: row.record_id,
    source_sheet_name: row.source_sheet_name,
    source_row_no: row.source_row_no,
    field_name: issue.fieldName,
    issue_type: issue.issueType,
    severity: issue.severity,
    message: issue.message,
    raw_value: issue.rawValue,
    load_batch_id: row.load_batch_id,
    detected_at: row.loaded_at
  };
}
