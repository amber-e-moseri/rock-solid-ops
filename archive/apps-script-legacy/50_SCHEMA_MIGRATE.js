const FS_SCHEMA = {
  STUDENTS: [
    'Phone', 'Items Completed', 'Progress%', 'GroupID', 'SubgroupID', 'CellLeaderName', 'CellLeaderEmail',
    'DateAddedElvanto', 'EligibleForFS', 'EligiblePoolStatus', 'ReasonNotStarted', 'RegistrationDate',
    'ClassAssigned', 'BatchID', 'NeedsAttentionFlag', 'NeedsAttentionReason', 'Owner'
  ],
  APPLICANTS: ['SubgroupID'],
  CLASS_OPTIONS: ['TeacherID', 'GroupID', 'SubgroupID', 'BatchID', 'MaxCapacity', 'Location', 'ClassStartDate'],
  TEACHERS: ['TeacherPhone', 'TeacherWhatsApp', 'PreferredContactMethod'],
  ERROR_SUBMISSIONS: ['RawFormDump', 'TriedKeys', 'ResolutionNotes', 'ErrorStage', 'RawEmail', 'RawClassLabel']
};

const SETTINGS_HEADERS_ = ['Key', 'Value', 'Description', 'Last Updated'];
const SETTINGS_DEFAULTS_ = [
  ['MAILCHIMP_ENABLED', 'FALSE', 'Set TRUE to enable Mailchimp subscribe calls from website registration'],
  ['MAILCHIMP_API_KEY', '', 'Mailchimp API key from Account > Extras > API keys'],
  ['MAILCHIMP_AUDIENCE_ID', '', 'Audience/List ID from Audience settings'],
  ['MAILCHIMP_SERVER_PREFIX', '', 'Data center prefix like us21'],
  ['MAILCHIMP_STATUS', 'subscribed', 'Member status to apply (subscribed, pending, etc.)']
];

function schema_ensureColumns_(sheetName, required) {
  const sh = getSheet(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    missing.forEach(col => logSync_('SCHEMA_COLUMN_ADDED', `${sheetName}.${col}`));
  }
  return missing;
}

function schema_migrateAll() {
  const res = {};
  res.STUDENTS = schema_ensureColumns_('STUDENTS', FS_SCHEMA.STUDENTS);
  res.APPLICANTS = schema_ensureColumns_('APPLICANTS', FS_SCHEMA.APPLICANTS);
  res.APPLICANTS_LEGACY_REMOVED = applicants_removeLegacyColumns_();
  res.CLASS_OPTIONS = schema_ensureColumns_('CLASS_OPTIONS', FS_SCHEMA.CLASS_OPTIONS);
  res.TEACHERS = schema_ensureColumns_('TEACHERS', FS_SCHEMA.TEACHERS);
  res.ERROR_SUBMISSIONS = schema_ensureColumns_('ERROR_SUBMISSIONS', FS_SCHEMA.ERROR_SUBMISSIONS);
  res.TEACHER_AVAILABILITY = setupTeacherAvailabilitySheet();

  ensureConfigGuidance_();
  ensureSettingsSheet_();
  ensureFsControlPanel_();
  schema_validateHeaders_();

  logSync_('SCHEMA_MIGRATE', JSON.stringify(res));
  return res;
}

function applicants_removeLegacyColumns_() {
  const sheetName = 'APPLICANTS';
  const legacy = [
    'ConfirmQueuedAt',
    'ConfirmSentAt',
    'ReminderQueuedAt',
    'ReminderSentAt',
    'BatchCode',
    'DataWarning',
    'GroupID',
    'BatchID',
    'WithdrawnAt',
    'WithdrawalReason'
  ];

  const sh = getSheet(sheetName);
  const lastCol = sh.getLastColumn();
  if (!lastCol) return { removed: [], missing: legacy.slice() };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const byName = {};
  headers.forEach((h, i) => { if (h) byName[h] = i + 1; });

  const removeCols = legacy
    .map(name => ({ name: name, col: byName[name] || 0 }))
    .filter(x => x.col > 0)
    .sort((a, b) => b.col - a.col);
  const missing = legacy.filter(name => !byName[name]);

  removeCols.forEach(x => sh.deleteColumn(x.col));
  if (removeCols.length) {
    logSync_('APPLICANTS_LEGACY_COLUMNS_REMOVED', JSON.stringify({
      removed: removeCols.map(x => x.name),
      count: removeCols.length
    }));
  }

  return { removed: removeCols.map(x => x.name), missing: missing };
}

function setupTeacherAvailabilitySheet() {
  const availabilityHeaders = [
    'AvailabilityID',
    'TeacherID',
    'TeacherName',
    'FellowshipCode',
    'GroupID',
    'SubgroupID',
    'PreferredDay',
    'PreferredTime',
    'Active',
    'SubmittedAt',
    'AdminApproved',
    'ApprovedBy',
    'ApprovedAt',
    'AdminNotes',
    'Month',
    'Year'
  ];

  const logHeaders = [
    'Timestamp',
    'TeacherID',
    'TeacherName',
    'Action',
    'Field',
    'OldValue',
    'NewValue',
    'ChangedBy'
  ];

  const availabilitySh = ensureSheet('TEACHER_AVAILABILITY', availabilityHeaders);
  ensureColumns(availabilitySh, availabilityHeaders);
  const availabilityLastCol = availabilitySh.getLastColumn();
  if (availabilityLastCol > 0) {
    availabilitySh.getRange(1, 1, 1, availabilityLastCol)
      .setFontWeight('bold')
      .setBackground('#4a5568')
      .setFontColor('#ffffff');
    availabilitySh.setFrozenRows(1);
  }

  const logSh = ensureSheet('TEACHER_AVAILABILITY_LOG', logHeaders);
  ensureColumns(logSh, logHeaders);
  const logLastCol = logSh.getLastColumn();
  if (logLastCol > 0) {
    logSh.getRange(1, 1, 1, logLastCol)
      .setFontWeight('bold')
      .setBackground('#4a5568')
      .setFontColor('#ffffff');
    logSh.setFrozenRows(1);
  }

  return true;
}

function getTeacherAvailability_(month, year) {
  const targetMonth = String(month || '').trim();
  const targetYear = String(year || '').trim();
  if (!targetMonth || !targetYear) return [];

  const sh = getSheet('TEACHER_AVAILABILITY');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndex(headers);
  const out = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const adminApproved = String(row[H.AdminApproved] || '').trim().toUpperCase();
    if (adminApproved === 'REJECTED') continue;

    const rowMonth = String(row[H.Month] || '').trim();
    const rowYear = String(row[H.Year] || '').trim();
    if (rowMonth !== targetMonth || rowYear !== targetYear) continue;

    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = row[idx];
    });
    out.push(obj);
  }

  return out;
}

function logAvailabilityChange_(teacherID, action, field, oldVal, newVal, changedBy) {
  const sh = getSheet('TEACHER_AVAILABILITY_LOG');
  const data = sh.getDataRange().getValues();
  const headers = (data.length ? data[0] : []).map(h => String(h || '').trim());
  const H = headerIndex(headers);

  const normalizedTeacherID = normalizeCode(teacherID);
  const teacherName = (function () {
    try {
      const tSh = getSheet(SHEET_TEACHERS);
      const tData = tSh.getDataRange().getValues();
      if (tData.length < 2) return '';
      const TH = headerIndex(tData[0]);
      for (let i = 1; i < tData.length; i++) {
        if (normalizeCode(tData[i][TH.TeacherID]) === normalizedTeacherID) {
          return String(tData[i][TH.TeacherName] || '').trim();
        }
      }
      return '';
    } catch (e) {
      return '';
    }
  })();

  const row = new Array(headers.length).fill('');
  row[H.Timestamp] = new Date();
  row[H.TeacherID] = normalizedTeacherID;
  row[H.TeacherName] = teacherName;
  row[H.Action] = String(action || '').trim();
  row[H.Field] = String(field || '').trim();
  row[H.OldValue] = oldVal == null ? '' : String(oldVal);
  row[H.NewValue] = newVal == null ? '' : String(newVal);
  row[H.ChangedBy] = String(changedBy || '').trim();

  sh.appendRow(row);
  return true;
}

function ensureSettingsSheet_() {
  const sh = ensureSheet('SETTINGS', SETTINGS_HEADERS_);
  ensureColumns(sh, SETTINGS_HEADERS_);

  if (sh.getLastRow() >= 2) {
    const existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    const h = headerIndex(existingHeaders);
    if (!('Key' in h) || !('Value' in h)) throw new Error('SETTINGS sheet must have Key and Value columns.');

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    const rowByKey = {};
    for (let i = 0; i < data.length; i++) {
      const key = String(data[i][h.Key] || '').trim();
      if (key) rowByKey[key] = i + 2;
    }

    SETTINGS_DEFAULTS_.forEach(function (entry) {
      const key = entry[0];
      const defValue = entry[1];
      const desc = entry[2];
      if (rowByKey[key]) {
        if ('Description' in h) sh.getRange(rowByKey[key], h.Description + 1).setValue(desc);
        if ('Last Updated' in h) sh.getRange(rowByKey[key], h['Last Updated'] + 1).setValue(new Date());
      } else {
        const row = new Array(sh.getLastColumn()).fill('');
        if ('Key' in h) row[h.Key] = key;
        if ('Value' in h) row[h.Value] = defValue;
        if ('Description' in h) row[h.Description] = desc;
        if ('Last Updated' in h) row[h['Last Updated']] = new Date();
        sh.appendRow(row);
        logSync_('SETTINGS_SETUP', `Added SETTINGS key: ${key}`);
      }
    });
  } else {
    const rows = SETTINGS_DEFAULTS_.map(function (entry) {
      return [entry[0], entry[1], entry[2], new Date()];
    });
    sh.getRange(2, 1, rows.length, SETTINGS_HEADERS_.length).setValues(rows);
    logSync_('SETTINGS_SETUP', `Initialized SETTINGS with ${rows.length} Mailchimp rows`);
  }

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.getRange(2, 2, lastRow - 1, 1).setNumberFormat('@');
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 300);
  sh.setColumnWidth(3, 520);
  sh.setColumnWidth(4, 180);
  sh.setFrozenRows(1);
  return sh;
}

function setupStarterSheets() {
  schema_createMissingSheets_();
  setupConfigSheet();
  ensureSettingsSheet_();
  schema_migrateAll();
  logSync_('SETUP', 'Starter sheets and configuration prepared');
  return true;
}

function RUN_ME_FIRST_Setup_Sheets() {
  return setupStarterSheets();
}

function schema_validateHeaders_() {
  const checks = [];
  [
    ['STUDENTS', FS_SCHEMA.STUDENTS],
    ['APPLICANTS', FS_SCHEMA.APPLICANTS],
    ['CLASS_OPTIONS', FS_SCHEMA.CLASS_OPTIONS],
    ['TEACHERS', FS_SCHEMA.TEACHERS],
    ['ERROR_SUBMISSIONS', FS_SCHEMA.ERROR_SUBMISSIONS]
  ].forEach(function (pair) {
    const name = pair[0];
    const req = pair[1];
    const sh = getSheet(name);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    req.forEach(h => checks.push({ sheet: name, column: h, ok: headers.includes(h) }));
  });

  checks.forEach(c => logSync_('SCHEMA_VALIDATE', `${c.sheet}.${c.column}: ${c.ok ? 'OK' : 'MISSING'}`));
  return checks;
}

function schema_createSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    logSync_('SCHEMA_SHEET_CREATED', name);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(h => String(h || '').trim());
    const missing = headers.filter(h => !existing.includes(h));
    if (missing.length) {
      sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
      missing.forEach(col => logSync_('SCHEMA_COLUMN_ADDED', `${name}.${col}`));
    }
  }

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setFontColor('#ffffff').setBackground('#2B6CB0');
  sh.autoResizeColumns(1, sh.getLastColumn());
  return sh;
}

function schema_createMissingSheets_() {
  const defs = {
    ELVANTO_IMPORT: ['ElvantoID', 'FullName', 'Email', 'DateAdded', 'AttendanceStatus', 'GroupID', 'SubgroupID', 'ImportedDate', 'ProcessedToEligiblePool'],
    FT_PIPELINE: ['StudentID', 'FullName', 'Email', 'DateAdded', 'Week3FlagDate', 'Week3FlagFired', 'Week6FlagDate', 'Week6FlagFired', 'FollowUpOwner', 'FollowUpDeadline', 'FollowUpOutcome', 'AlternatePlan', 'OutcomeLoggedDate', 'ConvertedToFS'],
    ELIGIBLE_POOL: ['StudentID', 'FullName', 'Email', 'GroupID', 'SubgroupID', 'EligiblePoolStatus', 'LastContactDate', 'LastContactBy', 'ContactOutcome', 'NextActionOwner', 'NextActionDeadline', 'ReasonNotStarted', 'DaysInPool', 'EscalationFlag'],
    CLASS_SLOTS: ['ClassSlotID', 'GroupID', 'SubgroupID', 'BatchID', 'DayOfWeek', 'Time', 'Location', 'TeacherName', 'TeacherEmail', 'MaxCapacity', 'CurrentEnrolment', 'Status', 'ClassStartDate'],
    GRADUATION_REVIEW: ['StudentID', 'BatchID', 'SubgroupID', 'Gate1_Attendance', 'Gate2_Assignments', 'Gate3_ExamPassed', 'Gate4_CellIntegrated', 'AllGatesMet', 'GraduationStatus', 'ReviewedBy', 'ReviewDate', 'Notes'],
    MAKEUP_QUEUE: ['StudentID', 'SubgroupID', 'BatchID', 'MissedClassNumber', 'MakeupType', 'AssignedDate', 'MakeupDeadline', 'MakeupCompleted', 'CompletedDate', 'ApprovedBy', 'Notes'],
    TRANSITION_LOG: ['StudentID', 'GraduationDate', 'BatchID', 'PlacementDeadline', 'DepartmentPlacedInto', 'PlacedBy', 'PlacementConfirmedDate', 'PlacementStatus', 'OverdueFlag', 'Notes'],
    LEAD_SOURCE_LOG: ['StudentID', 'BatchID', 'LeadSource', 'CampaignWeek', 'QRScanDate', 'FormSubmissionDate', 'ConvertedToStudent'],
    FEEDBACK_LOG: ['StudentID', 'BatchID', 'SubgroupID', 'SubmittedDate', 'ImpactfulClass', 'UnclearContent', 'TeacherRating', 'MoodleRating', 'WouldRecommend', 'OverallScore'],
    MOODLE_SYNC: ['StudentID', 'SubgroupID', 'MoodleUserID', 'MoodleProgress', 'AssignmentsCompleted', 'AssignmentsTotal', 'ExamScore', 'ExamPassed', 'LastActivityDate', 'InactivityFlag', 'SyncDate'],
    GROUP_SUMMARY: ['GroupID', 'SubgroupID', 'TotalEnrolled', 'ActiveStudents', 'AtRiskStudents', 'EligiblePoolCount', 'AttendanceRate', 'MoodleCompletionRate', 'GraduationReadyCount', 'GraduatedThisTerm', 'CellIntegratedCount', 'PlacedInWorkforce', 'FTConversionRate', 'FeedbackScoreAvg', 'LastUpdated']
  };

  Object.keys(defs).forEach(name => schema_createSheet_(name, defs[name]));
}

function schema_migrateClassOptionsToSlots_() {
  schema_createMissingSheets_();
  const src = getSheet('CLASS_OPTIONS').getDataRange().getValues();
  const dst = getSheet('CLASS_SLOTS');
  const dstData = dst.getDataRange().getValues();
  const SH = headerIndex(src[0]);
  const DH = headerIndex(dstData[0]);

  const existing = new Set(dstData.slice(1).map(r => String(r[DH.ClassSlotID] || '').trim()));
  const rows = [];
  for (let i = 1; i < src.length; i++) {
    const classId = String(src[i][SH.ClassID] || '').trim();
    if (!classId || existing.has(classId)) continue;

    rows.push([
      classId,
      '',
      String(src[i][SH.FellowshipCode] || '').split(',')[0].trim(),
      String(src[i][SH.BatchID] || ''),
      String(src[i][SH.Day] || ''),
      formatTime(src[i][SH.Time]),
      String(src[i][SH.Location] || 'Online'),
      String(src[i][SH.TeacherName] || ''),
      String(src[i][SH.TeacherEmail] || ''),
      src[i][SH.MaxCapacity] || 20,
      '',
      (String(src[i][SH.Active] || '').toLowerCase() === 'false' ? 'Closed' : 'Active'),
      src[i][SH.ClassStartDate] || ''
    ]);

    if (!src[i][SH.GroupID]) logSync_('CLASS_SLOT_GROUPID_REQUIRED', `Assign GroupID for ${classId}`);
  }

  if (rows.length) dst.getRange(dst.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  logSync_('CLASS_OPTIONS_TO_SLOTS', `Created ${rows.length} slot row(s)`);
  return rows.length;
}

function student_refreshProgressColumns_() {
  schema_ensureColumns_('STUDENTS', ['Items Completed', 'Progress%']);

  const studentsSh = getSheet('STUDENTS');
  const students = studentsSh.getDataRange().getValues();
  if (students.length < 2) return 0;

  const moodle = getSheet('MOODLE_SYNC').getDataRange().getValues();
  const review = getSheet('GRADUATION_REVIEW').getDataRange().getValues();
  const att = getSheet('ATTENDANCE_LOG').getDataRange().getValues();

  const SH = headerIndex(students[0]);
  const MH = headerIndex(moodle[0]);
  const RH = headerIndex(review[0]);
  const AH = headerIndex(att[0]);

  const moodleByStudent = new Map(moodle.slice(1).map(r => [String(r[MH.StudentID] || '').trim(), r]));
  const reviewByStudent = new Map(review.slice(1).map(r => [String(r[RH.StudentID] || '').trim(), r]));

  // STUDENTS attendance columns are legacy summary fields only.
  // ATTENDANCE_LOG is the source of truth for attendance completion.
  const attendanceByStudent = new Map();
  att.slice(1).forEach(r => {
    const sid = String(r[AH.StudentID] || '').trim();
    if (!sid) return;
    const map = attendanceByStudent.get(sid) || new Map();
    map.set(String(r[AH.ClassNumber] || '').trim(), !!r[AH.Present] || !!r[AH.MadeUp]);
    attendanceByStudent.set(sid, map);
  });

  let updated = 0;
  for (let i = 1; i < students.length; i++) {
    const sid = String(students[i][SH.StudentID] || '').trim();
    if (!sid) continue;

    const weeks = attendanceByStudent.get(sid) || new Map();
    const attendanceComplete = ['1', '2', '3', '4', '5', '6', '7'].every(w => weeks.get(w));

    const m = moodleByStudent.get(sid);
    const assignmentsComplete = !!m && Number(m[MH.AssignmentsCompleted] || 0) >= Number(m[MH.AssignmentsTotal] || Infinity);
    const examPassed = !!m && (m[MH.ExamPassed] === true || String(m[MH.ExamPassed] || '').toLowerCase() === 'true');

    const r = reviewByStudent.get(sid);
    const cellIntegrated = !!r && (r[RH.Gate4_CellIntegrated] === true || String(r[RH.Gate4_CellIntegrated] || '').toLowerCase() === 'true');

    const completeCount = [attendanceComplete, assignmentsComplete, examPassed, cellIntegrated].filter(Boolean).length;
    const progressPct = Math.round((completeCount / 4) * 10000) / 100;

    if ('Items Completed' in SH) students[i][SH['Items Completed']] = `${completeCount}/4`;
    if ('Progress%' in SH) students[i][SH['Progress%']] = progressPct;
    updated++;
  }

  studentsSh.getRange(2, 1, students.length - 1, students[0].length).setValues(students.slice(1));
  if ('Progress%' in SH && students.length > 1) studentsSh.getRange(2, SH['Progress%'] + 1, students.length - 1, 1).setNumberFormat('0.00');

  logSync_('STUDENT_PROGRESS_REFRESH', `Updated ${updated} student progress rows`);
  return updated;
}

function validateTeacherContacts_() {
  schema_ensureColumns_('TEACHERS', FS_SCHEMA.TEACHERS);
  const sh = getSheet('TEACHERS');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const H = headerIndex(data[0]);
  const issues = [];
  for (let i = 1; i < data.length; i++) {
    const teacherID = String(data[i][H.TeacherID] || '').trim();
    const teacherName = String(data[i][H.TeacherName] || '').trim();
    const teacherEmail = String(data[i][H.TeacherEmail] || '').trim();
    const teacherPhone = String(data[i][H.TeacherPhone] || '').trim();
    const teacherWhatsApp = String(data[i][H.TeacherWhatsApp] || '').trim();
    const label = teacherID || teacherName || `row_${i + 1}`;

    if (!teacherEmail) issues.push(`Missing TeacherEmail for ${label}`);
    if (!teacherPhone && !teacherWhatsApp) issues.push(`Missing both TeacherPhone and TeacherWhatsApp for ${label}`);
  }

  if (!issues.length) logSync_('TEACHER_CONTACT_VALIDATE', 'No missing teacher contacts');
  issues.forEach(issue => logSync_('TEACHER_CONTACT_VALIDATE', issue));
  return issues;
}


function ensureFsControlPanel_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('FS CONTROL PANEL');
  if (!sh) {
    sh = ss.insertSheet('FS CONTROL PANEL');
    logSync_('CONTROL_PANEL', 'Created FS CONTROL PANEL sheet');
  }

  const dashboardSheet = ss.getSheetByName('DASHBOARD');
  const dashboardUrl = dashboardSheet ? `${ss.getUrl()}#gid=${dashboardSheet.getSheetId()}` : '';
  const formRef = getConfig('FORM_ID_OR_URL');
  const attendanceRef = getScriptProperty('FS_ATTENDANCE_FORM_ID', '');

  let attendanceUrl = '';
  if (attendanceRef) {
    try {
      attendanceUrl = `https://docs.google.com/forms/d/${extractFormFileId(attendanceRef)}/edit`;
    } catch (e) {
      attendanceUrl = String(attendanceRef);
    }
  }

  const rows = [
    ['Foundation School Control Panel', ''],
    ['Dashboard link', dashboardUrl],
    ['Registration form link', formRef],
    ['Attendance form link', attendanceUrl],
    ['Setup checklist', ''],
    ['Config set', !!getConfig('FORM_ID_OR_URL') && !!getConfig('SYSTEM_SPREADSHEET_ID')],
    ['Sheets created', true],
    ['Triggers installed', ScriptApp.getProjectTriggers().length > 0],
    ['Dashboard refreshed', !!(dashboardSheet && dashboardSheet.getRange('B2').getValue())],
    ['Note', 'Open Extensions -> Apps Script to access backend']
  ];

  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange('A1:B1').setFontWeight('bold').setBackground('#2B6CB0').setFontColor('#ffffff');
  sh.getRange('A5:B5').setFontWeight('bold');
  sh.setColumnWidth(1, 230);
  sh.setColumnWidth(2, 560);
  sh.setFrozenRows(1);

  logSync_('CONTROL_PANEL', 'Refreshed FS CONTROL PANEL layout');
  return true;
}
