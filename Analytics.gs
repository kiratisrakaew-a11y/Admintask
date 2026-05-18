/**
 * Builds ADMIN_WORKLOAD_ANALYTICS rows from MASTER_PR_APPROVED rows.
 * @param {Array<Object>} masterRows
 * @return {Array<Object>}
 */
function buildAdminWorkloadAnalytics_(masterRows) {
  return masterRows.map(function(masterRow) {
    const processStage = deriveProcessStage_(masterRow);
    const taskStatus = deriveTaskStatus_(masterRow);
    const requestDate = isoDateToDate_(masterRow.request_date);
    const completedDate = isoDateToDate_(masterRow.ro_received_date);
    const today = isoDateToDate_(todayText_());
    const slaDays = PROCUREMENT_CONFIG.SLA_DAYS[processStage] || PROCUREMENT_CONFIG.SLA_DAYS.unknown;
    const slaDueDate = requestDate ? addBusinessDays_(requestDate, slaDays) : null;
    const agingDays = deriveAgingDays_(requestDate, completedDate, today);
    const slaStatus = deriveSlaStatus_(requestDate, completedDate, today, slaDueDate);
    const workloadWeight = deriveWorkloadWeight_(masterRow, processStage);
    const priorityScore = derivePriorityScore_(slaStatus, workloadWeight, agingDays);

    return {
      record_id: masterRow.record_id,
      source_sheet_name: masterRow.source_sheet_name,
      source_row_no: masterRow.source_row_no,
      admin_owner: masterRow.source_owner_name,
      company: masterRow.company,
      pr_no: masterRow.pr_no,
      po_no: masterRow.po_no,
      supplier_name: masterRow.supplier_name,
      description: masterRow.description,
      department: masterRow.department,
      requestor: masterRow.requestor,
      sender_name: masterRow.sender_name,
      request_date: masterRow.request_date,
      submit_time: masterRow.submit_time,
      po_open_date: masterRow.po_open_date,
      admin_received_date: masterRow.admin_received_date,
      admin_receiver_name: masterRow.admin_receiver_name,
      ro_received_date: masterRow.ro_received_date,
      document_type: masterRow.document_type,
      process_stage: processStage,
      task_status: taskStatus,
      aging_days: agingDays === null ? '' : agingDays,
      sla_days: slaDays,
      sla_due_date: slaDueDate ? formatDate_(slaDueDate) : '',
      sla_status: slaStatus,
      workload_weight: workloadWeight,
      priority_score: priorityScore,
      assignment_reason: 'Default owner from source sheet: ' + masterRow.source_sheet_name,
      validation_status: masterRow.validation_status,
      validation_message: masterRow.validation_message,
      remark: masterRow.remark
    };
  });
}

/**
 * @param {Object} row
 * @return {string}
 */
function deriveProcessStage_(row) {
  if (row.source_sheet_name === 'สัญญา' || cleanText_(row.contract_period_raw) !== '') {
    return 'contract';
  }
  if (row.source_sheet_name.indexOf('Special License') !== -1) {
    return 'special_license';
  }
  if (hasInvoiceRelatedData_(row)) {
    return 'invoice_or_billing';
  }
  if (cleanText_(row.pr_no) !== '') {
    return 'open_po';
  }
  return 'unknown';
}

/**
 * @param {Object} row
 * @return {string}
 */
function deriveTaskStatus_(row) {
  if (cleanText_(row.request_date) === '' || !isoDateToDate_(row.request_date)) {
    return 'manual_review';
  }
  if (cleanText_(row.ro_received_date) !== '' && !isoDateToDate_(row.ro_received_date)) {
    return 'manual_review';
  }
  if (cleanText_(row.po_open_date) !== '' && !isoDateToDate_(row.po_open_date)) {
    return 'manual_review';
  }
  if (cleanText_(row.admin_received_date) !== '' && !isoDateToDate_(row.admin_received_date)) {
    return 'manual_review';
  }
  if (cleanText_(row.ro_received_date) !== '') {
    return 'completed';
  }
  if (cleanText_(row.po_open_date) !== '' || cleanText_(row.admin_received_date) !== '' || cleanText_(row.admin_receiver_name) !== '') {
    return 'in_progress';
  }
  return 'pending';
}

/**
 * @param {Date|null} requestDate
 * @param {Date|null} completedDate
 * @param {Date|null} today
 * @return {number|null}
 */
function deriveAgingDays_(requestDate, completedDate, today) {
  if (!requestDate) {
    return null;
  }
  return calendarDaysBetween_(requestDate, completedDate || today);
}

/**
 * @param {Date|null} requestDate
 * @param {Date|null} completedDate
 * @param {Date|null} today
 * @param {Date|null} slaDueDate
 * @return {string}
 */
function deriveSlaStatus_(requestDate, completedDate, today, slaDueDate) {
  if (!requestDate || !slaDueDate) {
    return 'unknown';
  }
  if (completedDate) {
    return completedDate.getTime() > slaDueDate.getTime() ? 'completed_late' : 'on_time';
  }
  if (today.getTime() > slaDueDate.getTime()) {
    return 'overdue';
  }
  const daysUntilDue = calendarDaysBetween_(today, slaDueDate);
  if (daysUntilDue <= 1) {
    return 'near_due';
  }
  return 'on_time';
}

/**
 * @param {Object} row
 * @param {string} processStage
 * @return {number}
 */
function deriveWorkloadWeight_(row, processStage) {
  let weight = 1;
  if (processStage === 'contract') {
    weight += 1;
  }
  if (processStage === 'special_license') {
    weight += 1;
  }
  if (hasInvoiceRelatedData_(row)) {
    weight += 0.5;
  }
  if (cleanText_(row.pr_no) !== '' && cleanText_(row.po_no) !== '' && cleanText_(row.invoice_no) !== '') {
    weight += 0.5;
  }
  return Math.min(weight, 3);
}

/**
 * @param {string} slaStatus
 * @param {number} workloadWeight
 * @param {number|null} agingDays
 * @return {number}
 */
function derivePriorityScore_(slaStatus, workloadWeight, agingDays) {
  let score = workloadWeight * 10;
  if (slaStatus === 'overdue') {
    score += 50;
  }
  if (slaStatus === 'near_due') {
    score += 20;
  }
  if (agingDays !== null && agingDays > 0) {
    score += agingDays;
  }
  return score;
}

/**
 * @param {Object} row
 * @return {boolean}
 */
function hasInvoiceRelatedData_(row) {
  return cleanText_(row.invoice_no) !== '' ||
    cleanText_(row.tax_invoice_no) !== '' ||
    cleanText_(row.memo_no) !== '' ||
    row.has_invoice_original === true ||
    row.has_invoice_copy === true ||
    row.has_tax_invoice === true ||
    row.has_credit_note === true ||
    row.has_memo === true;
}
