/***************************************
 * ExportForSupabase.gs
 *
 * Exports Google Sheets data to Supabase-import-ready CSV files.
 * Output folder: "supabase_export_YYYY-MM-DD" in the same Drive
 * location as the active spreadsheet.
 *
 * ─── psql \copy commands (run in this order) ──────────────────
 *
 * \copy fellowship_map   (fellowship_code,campus_name,group_id,subgroup_id,active,timezone)              FROM 'fellowship_map.csv'   CSV HEADER;
 * \copy teachers         (teacher_id,full_name,email,phone,group_id,subgroup_id,active,notes)            FROM 'teachers.csv'         CSV HEADER;
 * \copy email_templates  (template_key,subject,body_html,body_text,active)                               FROM 'email_templates.csv'  CSV HEADER;
 * \copy class_options    (class_option_id,class_id,teacher_id,teacher_name,fellowship_codes,group_id,subgroup_id,day,class_time,active,enrollment_open,max_capacity,label_suffix) FROM 'class_options.csv' CSV HEADER;
 * \copy students         (student_id,full_name,email,phone,group_id,subgroup_id,fellowship_code,batch_id,class_option_id,teacher_name,status,eligible_for_fs,date_added_elvanto,needs_attention_flag,needs_attention_reason,reason_not_started,owner) FROM 'students.csv' CSV HEADER;
 * \copy applicants       (first_name,last_name,email,phone,fellowship_code,group_id,class_option_id,born_again,speaks_in_tongues,water_baptized,status,submitted_at) FROM 'applicants.csv' CSV HEADER;
 * \copy class_roster     (student_id,class_option_id,batch_id,group_id,subgroup_id,status)               FROM 'class_roster.csv'     CSV HEADER;
 * \copy attendance_log   (attendance_id,student_id,group_id,subgroup_id,batch_id,class_option_id,teacher_name,class_number,present,class_date,logged_at) FROM 'attendance_log.csv' CSV HEADER;
 * \copy ft_pipeline      (email,full_name,phone,date_added,week3_flag_date,week3_flag_fired,week6_flag_date,week6_flag_fired,contact_notes,contacted_by,contact_date,follow_up_status,converted_to_fs) FROM 'ft_pipeline.csv' CSV HEADER;
 * \copy eligible_pool    (student_id,full_name,email,group_id,subgroup_id,eligible_pool_status,next_action_deadline,contact_outcome,contacted_by,contact_date,escalation_notes,reason_not_started,days_in_pool,escalation_flag) FROM 'eligible_pool.csv' CSV HEADER;
 * \copy moodle_sync      (student_id,subgroup_id,assignments_completed,assignments_total,exam_passed,moodle_progress,synced_at) FROM 'moodle_sync.csv' CSV HEADER;
 *
 * NOTE: Run 002_seed_data.sql first (batches row '2025A' must exist
 * before rows that reference batch_id are imported).
 *
 * NOTE: fellowship_codes in class_options.csv is exported as a
 * PostgreSQL array literal ({CMU,YORK}). Use the \copy command as-is;
 * psql will cast TEXT to TEXT[] automatically.
 ***************************************/

'use strict';

// ── Status normalisation map ──────────────────────────────────
// Keys are lower-cased at runtime before lookup.
const STATUS_MAP_ = {
  'pending approval':  'Pending',
  'pending review':    'Pending',
  'complete':          'Graduated',
  'completed':         'Graduated',
  'enrolled (pending)':'Enrolled'
};

// ── Columns to drop per sheet (legacy / computed / removed from schema) ───
const SKIP_COLUMNS_ = {
  STUDENTS: [
    // Moodle data → moodle_sync table
    'Items Completed', 'Progress%',
    // CRM contact fields not in students schema
    'CellLeaderName', 'CellLeaderEmail',
    // C1: removed from students schema; lives only in eligible_pool
    'EligiblePoolStatus',
    // Legacy Apps Script timestamp columns
    'LastAttendanceAt', 'UpdatedAt', 'CreatedAt',
    // Applicant back-reference not in students schema
    'ApplicantID'
  ],
  CLASS_OPTIONS: [
    // ClassID is handled specially: written as both class_option_id and class_id.
    // This entry prevents a duplicate column in the output.
    'ClassID'
  ]
};

// ── Explicit column rename maps (sheet header → postgres column) ──────────
// Only non-obvious renames need to be listed; the default conversion is
// done by sheetHeaderToSnake_() which converts CamelCase → snake_case.
const COL_RENAME_ = {
  FELLOWSHIP_MAP: {
    'FellowshipCode': 'fellowship_code',
    'CampusName':     'campus_name',
    'GroupID':        'group_id',
    'SubgroupID':     'subgroup_id',
    'Active':         'active',
    'Timezone':       'timezone'
  },
  TEACHERS: {
    'TeacherID':               'teacher_id',
    'FullName':                'full_name',
    'Email':                   'email',
    'Phone':                   'phone',
    'TeacherPhone':            'phone',      // alias — whichever column exists
    'GroupID':                 'group_id',
    'SubgroupID':              'subgroup_id',
    'Active':                  'active',
    'Notes':                   'notes',
    'TeacherWhatsApp':         null,         // null = skip this column
    'PreferredContactMethod':  null
  },
  EMAIL_TEMPLATES: {
    'TemplateKey': 'template_key',
    'Subject':     'subject',
    'BodyHtml':    'body_html',
    'BodyText':    'body_text',
    'Active':      'active'
  },
  CLASS_OPTIONS: {
    // ClassID handled specially by exportClassOptions_()
    'TeacherID':      'teacher_id',
    'TeacherName':    'teacher_name',
    // FellowshipCode / FellowshipCodes → fellowship_codes (array literal)
    'FellowshipCode':  'fellowship_codes',
    'FellowshipCodes': 'fellowship_codes',
    'GroupID':         'group_id',
    'SubgroupID':      'subgroup_id',
    'Day':             'day',
    'Time':            'class_time',
    'Active':          'active',
    'EnrollmentOpen':  'enrollment_open',
    'MaxCapacity':     'max_capacity',
    'LabelSuffix':     'label_suffix',
    'BatchID':         null,   // batch context moved to class_slots, not class_options
    'Location':        null,
    'ClassStartDate':  null
  },
  STUDENTS: {
    'StudentID':           'student_id',
    'FullName':            'full_name',
    'Email':               'email',
    'Phone':               'phone',
    'GroupID':             'group_id',
    'SubgroupID':          'subgroup_id',
    'FellowshipCode':      'fellowship_code',
    'BatchID':             'batch_id',
    // ClassOptionID (new column) takes precedence over ClassAssigned / ClassID
    'ClassOptionID':       'class_option_id',
    'ClassAssigned':       'class_option_id',  // fallback if ClassOptionID absent
    'ClassID':             'class_option_id',  // older fallback
    'TeacherName':         'teacher_name',
    'Status':              'status',
    'EligibleForFS':       'eligible_for_fs',
    'DateAddedElvanto':    'date_added_elvanto',
    'NeedsAttentionFlag':  'needs_attention_flag',
    'NeedsAttentionReason':'needs_attention_reason',
    'ReasonNotStarted':    'reason_not_started',
    'Owner':               'owner',
    'RegistrationDate':    null  // not in students schema
  },
  APPLICANTS: {
    'FirstName':       'first_name',
    'LastName':        'last_name',
    'FullName':        null,       // applicants schema uses first/last separately
    'Email':           'email',
    'Phone':           'phone',
    'FellowshipCode':  'fellowship_code',
    'GroupID':         'group_id',
    'ClassID':         'class_option_id',
    'ClassOptionID':   'class_option_id',
    'BornAgain':       'born_again',
    'SpeaksInTongues': 'speaks_in_tongues',
    'WaterBaptized':   'water_baptized',
    'Status':          'status',
    'SubmittedAt':     'submitted_at',
    // Legacy columns from applicants_removeLegacyColumns_
    'SubgroupID':      null,
    'BatchCode':       null,
    'DataWarning':     null,
    'ConfirmQueuedAt': null,
    'ConfirmSentAt':   null,
    'ReminderQueuedAt':null,
    'ReminderSentAt':  null,
    'WithdrawnAt':     null,
    'WithdrawalReason':null
  },
  ATTENDANCE_LOG: {
    'AttendanceID':  'attendance_id',
    'StudentID':     'student_id',
    'GroupID':       'group_id',
    'SubgroupID':    'subgroup_id',
    'BatchID':       'batch_id',
    'ClassID':       'class_option_id',   // renamed per migration requirement
    'TeacherName':   'teacher_name',
    'ClassWeek':     'class_number',      // renamed per migration requirement
    'Present':       'present',
    'AttendanceDate':'class_date',         // renamed per migration requirement
    'SubmittedAt':   'logged_at'
  },
  FT_PIPELINE: {
    'Email':           'email',
    'FullName':        'full_name',
    'Phone':           'phone',
    'DateAdded':       'date_added',
    'Week3FlagDate':   'week3_flag_date',
    'Week3FlagFired':  'week3_flag_fired',
    'Week6FlagDate':   'week6_flag_date',
    'Week6FlagFired':  'week6_flag_fired',
    'ContactNotes':    'contact_notes',
    'ContactedBy':     'contacted_by',
    'ContactDate':     'contact_date',
    'FollowUpStatus':  'follow_up_status',
    'ConvertedToFS':   'converted_to_fs'
  },
  ELIGIBLE_POOL: {
    'StudentID':          'student_id',
    'FullName':           'full_name',
    'Email':              'email',
    'GroupID':            'group_id',
    'SubgroupID':         'subgroup_id',
    'EligiblePoolStatus': 'eligible_pool_status',
    'NextActionDeadline': 'next_action_deadline',
    'ContactOutcome':     'contact_outcome',
    'ContactedBy':        'contacted_by',
    'ContactDate':        'contact_date',
    'EscalationNotes':    'escalation_notes',
    'ReasonNotStarted':   'reason_not_started',
    'DaysInPool':         'days_in_pool',
    'EscalationFlag':     'escalation_flag'
  },
  MOODLE_SYNC: {
    'StudentID':             'student_id',
    'SubgroupID':            'subgroup_id',
    'AssignmentsCompleted':  'assignments_completed',
    'AssignmentsTotal':      'assignments_total',
    'ExamPassed':            'exam_passed',
    'MoodleProgress':        'moodle_progress',
    'SyncedAt':              'synced_at',
    // Moodle columns that don't map to schema
    'Items Completed':       null,
    'Progress%':             null
  },
  CLASS_ROSTER: {
    'StudentID':      'student_id',
    'ClassOptionID':  'class_option_id',
    'ClassID':        'class_option_id',  // fallback
    'BatchID':        'batch_id',
    'GroupID':        'group_id',
    'SubgroupID':     'subgroup_id',
    'EnrolledAt':     'enrolled_at',
    'Status':         'status'
  }
};

// ── Date columns (normalised to YYYY-MM-DD) ──────────────────
const DATE_COLUMNS_ = new Set([
  'date_added', 'week3_flag_date', 'week6_flag_date', 'contact_date',
  'class_date', 'next_action_deadline', 'placement_deadline',
  'placement_date', 'graduation_date', 'date_added_elvanto',
  'enrolled_at', 'start_date', 'start_sunday', 'end_date'
]);

// ── Timestamp columns (normalised to ISO-8601) ───────────────
const TIMESTAMP_COLUMNS_ = new Set([
  'submitted_at', 'logged_at', 'synced_at', 'last_synced',
  'resolved_at', 'changed_at', 'created_at', 'updated_at'
]);

// ── Boolean columns ──────────────────────────────────────────
const BOOL_COLUMNS_ = new Set([
  'active', 'eligible_for_fs', 'present', 'made_up',
  'submitted_by_teacher', 'missing_submission_flag', 'class1_no_show_flag',
  'repeat_absentee_flag', 'week3_flag_fired', 'week6_flag_fired',
  'converted_to_fs', 'escalation_flag', 'needs_attention_flag',
  'exam_passed', 'enrollment_open', 'registration_open',
  'processed_to_eligible_pool', 'resolved', 'makeup_completed',
  'overdue_flag', 'all_gates_met', 'gate1_attendance', 'gate2_assignments',
  'gate3_exam_passed', 'gate4_cell_integrated'
]);

// ── Status columns (apply STATUS_MAP_ normalisation) ─────────
const STATUS_COLUMNS_ = new Set([
  'status', 'eligible_pool_status', 'placement_status', 'follow_up_status',
  'makeup_type'
]);


// =============================================================
// PUBLIC: runExportAll
// Exports all tables in FK-dependency order.
// =============================================================

function runExportAll() {
  const folder = getOrCreateExportFolder_();
  const skippedRows = [];
  const summary = [];

  const exports = [
    { sheet: 'FELLOWSHIP_MAP',  file: 'fellowship_map.csv',  fn: exportGeneric_ },
    { sheet: 'TEACHERS',        file: 'teachers.csv',        fn: exportGeneric_ },
    { sheet: 'EMAIL_TEMPLATES', file: 'email_templates.csv', fn: exportGeneric_ },
    { sheet: 'CLASS_OPTIONS',   file: 'class_options.csv',   fn: exportClassOptions_ },
    { sheet: 'STUDENTS',        file: 'students.csv',        fn: exportGeneric_ },
    { sheet: 'APPLICANTS',      file: 'applicants.csv',      fn: exportGeneric_ },
    { sheet: 'CLASS_ROSTER',    file: 'class_roster.csv',    fn: exportGeneric_ },
    { sheet: 'ATTENDANCE_LOG',  file: 'attendance_log.csv',  fn: exportGeneric_ },
    { sheet: 'FT_PIPELINE',     file: 'ft_pipeline.csv',     fn: exportGeneric_ },
    { sheet: 'ELIGIBLE_POOL',   file: 'eligible_pool.csv',   fn: exportGeneric_ },
    { sheet: 'MOODLE_SYNC',     file: 'moodle_sync.csv',     fn: exportGeneric_ }
  ];

  for (const cfg of exports) {
    try {
      const result = cfg.fn(cfg.sheet, folder, skippedRows);
      summary.push({ sheet: cfg.sheet, file: cfg.file, ...result });
    } catch (e) {
      summary.push({ sheet: cfg.sheet, file: cfg.file, error: e.message });
    }
  }

  writeSkippedRows_(folder, skippedRows);
  logExportSummary_(summary, skippedRows.length);
}


// =============================================================
// exportClassOptions_
// Special handler: duplicates ClassID → class_option_id AND class_id.
// =============================================================

function exportClassOptions_(sheetName, folder, skippedRows) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { processed: 0, skipped: 0 };

  const rawHeaders = data[0].map(h => String(h || '').trim());
  const classIdIdx = rawHeaders.indexOf('ClassID');

  // Build postgres column names for all source columns
  const rename = COL_RENAME_[sheetName] || {};
  const skipSet = new Set(SKIP_COLUMNS_[sheetName] || []);

  // Output headers: inject class_option_id and class_id in place of ClassID
  const outHeaders = [];
  const colMapping = [];  // { srcIdx, destName } | { literal: true, destName, srcIdx }

  // Inject class_option_id and class_id first (derived from ClassID)
  if (classIdIdx >= 0) {
    outHeaders.push('class_option_id', 'class_id');
    colMapping.push(
      { srcIdx: classIdIdx, destName: 'class_option_id' },
      { srcIdx: classIdIdx, destName: 'class_id' }
    );
  }

  for (let c = 0; c < rawHeaders.length; c++) {
    const raw = rawHeaders[c];
    if (!raw || raw === 'ClassID') continue;        // ClassID already handled above
    if (skipSet.has(raw)) continue;
    const dest = (raw in rename) ? rename[raw] : sheetHeaderToSnake_(raw);
    if (dest === null) continue;                    // explicitly skipped
    if (dest && !outHeaders.includes(dest)) {       // deduplicate (e.g. two alias columns)
      outHeaders.push(dest);
      colMapping.push({ srcIdx: c, destName: dest });
    }
  }

  const rows = [outHeaders];
  let processed = 0;
  let skipped = 0;

  for (let r = 1; r < data.length; r++) {
    const src = data[r];
    if (isEmptyRow_(src)) continue;

    const outRow = colMapping.map(({ srcIdx, destName }) => {
      const raw = src[srcIdx];
      return formatCell_(destName, raw, sheetName, r, skippedRows);
    });

    // fellowship_codes: convert comma-separated string → PG array literal {A,B}
    const fcIdx = outHeaders.indexOf('fellowship_codes');
    if (fcIdx >= 0) {
      outRow[fcIdx] = toPostgresArray_(String(outRow[fcIdx] || ''));
    }

    rows.push(outRow);
    processed++;

    if (checkForUnrecognisedStatus_(src, rawHeaders, sheetName, r, skippedRows)) skipped++;
  }

  writeCsv_(folder, 'class_options.csv', rows);
  return { processed, skipped };
}


// =============================================================
// exportGeneric_
// Handles all other sheets using COL_RENAME_ and SKIP_COLUMNS_.
// =============================================================

function exportGeneric_(sheetName, folder, skippedRows) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { processed: 0, skipped: 0 };

  const rawHeaders = data[0].map(h => String(h || '').trim());
  const rename  = COL_RENAME_[sheetName] || {};
  const skipSet = new Set(SKIP_COLUMNS_[sheetName] || []);

  // Build output header list and source-column index mapping.
  // Deduplicate: first column that maps to a given dest name wins.
  const outHeaders = [];
  const srcIndices = [];  // parallel array: srcIndices[i] = column index in rawHeaders

  for (let c = 0; c < rawHeaders.length; c++) {
    const raw = rawHeaders[c];
    if (!raw) continue;
    if (skipSet.has(raw)) continue;
    const dest = (raw in rename) ? rename[raw] : sheetHeaderToSnake_(raw);
    if (dest === null) continue;
    if (!dest) continue;
    if (outHeaders.includes(dest)) continue;  // already mapped (alias column)
    outHeaders.push(dest);
    srcIndices.push(c);
  }

  const rows = [outHeaders];
  let processed = 0;
  let skipped = 0;

  for (let r = 1; r < data.length; r++) {
    const src = data[r];
    if (isEmptyRow_(src)) continue;

    const outRow = srcIndices.map((c, i) =>
      formatCell_(outHeaders[i], src[c], sheetName, r, skippedRows)
    );

    rows.push(outRow);
    processed++;

    if (checkForUnrecognisedStatus_(src, rawHeaders, sheetName, r, skippedRows)) skipped++;
  }

  const filename = sheetNameToFilename_(sheetName);
  writeCsv_(folder, filename, rows);
  return { processed, skipped };
}


// =============================================================
// Cell formatting helpers
// =============================================================

function formatCell_(destCol, rawValue, sheetName, rowIdx, skippedRows) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) return '';

  if (DATE_COLUMNS_.has(destCol)) {
    return formatDate_(rawValue);
  }

  if (TIMESTAMP_COLUMNS_.has(destCol)) {
    return formatTimestamp_(rawValue);
  }

  if (BOOL_COLUMNS_.has(destCol)) {
    return formatBoolean_(rawValue);
  }

  if (STATUS_COLUMNS_.has(destCol)) {
    return normaliseStatus_(rawValue, destCol, sheetName, rowIdx, skippedRows);
  }

  return String(rawValue).trim();
}

function formatDate_(val) {
  if (!val || val === '') return '';
  try {
    const d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val).trim();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  } catch (e) {
    return String(val).trim();
  }
}

function formatTimestamp_(val) {
  if (!val || val === '') return '';
  try {
    const d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val).trim();
    return d.toISOString();
  } catch (e) {
    return String(val).trim();
  }
}

function formatBoolean_(val) {
  if (val === true  || String(val).trim().toLowerCase() === 'true'  || val === 1 || val === '1' || String(val).trim().toLowerCase() === 'yes') return 'true';
  if (val === false || String(val).trim().toLowerCase() === 'false' || val === 0 || val === '0' || String(val).trim().toLowerCase() === 'no')  return 'false';
  return 'false';  // default unknown to false
}

function normaliseStatus_(val, destCol, sheetName, rowIdx, skippedRows) {
  const raw = String(val).trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (STATUS_MAP_[key] !== undefined) return STATUS_MAP_[key];
  // Pass through recognised statuses unchanged
  return raw;
}

// Logs rows where a STATUS column contains a value not in STATUS_MAP_ and
// not in the known-valid set, so they can be reviewed before import.
function checkForUnrecognisedStatus_(srcRow, rawHeaders, sheetName, rowIdx, skippedRows) {
  const knownValid = new Set([
    'Active', 'At Risk', 'Withdrawn', 'Graduated',
    'Pending', 'Approved', 'Rejected', 'Enrolled',
    'Not Started', 'Registered', 'In Progress',
    'Standard', 'Escalated', 'Pending', 'Placed', 'Stalled',
    'Available', 'Unavailable', 'Tentative'
  ]);

  let hasUnrecognised = false;
  for (let c = 0; c < rawHeaders.length; c++) {
    const h = rawHeaders[c];
    if (!STATUS_COLUMNS_.has(sheetHeaderToSnake_(h))) continue;
    const raw = String(srcRow[c] || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!knownValid.has(raw) && STATUS_MAP_[key] === undefined) {
      skippedRows.push({
        sheet: sheetName,
        row:   rowIdx + 1,
        column: h,
        value: raw,
        reason: 'Unrecognised status value — manual review required'
      });
      hasUnrecognised = true;
    }
  }
  return hasUnrecognised;
}

function toPostgresArray_(csvString) {
  if (!csvString) return '{}';
  const parts = csvString.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '{}';
  return '{' + parts.join(',') + '}';
}


// =============================================================
// CSV writing
// =============================================================

function writeCsv_(folder, filename, rows) {
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell == null ? '' : cell);
      // Quote if contains comma, double-quote, or newline
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');

  const existing = folder.getFilesByName(filename);
  if (existing.hasNext()) existing.next().setTrashed(true);

  folder.createFile(filename, csv, MimeType.PLAIN_TEXT);
}

function writeSkippedRows_(folder, skippedRows) {
  if (!skippedRows.length) return;
  const headers = ['Sheet', 'Row', 'Column', 'Value', 'Reason'];
  const rows = [headers].concat(
    skippedRows.map(r => [r.sheet, r.row, r.column, r.value, r.reason])
  );
  writeCsv_(folder, 'SKIPPED_ROWS.csv', rows);
}


// =============================================================
// Drive folder helpers
// =============================================================

function getOrCreateExportFolder_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssFile = DriveApp.getFileById(ss.getId());
  const parent = ssFile.getParents().hasNext()
    ? ssFile.getParents().next()
    : DriveApp.getRootFolder();

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const name  = 'supabase_export_' + today;

  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}


// =============================================================
// Logging
// =============================================================

function logExportSummary_(summary, totalSkipped) {
  const lines = ['=== Supabase Export Summary ==='];
  let totalProcessed = 0;

  for (const s of summary) {
    if (s.error) {
      lines.push(`  ✗ ${s.sheet}: ERROR — ${s.error}`);
    } else {
      lines.push(`  ✓ ${s.sheet}: ${s.processed} rows processed, ${s.skipped} flagged`);
      totalProcessed += (s.processed || 0);
    }
  }

  lines.push('');
  lines.push(`Total rows processed: ${totalProcessed}`);
  lines.push(`Total rows flagged in SKIPPED_ROWS.csv: ${totalSkipped}`);
  lines.push('Import order matches FK dependency order.');
  if (totalSkipped > 0) {
    lines.push('⚠ Review SKIPPED_ROWS.csv for unrecognised status values before importing.');
  }

  Logger.log(lines.join('\n'));
}


// =============================================================
// Utility
// =============================================================

// Converts CamelCase or PascalCase header to snake_case.
// "ClassOptionID" → "class_option_id"
// "BatchID"       → "batch_id"
function sheetHeaderToSnake_(header) {
  return String(header)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([a-zA-Z])(\d)/g, '$1_$2')
    .replace(/\s+/g, '_')
    .replace(/%/g, '_pct')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function sheetNameToFilename_(sheetName) {
  return sheetName.toLowerCase() + '.csv';
}

function isEmptyRow_(row) {
  return row.every(cell => cell === '' || cell === null || cell === undefined);
}
