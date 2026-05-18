/**
 * Shared deterministic helpers for procurement transformation.
 */

/**
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
function cleanText_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isBlank_(value) {
  return cleanText_(value) === '';
}

/**
 * @param {*} value
 * @return {boolean|string}
 */
function parseBooleanFlag_(value) {
  const text = cleanText_(value).toLowerCase();
  if (text === '') {
    return '';
  }
  if (value === true || text === 'true' || text === 'yes' || text === 'y' || text === '1' || text === '✓' || text === '✔') {
    return true;
  }
  if (value === false || text === 'false' || text === 'no' || text === 'n' || text === '0') {
    return false;
  }
  return text;
}

/**
 * @param {*} value
 * @return {{value: string, message: string}}
 */
function parseDateValue_(value) {
  if (value === null || value === undefined || value === '') {
    return {value: '', message: ''};
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return {value: Utilities.formatDate(value, PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd'), message: ''};
  }

  if (typeof value === 'number') {
    const serialDate = excelSerialDateToDate_(value);
    if (serialDate) {
      return {value: Utilities.formatDate(serialDate, PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd'), message: ''};
    }
    return {value: '', message: 'Invalid Excel serial date: ' + value};
  }

  const text = cleanText_(value);
  if (text === '') {
    return {value: '', message: ''};
  }

  const normalized = text.replace(/\./g, '/').replace(/-/g, '/');
  const parsed = parseDayMonthYearText_(normalized);
  if (parsed) {
    return {value: Utilities.formatDate(parsed, PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd'), message: ''};
  }

  return {value: text, message: 'Could not parse date confidently: ' + text};
}

/**
 * @param {number} serial
 * @return {Date|null}
 */
function excelSerialDateToDate_(serial) {
  if (serial < 1 || serial > 80000) {
    return null;
  }
  const utcMillis = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMillis);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * @param {string} text
 * @return {Date|null}
 */
function parseDayMonthYearText_(text) {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (year > 2400) {
    year -= 543;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * @param {string} rawPeriod
 * @return {{startDate: string, endDate: string, messages: string[]}}
 */
function parseContractPeriod_(rawPeriod) {
  const text = cleanText_(rawPeriod);
  if (text === '') {
    return {startDate: '', endDate: '', messages: []};
  }

  const compact = text.match(/^(\d{2})(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const start = parseDateValue_(compact[1] + '/' + compact[2] + '/' + compact[3]);
    const end = parseDateValue_(compact[4] + '/' + compact[5] + '/' + compact[6]);
    const messages = [];
    if (start.message) messages.push('contract_start_date: ' + start.message);
    if (end.message) messages.push('contract_end_date: ' + end.message);
    return {startDate: start.value, endDate: end.value, messages: messages};
  }

  const range = text.match(/^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*-\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})$/);
  if (range) {
    const startRange = parseDateValue_(range[1]);
    const endRange = parseDateValue_(range[2]);
    const rangeMessages = [];
    if (startRange.message) rangeMessages.push('contract_start_date: ' + startRange.message);
    if (endRange.message) rangeMessages.push('contract_end_date: ' + endRange.message);
    return {startDate: startRange.value, endDate: endRange.value, messages: rangeMessages};
  }

  return {startDate: '', endDate: '', messages: []};
}

/**
 * @param {Array<*>} values
 * @return {string}
 */
function hashValues_(values) {
  const normalized = values.map(function(value) { return cleanText_(value); }).join('\u001f');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized);
  return digest.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

/**
 * @param {string} dateText
 * @return {Date|null}
 */
function isoDateToDate_(dateText) {
  const text = cleanText_(dateText);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * @param {Date} date
 * @return {string}
 */
function formatDate_(date) {
  return Utilities.formatDate(date, PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * @return {string}
 */
function todayText_() {
  return Utilities.formatDate(new Date(), PROCUREMENT_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * @param {Date} date
 * @return {boolean}
 */
function isWeekend_(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * @param {Date} startDate
 * @param {number} businessDays
 * @return {Date}
 */
function addBusinessDays_(startDate, businessDays) {
  const date = new Date(startDate.getTime());
  let remaining = businessDays;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend_(date)) {
      remaining -= 1;
    }
  }
  return date;
}

/**
 * @param {Date} startDate
 * @param {Date} endDate
 * @return {number}
 */
function calendarDaysBetween_(startDate, endDate) {
  const millis = endDate.getTime() - startDate.getTime();
  return Math.floor(millis / 86400000);
}

/**
 * @param {Array<Object>} objects
 * @param {string[]} headers
 * @return {Array<Array<*>>}
 */
function objectsToRows_(objects, headers) {
  return objects.map(function(object) {
    return headers.map(function(header) {
      return object[header] === undefined || object[header] === null ? '' : object[header];
    });
  });
}
