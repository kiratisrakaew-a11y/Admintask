# AGENTS.md

## Project: Procurement Source Data to Google Sheets Master Database

This repository is for building a Google Sheets + Apps Script data pipeline that converts the Y2026 procurement tracking workbook into clean master tables for search, monitoring, and admin workload analytics.

The current source workbook inspected in this chat is `Y2026.xlsx`. The user may refer to it as `Y2026.xlsm`; treat both names as the same business source if the sheet structure matches.

---

## 1. Primary Objective

Build an Apps Script solution inside Google Sheets that reads raw procurement tracking sheets and produces normalized master data tables.

The solution must support:

1. Combining multiple raw source sheets into one central schema.
2. Preserving source traceability back to original sheet and row.
3. Creating a PR-approved style master table similar to the ERP screen columns:
   - Company
   - PR
   - Supplier Name
   - Description
   - Account Name
   - AccountCode
   - Request Date
   - Due Date
   - ApproveStatus
   - Requestor
   - Department
   - SubTotal
   - VAT
   - Total
   - PB Number
4. Creating an admin workload analytics layer for assigning and monitoring Admin/PUR work.
5. Performing basic data quality validation such as missing PR, missing supplier, missing department, duplicate PR, and date parsing issues.

Do not build a web app UI unless the user explicitly asks for it later.

---

## 2. Non-Negotiable Rules for Codex

1. Do not modify raw source sheets.
   - Raw sheets are the source of truth.
   - All derived outputs must be written to new generated sheets.

2. Do not delete notes, remarks, or unclear text.
   - If a value cannot be parsed or mapped, keep the original value in a raw field or validation message.

3. Do not use PR No. as the only unique key.
   - PR can be duplicated across rows, invoices, sheets, or document rounds.
   - Use `source_sheet_name + source_row_no` as the reliable source key.

4. Do not hard-code business logic across scattered functions.
   - All raw-to-master column mapping must be kept in one configuration object.

5. Use Apps Script batch operations.
   - Use `getValues()` and `setValues()` in bulk.
   - Do not read/write cells one by one in loops except for small config or formatting tasks.

6. Do not rely on LLM/Gemini for core transformation in Phase 1.
   - Phase 1 must be deterministic rule-based Apps Script.
   - If a field cannot be interpreted, mark it for manual review.

7. Do not call external APIs unless the user explicitly asks.

8. Output sheets may be cleared and rebuilt during refresh.
   - Raw sheets must never be cleared.

9. Keep formulas minimal in generated master sheets.
   - Prefer Apps Script-computed values for stable refresh.
   - Use formulas only where specifically beneficial.

10. Use timezone `Asia/Bangkok` for dates and batch timestamps.

---

## 3. Source Workbook Structure

### 3.1 Sheets in the source file

The source workbook contains these sheets:

| Sheet Name | Role | Use in Pipeline |
|---|---|---|
| `#1 Scope Admin PUR ` | Instruction / scope sheet | Read only for documentation; do not import as transaction data |
| `Jirarat (Mind)` | Transaction source | Import |
| `Thithiworada (Mint) ` | Transaction source | Import |
| `Athicha (Ruangkhaw) ` | Transaction source | Import |
| `Chutinan (Som) ` | Transaction source | Import |
| `Suwanna (Care)` | Transaction source | Import |
| `Special License 2026` | Transaction source | Import |
| `สัญญา` | Contract transaction source | Import |
| `Special License` | Older special license transaction source, mostly 2025 | Import only if configured; default may include but flag as old/source legacy |
| `FORM` | Blank template | Ignore |
| `LIST` | Reference list for company and department codes | Import as reference lookup |

### 3.2 Header and data row rules

Most transaction sheets use multi-row headers.

| Sheet Group | Header Rows | Data Start Row |
|---|---:|---:|
| `Jirarat (Mind)` | 3 to 5 | 6 |
| `Thithiworada (Mint) ` | 3 to 5 | 6 |
| `Athicha (Ruangkhaw) ` | 3 to 5 | 6 |
| `Chutinan (Som) ` | 3 to 5 | 6 |
| `Suwanna (Care)` | 3 to 5 | 6 |
| `Special License 2026` | 3 to 5 | 6 |
| `สัญญา` | 3 to 5 | 6 |
| `Special License` | 2 to 4 | 5 |
| `FORM` | 3 to 5 | Ignore as template |

Rows should be imported only when the row has meaningful data, not just a sequence number or default unchecked checkboxes.

---

## 4. Generated Sheets Required

The Apps Script project must create or refresh these generated sheets:

| Output Sheet | Purpose |
|---|---|
| `MASTER_PR_APPROVED` | Main normalized PR/procurement master table |
| `ADMIN_WORKLOAD_ANALYTICS` | Derived workload allocation and SLA analysis table |
| `DATA_QUALITY_ISSUES` | Rows requiring review |
| `SOURCE_MAPPING` | Human-readable mapping from source columns to master fields |
| `REF_COMPANY` | Company reference from `LIST` sheet |
| `REF_DEPARTMENT` | Department reference from `LIST` sheet |
| `RUN_LOG` | Refresh timestamp, row counts, errors, and status |

Generated sheet names should be constants in one config section.

---

## 5. Central Schema: `MASTER_PR_APPROVED`

Create the master table with these headers in this exact order.

```text
record_id
source_file_name
source_sheet_name
source_row_no
source_sequence_no
source_owner_name
source_scope_text
load_batch_id
loaded_at
raw_row_hash

company
company_name
pr_no
supplier_name
description
account_name
account_code
request_date
due_date
approve_status
requestor
department
department_name
subtotal
vat
total
pb_number

quotation_no
lur_no
po_no
invoice_no
tax_invoice_no
memo_no
contract_period_raw
contract_start_date
contract_end_date
document_type
request_cheque_date

has_po_original
has_pr_original
has_pr_copy
has_invoice_original
has_invoice_copy
has_tax_invoice
has_delivery_note
has_handover_doc
has_handover_image
has_credit_note
has_memo

submit_time
sender_name
po_open_date
admin_received_date
admin_received_time
admin_receiver_name
ro_received_date
remark

mapping_status
validation_status
validation_message
```

### Field intent

- `record_id`: Unique generated row ID. Recommended format: `SRC::<source_sheet_name>::ROW::<source_row_no>`.
- `raw_row_hash`: Hash of normalized raw row values, used to detect changes.
- `company`: Company code from raw sheet, such as PB, AQA, PBE.
- `company_name`: Lookup from `LIST` sheet where available.
- `supplier_name`: Raw vendor / supplier / counterparty name.
- `description`: Work description. Never truncate.
- `account_name`, `account_code`, `subtotal`, `vat`, `total`: Expected from ERP PR-approved data if available. In current workbook these may be blank.
- `due_date`: If not present in raw source, compute from SLA rule in the analytics layer or leave blank in master.
- `approve_status`: If not present in raw source, default to blank or `unknown`, not `Approved`.
- `pb_number`: Optional reference number from ERP or PB Number if available.
- `mapping_status`: `mapped`, `partially_mapped`, `manual_review_required`.
- `validation_status`: `pass`, `warning`, `error`, `manual_review`.

---

## 6. Analytics Schema: `ADMIN_WORKLOAD_ANALYTICS`

Create this sheet from `MASTER_PR_APPROVED`, not directly from raw sheets.

Headers in exact order:

```text
record_id
source_sheet_name
source_row_no
admin_owner
company
pr_no
po_no
supplier_name
description
department
requestor
sender_name
request_date
submit_time
po_open_date
admin_received_date
admin_receiver_name
ro_received_date
document_type
process_stage
task_status
aging_days
sla_days
sla_due_date
sla_status
workload_weight
priority_score
assignment_reason
validation_status
validation_message
remark
```

### Suggested derivation rules

`admin_owner`
- Default from the source sheet owner:
  - `Jirarat (Mind)` -> `Mind`
  - `Thithiworada (Mint) ` -> `Mint`
  - `Athicha (Ruangkhaw) ` -> `Ruangkhaw`
  - `Chutinan (Som) ` -> `Som`
  - `Suwanna (Care)` -> `Care`
  - `Special License 2026` -> `Special License`
  - `สัญญา` -> `Contract`
  - `Special License` -> `Special License Legacy`

`process_stage`
- `contract` if source sheet is `สัญญา` or `contract_period_raw` is not blank.
- `special_license` if source sheet contains `Special License`.
- `invoice_or_billing` if invoice, tax invoice, credit note, or memo fields/flags exist.
- `open_po` if PR exists and invoice-related fields are blank.
- `unknown` if unclear.

`task_status`
- `completed` if `ro_received_date` is present.
- `in_progress` if `po_open_date`, `admin_received_date`, or `admin_receiver_name` is present but `ro_received_date` is blank.
- `pending` if `request_date` is present but no admin processing date/receiver exists.
- `manual_review` if key dates are invalid or missing.

`aging_days`
- If completed: `ro_received_date - request_date`.
- If not completed: `today - request_date`.
- If `request_date` is invalid or blank, leave blank and mark validation warning.

`sla_days`
- Recommended configurable defaults:
  - `open_po`: 3 business days
  - `invoice_or_billing`: 2 business days
  - `contract`: 7 business days
  - `special_license`: 7 business days
  - `unknown`: 3 business days

`sla_status`
- `on_time` if completed within SLA or still before SLA due date.
- `near_due` if due within 1 business day.
- `overdue` if today is later than SLA due date and not completed.
- `completed_late` if completed after SLA due date.
- `unknown` if request date is invalid.

`workload_weight`
- Base = 1.
- Add 1 if `process_stage` is `contract`.
- Add 1 if `process_stage` is `special_license`.
- Add 0.5 if invoice-related fields/flags are present.
- Add 0.5 if both PR and PO exist and invoice exists.
- Cap at 3 unless the user later defines a more detailed scoring model.

`priority_score`
- Suggested formula:
  - overdue = +50
  - near_due = +20
  - workload_weight * 10
  - aging_days * 1
  - if `total` exists and is high, add configurable amount weight later
- For Phase 1, do not over-engineer priority scoring.

---

## 7. Source-to-Master Column Mapping

All column positions below are based on the inspected workbook. Keep these mappings in one `COLUMN_MAPPING` object in Apps Script.

### 7.1 Common mapping for `Thithiworada (Mint) `, `Chutinan (Som) `, `Suwanna (Care)`, and `สัญญา`

| Source Column | Meaning | Master Field |
|---|---|---|
| A | ลำดับ | `source_sequence_no` |
| B | วันที่ส่ง | `request_date` |
| C | บริษัท | `company` |
| D | เลขที่ใบเสนอราคา / LUR | `quotation_no` or `lur_no` depending on sheet |
| E | PR No. | `pr_no` |
| F | บริษัท / Supplier | `supplier_name` |
| G | รายละเอียดงาน | `description` |
| H | PO No. | `po_no` |
| I | เลขที่ใบแจ้งหนี้ / ใบกำกับภาษี / Memo No. | `invoice_no` or `tax_invoice_no` or `memo_no`; keep original in `invoice_no` if unsure |
| J | วันที่ระยะสัญญา | `contract_period_raw` |
| K | ประเภทเอกสาร | `document_type` |
| L | วันที่ขอรับเช็ค | `request_cheque_date` |
| M | PO ต้นฉบับ | `has_po_original` |
| N | PR ต้นฉบับ | `has_pr_original` |
| O | PR สำเนา | `has_pr_copy` |
| P | ใบแจ้งหนี้ ต้นฉบับ | `has_invoice_original` |
| Q | ใบแจ้งหนี้ สำเนา | `has_invoice_copy` |
| R | ใบกำกับภาษี | `has_tax_invoice` |
| S | ใบส่งสินค้า | `has_delivery_note` |
| T | ใบส่งมอบงาน | `has_handover_doc` |
| U | ภาพประกอบ | `has_handover_image` |
| V | ใบลดหนี้ | `has_credit_note` |
| W | Memo | `has_memo` |
| X | แผนก | `department` |
| Y | เวลาส่ง | `submit_time` |
| Z | ผู้ส่ง | `sender_name` |
| AA | วันที่เปิด PO | `po_open_date` |
| AB | เวลารับ | `admin_received_time` |
| AC | ผู้รับ | `admin_receiver_name` |
| AD | วันที่รับ RO | `ro_received_date` |
| AE | หมายเหตุ | `remark` |

For sheet `สัญญา`, column D is `เลขที่ LUR`, so map D to `lur_no`, not `quotation_no`.

### 7.2 `Athicha (Ruangkhaw) ` exception

This sheet is mostly common, but after column AA it differs:

| Source Column | Meaning | Master Field |
|---|---|---|
| AA | วันที่เปิด PO | `po_open_date` |
| AB | ผู้รับ | `admin_receiver_name` |
| AC | วันที่รับ RO | `ro_received_date` |
| AD | หมายเหตุ | `remark` |

There is no separate `admin_received_time` column in this sheet based on the inspected header.

### 7.3 `Special License 2026` exception

This sheet has 32 columns and differs around submit/receiver fields:

| Source Column | Meaning | Master Field |
|---|---|---|
| A | ลำดับ | `source_sequence_no` |
| B | วันที่ส่ง | `request_date` |
| C | บริษัท | `company` |
| D | เลขที่ใบเสนอราคา | `quotation_no` |
| E | PR No. | `pr_no` |
| F | บริษัท / Supplier | `supplier_name` |
| G | รายละเอียดงาน | `description` |
| H | PO No. | `po_no` |
| I | เลขที่ใบแจ้งหนี้ / ใบกำกับภาษี / Memo No. | `invoice_no` |
| J | วันที่ระยะสัญญา | `contract_period_raw` |
| K | ประเภทเอกสาร | `document_type` |
| L | วันที่ขอรับเช็ค | `request_cheque_date` |
| M | PO ต้นฉบับ | `has_po_original` |
| N | PR ต้นฉบับ | `has_pr_original` |
| O | PR สำเนา | `has_pr_copy` |
| P | ใบแจ้งหนี้ ต้นฉบับ | `has_invoice_original` |
| Q | ใบแจ้งหนี้ สำเนา | `has_invoice_copy` |
| R | ใบกำกับภาษี | `has_tax_invoice` |
| S | ใบส่งสินค้า | `has_delivery_note` |
| T | ใบส่งมอบงาน | `has_handover_doc` |
| U | ภาพประกอบ | `has_handover_image` |
| V | ใบลดหนี้ | `has_credit_note` |
| W | Memo | `has_memo` |
| X | แผนก | `department` |
| Y | เวลาส่ง | `submit_time` |
| Z | เวลาส่ง duplicate / unclear | Keep in `validation_message` if not blank and different from Y |
| AA | ผู้ส่ง | `sender_name` |
| AB | วันที่เปิด PO | `po_open_date` |
| AC | เวลารับ | `admin_received_time` |
| AD | ผู้รับ | `admin_receiver_name` |
| AE | วันที่รับ RO | `ro_received_date` |
| AF | หมายเหตุ | `remark` |

### 7.4 `Jirarat (Mind)` mapping

This sheet has a slightly different structure. Map as follows:

| Source Column | Meaning | Master Field |
|---|---|---|
| A | ลำดับ | `source_sequence_no` |
| B | วันที่ส่ง | `request_date` |
| C | บริษัท | `company` |
| D | เลขที่ใบเสนอราคา QT. / LUR | `quotation_no` or `lur_no` if value looks like LUR |
| E | PR No. | `pr_no` |
| F | บริษัท / Supplier | `supplier_name` |
| G | รายละเอียดงาน | `description` |
| H | PO No. based on observed data | `po_no` |
| I | Invoice No. based on observed data | `invoice_no` |
| J | Document type / paper note based on observed data | `document_type` |
| K | วันที่ขอรับเช็ค | `request_cheque_date` |
| L | PO ต้นฉบับ | `has_po_original` |
| M | PR | `has_pr_original` |
| N | ใบแจ้งหนี้ ต้นฉบับ | `has_invoice_original` |
| O | สำเนา | `has_invoice_copy` |
| P | ใบกำกับภาษี | `has_tax_invoice` |
| Q | ใบลดหนี้ | `has_credit_note` |
| R | MEMO | `has_memo` |
| S | แผนก | `department` |
| T | เวลาส่ง | `submit_time` |
| U | ผู้ส่ง | `sender_name` |
| V | วันที่เปิด PO | `po_open_date` |
| W | เวลารับ | `admin_received_time` |
| X | ผู้รับ | `admin_receiver_name` |
| Y | วันที่รับ RO | `ro_received_date` |
| Z | หมายเหตุ | `remark` |

### 7.5 Legacy `Special License` mapping

The older `Special License` sheet starts data at row 5 and uses different columns.

| Source Column | Meaning | Master Field |
|---|---|---|
| A | ลำดับ | `source_sequence_no` |
| B | วันที่ส่ง | `request_date` |
| C | PR No. | `pr_no` |
| D | PO No. | `po_no` |
| E | บริษัท / Supplier | `supplier_name` |
| F | รายละเอียดงาน | `description` |
| G | เลขที่ใบแจ้งหนี้ / ใบกำกับภาษี | `invoice_no` |
| H | วันที่ระยะสัญญา | `contract_period_raw` |
| I | วันที่ขอรับเช็ค | `request_cheque_date` |
| J | PO ต้นฉบับ | `has_po_original` |
| K | PR ต้นฉบับ | `has_pr_original` |
| L | PR สำเนา | `has_pr_copy` |
| M | ใบแจ้งหนี้ ต้นฉบับ | `has_invoice_original` |
| N | ใบแจ้งหนี้ สำเนา | `has_invoice_copy` |
| O | ใบกำกับภาษี | `has_tax_invoice` |
| P | ใบส่งสินค้า | `has_delivery_note` |
| Q | ใบส่งมอบงาน | `has_handover_doc` |
| R | ชื่อบริษัท / Company code | `company` |
| S | แผนก | `department` |
| T | เวลาส่ง | `submit_time` |
| U | ผู้ส่ง | `sender_name` |
| V | วันที่รับ | `admin_received_date` |
| W | เวลารับ | `admin_received_time` |
| X | ผู้รับ | `admin_receiver_name` |
| Y | วันที่รับ RO | `ro_received_date` |
| Z | หมายเหตุ | `remark` |

---

## 8. Reference Sheet Mapping: `LIST`

Use the `LIST` sheet to build lookup tables.

### Company lookup

| Source Column | Meaning | Output Sheet / Field |
|---|---|---|
| A | Company code | `REF_COMPANY.company` |
| B | Company name | `REF_COMPANY.company_name` |

### Department lookup

| Source Column | Meaning | Output Sheet / Field |
|---|---|---|
| D | Department code | `REF_DEPARTMENT.department` |
| E | Department name | `REF_DEPARTMENT.department_name` |

Do not fail the import if a code is not found. Keep the code and leave the full name blank, then mark as warning if needed.

---

## 9. Date and Time Handling

Raw dates may appear as:

- Google/Excel date objects
- Excel serial values
- Thai/European text dates such as `31/01.2025`
- Compact contract periods such as `010126-311228`
- Date ranges such as `01/01/2026-31/12/2026`
- Invalid values that look like dates but are not real dates

Rules:

1. Preserve the original raw value when parsing fails.
2. Do not guess silently.
3. If only a contract range exists, keep the full text in `contract_period_raw` and attempt to parse `contract_start_date` and `contract_end_date` only when confidence is high.
4. Use `Utilities.formatDate(date, 'Asia/Bangkok', 'yyyy-MM-dd')` for standardized dates.
5. Put parse failures in `validation_message`.

---

## 10. Validation Rules

For each master row, set validation fields.

### Required checks

- Missing PR:
  - `pr_no` blank -> warning, unless the row clearly represents invoice-only data.

- Missing supplier:
  - `supplier_name` blank -> warning.

- Missing description:
  - `description` blank -> warning.

- Missing department:
  - `department` blank -> warning.

- Duplicate PR:
  - Do not treat duplicate PR as an error by default.
  - Mark as warning with duplicate count.
  - PR may legitimately repeat across invoice rounds.

- Invalid date:
  - Mark warning or manual review.

- Unmapped field:
  - If a source row contains important text in a column not mapped, keep it in `remark` or `validation_message`.

### Validation status values

Use only these values:

```text
pass
warning
error
manual_review
```

### Mapping status values

Use only these values:

```text
mapped
partially_mapped
manual_review_required
```

---

## 11. Apps Script Architecture

Create a modular Apps Script project using this structure.

```text
Code.gs
Config.gs
Mapping.gs
Extract.gs
Transform.gs
Analytics.gs
Validation.gs
Reference.gs
Utils.gs
```

### File responsibilities

`Code.gs`
- Entry points and menu setup.
- Functions:
  - `onOpen()`
  - `refreshProcurementMaster()`
  - `refreshReferences()`

`Config.gs`
- Sheet names, schema headers, SLA config, timezone, source file assumptions.

`Mapping.gs`
- All source-to-master column mappings.
- No transformation logic outside simple mapping constants.

`Extract.gs`
- Reads source sheets via `getValues()`.
- Skips ignored sheets.
- Skips blank/template rows.

`Transform.gs`
- Converts raw rows into `MASTER_PR_APPROVED` rows.
- Applies date parsing, boolean parsing, text cleanup, owner extraction, hash generation.

`Analytics.gs`
- Builds `ADMIN_WORKLOAD_ANALYTICS` from master rows.
- Computes process stage, task status, SLA, workload weight, and priority score.

`Validation.gs`
- Performs row-level validation and duplicate checks.
- Builds `DATA_QUALITY_ISSUES`.

`Reference.gs`
- Reads `LIST` and builds company/department reference maps.

`Utils.gs`
- Helpers for date parsing, string cleanup, hash, sheet creation, safe value conversion.

---

## 12. Required Entry Points

Implement these functions:

```javascript
function onOpen() {}
function refreshProcurementMaster() {}
function refreshReferences() {}
function rebuildAllGeneratedSheets() {}
```

The menu should be named:

```text
Procurement Master
```

Menu items:

```text
Refresh References
Refresh Master Data
Rebuild All Generated Sheets
```

---

## 13. Refresh Behavior

When `refreshProcurementMaster()` runs:

1. Acquire a `LockService` lock.
2. Generate `load_batch_id` using timestamp.
3. Read reference data from `LIST`.
4. Read transaction source sheets.
5. Transform rows into `MASTER_PR_APPROVED` schema.
6. Validate rows.
7. Write the master table in one batch.
8. Build `ADMIN_WORKLOAD_ANALYTICS` in one batch.
9. Build `DATA_QUALITY_ISSUES` in one batch.
10. Write a `RUN_LOG` entry.
11. Release lock.

Generated sheets can be cleared and rebuilt. Raw sheets must not be modified.

---

## 14. Coding Standards

1. Use `const` wherever possible.
2. Keep functions small and named by purpose.
3. Avoid nested logic jungles.
4. Use explicit field names, not magic array numbers outside the mapping config.
5. Use `console.log()` for logs, but also write summary to `RUN_LOG`.
6. Use defensive parsing.
7. Do not throw fatal errors for one bad row. Capture the issue and continue.
8. Do not silently discard source rows.
9. Do not introduce npm, clasp-only dependencies, or external JS libraries for Phase 1.

---

## 15. Suggested Implementation Milestones

### Milestone 1: Scaffold and Config

Deliver:
- `Config.gs`
- `Mapping.gs`
- Output sheet headers
- Custom menu

Acceptance:
- Menu appears in Google Sheets.
- Generated sheets can be created with correct headers.

### Milestone 2: Reference Import

Deliver:
- Read `LIST` sheet.
- Generate `REF_COMPANY` and `REF_DEPARTMENT`.

Acceptance:
- Company and department reference sheets match `LIST` data.

### Milestone 3: Raw Extraction

Deliver:
- Read all included transaction sheets.
- Skip instruction/template sheets.
- Skip blank rows.
- Preserve source sheet and row number.

Acceptance:
- Row count in run log is reasonable by source sheet.
- No raw sheet is changed.

### Milestone 4: Master Transformation

Deliver:
- Build `MASTER_PR_APPROVED` with exact schema.
- Apply source-specific mappings.
- Parse dates and booleans safely.

Acceptance:
- Master sheet has one normalized row per valid source row.
- Key fields such as PR, supplier, description, department, and source row are populated.

### Milestone 5: Validation

Deliver:
- Missing field checks.
- Duplicate PR warnings.
- Date parse warnings.
- `DATA_QUALITY_ISSUES` sheet.

Acceptance:
- Bad rows are flagged but do not stop refresh.

### Milestone 6: Admin Workload Analytics

Deliver:
- `ADMIN_WORKLOAD_ANALYTICS` table.
- Task status, process stage, aging, SLA, workload weight, priority score.

Acceptance:
- Admin owner workload can be summarized by owner, department, stage, and SLA status.

### Milestone 7: Polish and Safety

Deliver:
- Formatting, filters, frozen headers, run log.
- Error handling and lock handling.

Acceptance:
- Refresh can be run repeatedly without corrupting raw data or duplicating generated rows.

---

## 16. Acceptance Test Checklist

Before marking work complete, verify:

- [ ] Raw source sheets are unchanged.
- [ ] `MASTER_PR_APPROVED` exists and has the exact required headers.
- [ ] `ADMIN_WORKLOAD_ANALYTICS` exists and has the exact required headers.
- [ ] `REF_COMPANY` and `REF_DEPARTMENT` are generated from `LIST`.
- [ ] `DATA_QUALITY_ISSUES` contains flagged rows with source sheet and row number.
- [ ] `RUN_LOG` records refresh time, batch ID, row counts, and status.
- [ ] No single-row failure stops the whole refresh.
- [ ] PR duplicates are warnings, not fatal errors.
- [ ] Blank/template rows are not imported as real transactions.
- [ ] Date parse failures preserve original text in validation message.
- [ ] Apps Script code uses batch reads/writes.
- [ ] All source-specific column exceptions are handled in mapping config.

---

## 17. What Not to Build Yet

Do not build these unless explicitly requested later:

- Web app UI
- Gemini/LLM matching
- External ERP connector
- Approval workflow automation
- Email notification automation
- Advanced optimization engine for task assignment
- Bidirectional write-back into raw source sheets

Phase 1 is a stable data foundation. Keep the dragon in its cave for now.

---

## 18. Final Goal of Phase 1

At the end of Phase 1, the user should have a Google Sheet where they can:

1. Refresh the procurement master database from raw sheets.
2. Search and filter all PR/procurement documents in one normalized table.
3. See which Admin/PUR owner has which workload.
4. See overdue or near-due work.
5. Identify missing or messy source data without destroying the original file.

The system should be boring, stable, traceable, and easy to extend.
