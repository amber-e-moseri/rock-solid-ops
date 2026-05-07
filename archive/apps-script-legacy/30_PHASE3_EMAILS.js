/***************************************
 * 30_PHASE3_EMAILS.gs
 ***************************************/

function phase3_setupSheets() {
  ensureSheet(SHEET_TEACHERS, ['TeacherID', 'TeacherName', 'TeacherEmail', 'Active', 'Notes']);
  ensureSheet(SHEET_TEACHER_ROSTER_LOG, ['Key', 'ClassID', 'SendType', 'ClassStartDate', 'TeacherEmail', 'SentAt']);

  uiAlert_('Phase 3 sheets ensured.');
}

function phase3_installTriggers() {
  phase3_removeTriggers();

  ScriptApp.newTrigger('phase3_sendTeacherRosters_').timeBased().everyDays(1).atHour(Number(getConfig('ROSTER_SEND_HOUR'))).create();

  uiAlert_('Phase 3 triggers installed.');
}

function phase3_removeTriggers() {
  const fns = new Set(['phase3_buildEmailQueue_', 'phase3_sendQueuedEmails_', 'phase3_sendTeacherRosters_']);
  ScriptApp.getProjectTriggers().forEach(t => {
    if (fns.has(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
}

function phase3_getTemplates_() {
  const sys = phase3_getSystemTemplates_();
  const local = phase3_getLocalTemplatesIfAny_();
  local.forEach((val, key) => sys.set(key, val));
  return sys;
}

function phase3_getSystemTemplates_() {
  const systemSpreadsheetId = getConfig('SYSTEM_SPREADSHEET_ID');
  if (!systemSpreadsheetId) throw new Error('SYSTEM_SPREADSHEET_ID is blank.');

  const sysSS = SpreadsheetApp.openById(systemSpreadsheetId);
  const templatesSheetName = getConfig('SYSTEM_SHEET_EMAIL_TEMPLATES') || SYSTEM_SHEET_EMAIL_TEMPLATES;
  const sh = sysSS.getSheetByName(templatesSheetName);
  if (!sh) throw new Error(`System sheet "${templatesSheetName}" not found.`);
  return phase3_readTemplatesFromSheet_(sh);
}

function phase3_getLocalTemplatesIfAny_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EMAIL_TEMPLATES_LOCAL);
  if (!sh) return new Map();
  return phase3_readTemplatesFromSheet_(sh);
}

function phase3_readTemplatesFromSheet_(sh) {
  const data = sh.getDataRange().getValues();
  const out = new Map();
  if (data.length < 2) return out;

  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (!key) continue;
    out.set(key, { subject: String(data[i][1] || ''), body: String(data[i][2] || '') });
  }
  return out;
}

function phase3_merge_(tpl, vars) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, function (m, k) {
    return (k in vars) ? String(vars[k] == null ? '' : vars[k]) : '';
  });
}

function phase3_buildTeachersById_() {
  const sh = getSheet(SHEET_TEACHERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return new Map();

  const H = headerIndex(data[0]);
  const out = new Map();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const active = ('Active' in H) ? isTrue(r[H.Active]) : true;
    if (!active) continue;

    const id = String(r[H.TeacherID] || '').trim();
    if (!id) continue;

    out.set(id, {
      teacherName: String(r[H.TeacherName] || '').trim(),
      teacherEmail: String(r[H.TeacherEmail] || '').trim()
    });
  }
  return out;
}

function isClassActive_(row, H) {
  return ('Active' in H) && isTrue(row[H.Active]);
}

function isEnrollmentOpen_(row, H) {
  return ('EnrollmentOpen' in H) && isTrue(row[H.EnrollmentOpen]);
}

function isValidClassRow_(row, H) {
  const classID = String(row[H.ClassID] || '').trim();
  const fc = String(row[H.FellowshipCode] || '').trim();
  const day = String(row[H.Day] || '').trim();
  const time = row[H.Time];
  const teacher = String(row[H.TeacherID] || row[H.TeacherName] || '').trim();
  return classID && fc && day && time && teacher;
}

function phase3_buildClassMetaById_() {
  const sh = getSheet(SHEET_CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return new Map();

  const H = headerIndex(data[0].map(h => String(h || '').trim()));
  if (!('ClassStartDate' in H)) throw new Error('CLASS_OPTIONS is missing column "ClassStartDate" (must be a real Date).');

  const teachersById = phase3_buildTeachersById_();
  const hasTeacherEmail = 'TeacherEmail' in H;
  const out = new Map();

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const active = ('Active' in H) ? isTrue(r[H.Active]) : true;
    if (!active) continue;
    if (!isValidClassRow_(r, H)) continue;

    const fc = normalizeCode(r[H.FellowshipCode]);
    const classId = String(r[H.ClassID] || '').trim();
    if (!fc || !classId) continue;

    const startRaw = r[H.ClassStartDate];
    const classStartDate = startRaw instanceof Date ? startRaw : null;
    if (!classStartDate) continue;

    const teacherId = String(r[H.TeacherID] || '').trim();
    const t = teacherId ? teachersById.get(teacherId) : null;

    out.set(classId, {
      classId: classId,
      fc: fc,
      teacherId: teacherId,
      teacherName: (t && t.teacherName) ? t.teacherName : String(r[H.TeacherName] || '').trim(),
      teacherEmail: (t && t.teacherEmail) ? t.teacherEmail : (hasTeacherEmail ? String(r[H.TeacherEmail] || '').trim() : ''),
      day: normalizeWeekday(r[H.Day]),
      time: formatTime(r[H.Time]),
      classStartDate: classStartDate
    });
  }

  return out;
}

function phase3_ensureCols_(sheet, cols) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const existing = new Set(headers.map(h => String(h || '').trim()));
  const toAdd = cols.filter(c => !existing.has(c));
  if (!toAdd.length) return;
  sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
  toAdd.forEach(c => logSync_('SCHEMA_COLUMN_ADDED', `${sheet.getName()}.${c}`));
}

function phase3_makeQueueRow_(o) {
  return [
    generateUuid(),
    o.type || '',
    o.to || '',
    o.subject || '',
    o.bodyHtml || '',
    o.scheduledAt || '',
    '',
    'Queued',
    '',
    o.respId || '',
    o.classId || '',
    o.fc || ''
  ];
}

function phase3_isActiveStatus_(v) {
  return /^Active$/i.test(String(v || '').trim());
}

function phase3_dateOnly_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function phase3_sameDate_(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function phase3_addDays_(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

function phase3_rosterKey_(classId, sendType, classStartDate) {
  const tz = getConfig('SYSTEM_TIMEZONE') || 'America/Toronto';
  const ds = Utilities.formatDate(classStartDate, tz, 'yyyy-MM-dd');
  return `${classId}__${sendType}__${ds}`;
}

function phase3_rosterAlreadySent_(key) {
  ensureSheet(SHEET_TEACHER_ROSTER_LOG, ['Key', 'ClassID', 'SendType', 'ClassStartDate', 'TeacherEmail', 'SentAt']);
  const sh = getSheet(SHEET_TEACHER_ROSTER_LOG);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return false;

  const H = headerIndex(data[0]);
  const keyCol = ('Key' in H) ? H.Key : 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyCol] || '') === key) return true;
  }
  return false;
}

function phase3_logRosterSent_(key, classId, sendType, classStartDate, teacherEmail) {
  ensureSheet(SHEET_TEACHER_ROSTER_LOG, ['Key', 'ClassID', 'SendType', 'ClassStartDate', 'TeacherEmail', 'SentAt']);
  getSheet(SHEET_TEACHER_ROSTER_LOG).appendRow([key, classId, sendType, classStartDate, teacherEmail, new Date()]);
}

function phase3_buildEmailQueue_() {
  logSync_('PHASE3_BUILD_SKIPPED', 'Confirmation/reminder queueing is disabled; Mailchimp journeys are the source of truth.');
  return { ok: true, skipped: true };
}

function phase3_sendEmail_(to, subject, htmlBody) {
  const email = String(to || '').trim();
  if (!email || email.indexOf('@') === -1) throw new Error('Invalid "to" email: ' + email);

  const subj = String(subject || '').slice(0, 250);
  const plain = String(htmlBody || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const opts = { htmlBody: htmlBody || '', name: getConfig('SENDER_NAME') };

  if (getConfig('REPLY_TO')) opts.replyTo = getConfig('REPLY_TO');
  if (getConfig('SEND_AS')) opts.from = getConfig('SEND_AS');

  GmailApp.sendEmail(email, subj, plain, opts);
}

function phase3_sendQueuedEmails_() {
  logSync_('PHASE3_SEND_SKIPPED', 'Queued confirmation/reminder sending is disabled; Mailchimp journeys are the source of truth.');
  return { ok: true, skipped: true };
}

function phase3_sendTeacherRosters_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSheet(SHEET_TEACHER_ROSTER_LOG, ['Key', 'ClassID', 'SendType', 'ClassStartDate', 'TeacherEmail', 'SentAt']);

    const templates = phase3_getTemplates_();
    const tpl = templates.get(EMAIL_TYPE_TEACHER_ROSTER);
    if (!tpl) throw new Error(`Missing template: ${EMAIL_TYPE_TEACHER_ROSTER}`);

    const classMeta = phase3_buildClassMetaById_();
    const applicants = getSheet(SHEET_APPLICANTS).getDataRange().getValues();
    if (applicants.length < 2) return;

    const A = headerIndex(applicants[0]);
    const byClass = new Map();
    for (let i = 1; i < applicants.length; i++) {
      const r = applicants[i];
      const classId = String(r[A.ClassID] || '').trim();
      if (!classId || !phase3_isActiveStatus_(r[A.Status])) continue;
      if (!byClass.has(classId)) byClass.set(classId, []);
      byClass.get(classId).push({
        fullName: String(r[A.FullName] || ''),
        email: String(r[A.Email] || ''),
        phone: String(r[A.Phone] || ''),
        campus: String(r[A.FellowshipCode] || '')
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    byClass.forEach((people, classId) => {
      const meta = classMeta.get(classId);
      if (!meta || !meta.teacherEmail || !(meta.classStartDate instanceof Date)) return;

      const start = phase3_dateOnly_(meta.classStartDate);
      const tMinus3 = phase3_addDays_(start, -3);
      const isTMinus3 = phase3_sameDate_(today, tMinus3);
      const isDayOf = phase3_sameDate_(today, start);
      if (!isTMinus3 && !isDayOf) return;

      const sendType = isTMinus3 ? ROSTER_SEND_TYPE_T_MINUS_3 : ROSTER_SEND_TYPE_DAY_OF;
      const key = phase3_rosterKey_(classId, sendType, start);
      if (phase3_rosterAlreadySent_(key)) return;

      const rosterTable = phase3_rosterHtmlTable_(people);
      const vars = {
        TeacherName: meta.teacherName || 'Teacher',
        ClassID: classId,
        ClassLabel: `${meta.teacherName} - ${meta.day} ${formatTime(meta.time)}`,
        RosterTable: rosterTable
      };

      phase3_sendEmail_(meta.teacherEmail, phase3_merge_(tpl.subject, vars), phase3_merge_(tpl.body, vars));
      phase3_logRosterSent_(key, classId, sendType, start, meta.teacherEmail);
    });
  } finally {
    lock.releaseLock();
  }
}

function phase3_rosterHtmlTable_(rows) {
  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  const tr = rows.map(r => `<tr><td>${esc(r.fullName)}</td><td>${esc(r.email)}</td><td>${esc(r.phone)}</td><td>${esc(r.campus)}</td></tr>`).join('');
  return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Campus</th></tr></thead><tbody>${tr}</tbody></table>`;
}

function phase3_testBuildQueueOnce() {
  phase3_buildEmailQueue_();
  uiAlert_('Built queue. Check EMAIL_QUEUE.');
}

function phase3_testSendNowOnce() {
  phase3_sendQueuedEmails_();
  uiAlert_('Send run complete. Check EMAIL_QUEUE statuses.');
}

function phase3_testTeacherRosterNow() {
  phase3_sendTeacherRosters_();
  uiAlert_('Roster run complete (sends only if today is T-3 or Day-Of).');
}
