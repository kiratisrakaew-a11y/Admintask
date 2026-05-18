/**
 * Source-to-master mapping configuration.
 * Do not scatter raw column positions across transformation code; add workbook exceptions here.
 */
const COLUMN_MAPPING = {
  IGNORED_SHEETS: ['#1 Scope Admin PUR ', 'FORM'],
  REFERENCE_SHEET: 'LIST',
  INCLUDE_LEGACY_SPECIAL_LICENSE: true,

  FIELD_MEANINGS: {
    source_sequence_no: 'ลำดับ / source sequence number',
    request_date: 'วันที่ส่ง / request date',
    company: 'บริษัท / company code',
    quotation_no: 'เลขที่ใบเสนอราคา / quotation number',
    lur_no: 'เลขที่ LUR / LUR number',
    quotation_or_lur_no: 'เลขที่ใบเสนอราคา QT. / LUR',
    pr_no: 'PR No.',
    supplier_name: 'บริษัท / Supplier',
    description: 'รายละเอียดงาน / work description',
    po_no: 'PO No.',
    invoice_no: 'เลขที่ใบแจ้งหนี้ / ใบกำกับภาษี / Memo No.',
    contract_period_raw: 'วันที่ระยะสัญญา / raw contract period',
    document_type: 'ประเภทเอกสาร / document type',
    request_cheque_date: 'วันที่ขอรับเช็ค / request cheque date',
    has_po_original: 'PO ต้นฉบับ / PO original flag',
    has_pr_original: 'PR ต้นฉบับ / PR original flag',
    has_pr_copy: 'PR สำเนา / PR copy flag',
    has_invoice_original: 'ใบแจ้งหนี้ ต้นฉบับ / invoice original flag',
    has_invoice_copy: 'ใบแจ้งหนี้ สำเนา / invoice copy flag',
    has_tax_invoice: 'ใบกำกับภาษี / tax invoice flag',
    has_delivery_note: 'ใบส่งสินค้า / delivery note flag',
    has_handover_doc: 'ใบส่งมอบงาน / handover document flag',
    has_handover_image: 'ภาพประกอบ / handover image flag',
    has_credit_note: 'ใบลดหนี้ / credit note flag',
    has_memo: 'Memo flag',
    department: 'แผนก / department code',
    submit_time: 'เวลาส่ง / submit time',
    duplicate_submit_time_unclear: 'เวลาส่ง duplicate / unclear submit time',
    sender_name: 'ผู้ส่ง / sender name',
    po_open_date: 'วันที่เปิด PO / PO open date',
    admin_received_date: 'วันที่รับ / admin received date',
    admin_received_time: 'เวลารับ / admin received time',
    admin_receiver_name: 'ผู้รับ / admin receiver name',
    ro_received_date: 'วันที่รับ RO / RO received date',
    remark: 'หมายเหตุ / remark'
  },

  REFERENCE_MAPPINGS: {
    company: {
      sheetName: 'LIST',
      startRow: 2,
      sourceColumns: {
        company: 'A',
        company_name: 'B'
      }
    },
    department: {
      sheetName: 'LIST',
      startRow: 2,
      sourceColumns: {
        department: 'D',
        department_name: 'E'
      }
    }
  },

  SOURCE_SHEETS: {
    'Jirarat (Mind)': {
      dataStartRow: 6,
      ownerName: 'Mind',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: {
        source_sequence_no: 'A',
        request_date: 'B',
        company: 'C',
        quotation_or_lur_no: 'D',
        pr_no: 'E',
        supplier_name: 'F',
        description: 'G',
        po_no: 'H',
        invoice_no: 'I',
        document_type: 'J',
        request_cheque_date: 'K',
        has_po_original: 'L',
        has_pr_original: 'M',
        has_invoice_original: 'N',
        has_invoice_copy: 'O',
        has_tax_invoice: 'P',
        has_credit_note: 'Q',
        has_memo: 'R',
        department: 'S',
        submit_time: 'T',
        sender_name: 'U',
        po_open_date: 'V',
        admin_received_time: 'W',
        admin_receiver_name: 'X',
        ro_received_date: 'Y',
        remark: 'Z'
      },
      notes: {
        quotation_or_lur_no: 'Map to lur_no when the value looks like LUR; otherwise map to quotation_no.'
      }
    },

    'Thithiworada (Mint) ': {
      dataStartRow: 6,
      ownerName: 'Mint',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: commonAeSourceColumns_('quotation_no')
    },

    'Athicha (Ruangkhaw) ': {
      dataStartRow: 6,
      ownerName: 'Ruangkhaw',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: Object.assign(commonAeSourceColumns_('quotation_no'), {
        admin_received_time: null,
        admin_receiver_name: 'AB',
        ro_received_date: 'AC',
        remark: 'AD'
      }),
      notes: {
        admin_received_time: 'No separate admin_received_time column was observed for this sheet.',
        remark: 'Used range may extend to AE, but observed mapped content ends at AD.'
      }
    },

    'Chutinan (Som) ': {
      dataStartRow: 6,
      ownerName: 'Som',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: commonAeSourceColumns_('quotation_no')
    },

    'Suwanna (Care)': {
      dataStartRow: 6,
      ownerName: 'Care',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: commonAeSourceColumns_('quotation_no'),
      notes: {
        usedRange: 'Workbook may report column AF, but observed mapped content ends at AE.'
      }
    },

    'Special License 2026': {
      dataStartRow: 6,
      ownerName: 'Special License',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: {
        source_sequence_no: 'A',
        request_date: 'B',
        company: 'C',
        quotation_no: 'D',
        pr_no: 'E',
        supplier_name: 'F',
        description: 'G',
        po_no: 'H',
        invoice_no: 'I',
        contract_period_raw: 'J',
        document_type: 'K',
        request_cheque_date: 'L',
        has_po_original: 'M',
        has_pr_original: 'N',
        has_pr_copy: 'O',
        has_invoice_original: 'P',
        has_invoice_copy: 'Q',
        has_tax_invoice: 'R',
        has_delivery_note: 'S',
        has_handover_doc: 'T',
        has_handover_image: 'U',
        has_credit_note: 'V',
        has_memo: 'W',
        department: 'X',
        submit_time: 'Y',
        duplicate_submit_time_unclear: 'Z',
        sender_name: 'AA',
        po_open_date: 'AB',
        admin_received_time: 'AC',
        admin_receiver_name: 'AD',
        ro_received_date: 'AE',
        remark: 'AF'
      },
      notes: {
        duplicate_submit_time_unclear: 'If non-blank and different from Y, preserve in validation_message.'
      }
    },

    'สัญญา': {
      dataStartRow: 6,
      ownerName: 'Contract',
      scopeRow: 1,
      mappingStatus: 'mapped',
      sourceColumns: commonAeSourceColumns_('lur_no')
    },

    'Special License': {
      dataStartRow: 5,
      ownerName: 'Special License Legacy',
      scopeRow: 1,
      mappingStatus: 'partially_mapped',
      legacy: true,
      sourceColumns: {
        source_sequence_no: 'A',
        request_date: 'B',
        pr_no: 'C',
        po_no: 'D',
        supplier_name: 'E',
        description: 'F',
        invoice_no: 'G',
        contract_period_raw: 'H',
        request_cheque_date: 'I',
        has_po_original: 'J',
        has_pr_original: 'K',
        has_pr_copy: 'L',
        has_invoice_original: 'M',
        has_invoice_copy: 'N',
        has_tax_invoice: 'O',
        has_delivery_note: 'P',
        has_handover_doc: 'Q',
        company: 'R',
        department: 'S',
        submit_time: 'T',
        sender_name: 'U',
        admin_received_date: 'V',
        admin_received_time: 'W',
        admin_receiver_name: 'X',
        ro_received_date: 'Y',
        remark: 'Z'
      },
      notes: {
        legacy: 'Mostly 2025 source; include by config and flag as legacy during transform.'
      }
    }
  }
};

/**
 * Shared A:AE mapping used by the common transaction sheets.
 * @param {string} dField Master field for source column D, normally quotation_no or lur_no.
 * @return {Object<string, string>}
 */
function commonAeSourceColumns_(dField) {
  const columns = {
    source_sequence_no: 'A',
    request_date: 'B',
    company: 'C',
    pr_no: 'E',
    supplier_name: 'F',
    description: 'G',
    po_no: 'H',
    invoice_no: 'I',
    contract_period_raw: 'J',
    document_type: 'K',
    request_cheque_date: 'L',
    has_po_original: 'M',
    has_pr_original: 'N',
    has_pr_copy: 'O',
    has_invoice_original: 'P',
    has_invoice_copy: 'Q',
    has_tax_invoice: 'R',
    has_delivery_note: 'S',
    has_handover_doc: 'T',
    has_handover_image: 'U',
    has_credit_note: 'V',
    has_memo: 'W',
    department: 'X',
    submit_time: 'Y',
    sender_name: 'Z',
    po_open_date: 'AA',
    admin_received_time: 'AB',
    admin_receiver_name: 'AC',
    ro_received_date: 'AD',
    remark: 'AE'
  };
  columns[dField] = 'D';
  return columns;
}
