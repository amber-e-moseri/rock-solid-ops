const SCHED_SHEETS_ = {
  FELLOWSHIP_MAP: 'FELLOWSHIP_MAP',
  TEACHERS: 'TEACHERS',
  TEACHER_AVAILABILITY: 'TEACHER_AVAILABILITY',
  CLASS_OPTIONS: 'CLASS_OPTIONS',
  APPLICANTS: 'APPLICANTS',
  CONFIG: 'CONFIG'
};

const SCHED_HEADERS_ = {
  FELLOWSHIP_MAP: ['FellowshipCode', 'CampusName', 'GroupID', 'SubgroupID', 'Active', 'Timezone'],
  TEACHERS: ['TeacherID', 'TeacherName', 'TeacherEmail', 'TeacherTimezone', 'Active'],
  TEACHER_AVAILABILITY: ['AvailabilityID', 'TeacherID', 'CampusCode', 'Month', 'Year', 'TeacherDay', 'TeacherTime', 'Status', 'AdminApproved', 'SubmittedAt', 'UpdatedAt'],
  CLASS_OPTIONS: ['ClassOptionID', 'ClassID', 'FellowshipCode', 'GroupID', 'TeacherID', 'Day', 'Time', 'ClassStartDate', 'Batch', 'Active', 'SourceAvailabilityID', 'CreatedAt', 'UpdatedAt', 'DeactivatedAt', 'Source'],
  APPLICANTS: ['Timestamp'],
  CONFIG: ['Key', 'Value']
};

const SCHED_STATUS_VALUES_ = ['PENDING', 'APPROVED', 'REJECTED', 'CLASS_CREATED', 'USED'];
const SCHED_BOOL_VALUES_ = ['TRUE', 'FALSE'];
const SCHED_DEFAULT_CAPACITY_ = 25;

function teacherAvail_requireHeaders_(headersIndex, required, sheetName) {
  const miss = (required || []).filter(function (k) { return !(k in headersIndex); });
  if (miss.length) throw new Error(`${sheetName} missing required column(s): ${miss.join(', ')}`);
}

function setupSchedulerSheets() {
  const SETUP_KEY = 'SCHED_SETUP_DONE_V1';
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(SETUP_KEY) === '1') return { ok: true, cached: true };

  Object.keys(SCHED_SHEETS_).forEach(function (k) {
    const name = SCHED_SHEETS_[k];
    const headers = SCHED_HEADERS_[k];
    const sh = ensureSheet(name, headers);
    const lastCol = Math.max(sh.getLastColumn(), headers.length);
    const row1 = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    const hasHeaders = headers.every(function (h, i) { return String(row1[i] || '').trim() === h; });
    if (!hasHeaders) {
      if (sh.getLastRow() <= 1) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      else ensureColumns(sh, headers);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F4EFE3');
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    }
  });

  const shA = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const HA = headerIndex(shA.getRange(1, 1, 1, shA.getLastColumn()).getValues()[0]);
  const valStatus = SpreadsheetApp.newDataValidation().requireValueInList(SCHED_STATUS_VALUES_, true).setAllowInvalid(true).build();
  const valBool = SpreadsheetApp.newDataValidation().requireValueInList(SCHED_BOOL_VALUES_, true).setAllowInvalid(true).build();
  shA.getRange(2, HA.Status + 1, shA.getMaxRows() - 1, 1).setDataValidation(valStatus);
  shA.getRange(2, HA.AdminApproved + 1, shA.getMaxRows() - 1, 1).setDataValidation(valBool);

  const shC = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const HC = headerIndex(shC.getRange(1, 1, 1, shC.getLastColumn()).getValues()[0]);
  shC.getRange(2, HC.Active + 1, shC.getMaxRows() - 1, 1).setDataValidation(valBool);

  const shT = getSheet(SCHED_SHEETS_.TEACHERS);
  const HT = headerIndex(shT.getRange(1, 1, 1, shT.getLastColumn()).getValues()[0]);
  const addedTeacherId = !('TeacherID' in HT);
  const addedTeacherTimezone = !('TeacherTimezone' in HT);
  const addedTeacherActive = !('Active' in HT);
  if (addedTeacherId) { shT.insertColumnAfter(shT.getLastColumn()); shT.getRange(1, shT.getLastColumn()).setValue('TeacherID'); }
  if (!('TeacherTimezone' in HT)) {
    const lastCol = shT.getLastColumn();
    shT.insertColumnAfter(lastCol);
    shT.getRange(1, lastCol + 1).setValue('TeacherTimezone');
  }
  if (!('Active' in HT)) {
    const lastCol = shT.getLastColumn();
    shT.insertColumnAfter(lastCol);
    shT.getRange(1, lastCol + 1).setValue('Active');
  }
  const HT2 = headerIndex(shT.getRange(1, 1, 1, shT.getLastColumn()).getValues()[0]);
  if (shT.getLastRow() > 1) {
    const nameCol = sched_findCol_(HT2, ['TeacherName', 'Name']);
    const emailCol = sched_findCol_(HT2, ['TeacherEmail', 'Email']);
    if (addedTeacherId && 'TeacherID' in HT2) {
      const rngId = shT.getRange(2, HT2.TeacherID + 1, shT.getLastRow() - 1, 1);
      const ids = rngId.getValues();
      const names = nameCol >= 0 ? shT.getRange(2, nameCol + 1, shT.getLastRow() - 1, 1).getValues() : [];
      const emails = emailCol >= 0 ? shT.getRange(2, emailCol + 1, shT.getLastRow() - 1, 1).getValues() : [];
      let maxId = 0;
      for (let i = 0; i < ids.length; i++) {
        const m = String(ids[i][0] || '').trim().match(/^TCH-(\d+)$/i);
        if (m) maxId = Math.max(maxId, Number(m[1] || 0));
      }
      for (let i = 0; i < ids.length; i++) {
        const hasTeacherData = String((names[i] && names[i][0]) || '').trim() || String((emails[i] && emails[i][0]) || '').trim();
        if (hasTeacherData && !String(ids[i][0] || '').trim()) ids[i][0] = 'TCH-' + String(++maxId).padStart(3, '0');
      }
      rngId.setValues(ids);
    }
    // TeacherTimezone is intentionally left blank unless known.
    if ('Active' in HT2) {
      const rngA = shT.getRange(2, HT2.Active + 1, shT.getLastRow() - 1, 1);
      const names = nameCol >= 0 ? shT.getRange(2, nameCol + 1, shT.getLastRow() - 1, 1).getValues() : [];
      const emails = emailCol >= 0 ? shT.getRange(2, emailCol + 1, shT.getLastRow() - 1, 1).getValues() : [];
      const avals = rngA.getValues().map(function (r, i) {
        const hasTeacherData = String((names[i] && names[i][0]) || '').trim() || String((emails[i] && emails[i][0]) || '').trim();
        const cur = String(r[0] || '').trim();
        if (!cur && hasTeacherData) return ['TRUE'];
        return [cur];
      });
      rngA.setValues(avals);
    }
  }
  shT.getRange(2, HT2.Active + 1, shT.getMaxRows() - 1, 1).setDataValidation(valBool);

  const shF = getSheet(SCHED_SHEETS_.FELLOWSHIP_MAP);
  const HF = headerIndex(shF.getRange(1, 1, 1, shF.getLastColumn()).getValues()[0]);
  const addedCampusActive = !('Active' in HF);
  const addedCampusTimezone = !('Timezone' in HF);
  if (!('Active' in HF)) {
    shF.insertColumnAfter(shF.getLastColumn());
    shF.getRange(1, shF.getLastColumn()).setValue('Active');
  }
  if (!('Timezone' in HF)) {
    shF.insertColumnAfter(shF.getLastColumn());
    shF.getRange(1, shF.getLastColumn()).setValue('Timezone');
  }
  const HF2 = headerIndex(shF.getRange(1, 1, 1, shF.getLastColumn()).getValues()[0]);
  if (shF.getLastRow() > 1) {
    const codeCol = sched_findCol_(HF2, ['FellowshipCode', 'CampusCode', 'Code']);
    const nameCol = sched_findCol_(HF2, ['CampusName', 'FellowshipName', 'Name']);
    const codes = codeCol >= 0 ? shF.getRange(2, codeCol + 1, shF.getLastRow() - 1, 1).getValues() : [];
    const names = nameCol >= 0 ? shF.getRange(2, nameCol + 1, shF.getLastRow() - 1, 1).getValues() : [];
    if (addedCampusTimezone) {
      const tzRng = shF.getRange(2, HF2.Timezone + 1, shF.getLastRow() - 1, 1);
      const tzVals = tzRng.getValues().map(function (r, i) {
        const hasCampusData = String((codes[i] && codes[i][0]) || '').trim() || String((names[i] && names[i][0]) || '').trim();
        return [String(r[0] || '').trim() || (hasCampusData ? 'America/Toronto' : '')];
      });
      tzRng.setValues(tzVals);
    }
    if ('Active' in HF2) {
      const actRng = shF.getRange(2, HF2.Active + 1, shF.getLastRow() - 1, 1);
      const actVals = actRng.getValues().map(function (r, i) {
        const hasCampusData = String((codes[i] && codes[i][0]) || '').trim() || String((names[i] && names[i][0]) || '').trim();
        const cur = String(r[0] || '').trim();
        if (!cur && hasCampusData) return ['TRUE'];
        return [cur];
      });
      actRng.setValues(actVals);
    }
  }
  shF.getRange(2, HF2.Active + 1, shF.getMaxRows() - 1, 1).setDataValidation(valBool);

  props.setProperty(SETUP_KEY, '1');
  return { ok: true };
}

function resetSchedulerSetupCache_() {
  PropertiesService.getScriptProperties().deleteProperty('SCHED_SETUP_DONE_V1');
  return { ok: true, message: 'Setup cache cleared. Next request will re-run setupSchedulerSheets.' };
}

function sched_isTrue_(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}
function sched_isExplicitFalse_(v) {
  if (v === false) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'false' || s === '0' || s === 'no';
}
function sched_norm_(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function sched_findCol_(H, candidates) {
  const keys = Object.keys(H || {});
  for (let i = 0; i < candidates.length; i++) {
    const want = sched_norm_(candidates[i]).replace(/[\s_]+/g, '');
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const normKey = sched_norm_(key).replace(/[\s_]+/g, '');
      if (normKey === want) return H[key];
    }
  }
  return -1;
}
function sched_monthToIndex_(m) {
  const map = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  return map[String(m || '').trim().toLowerCase()] || 0;
}
function sched_nextId_(prefix, values, colIdx) {
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const m = String(values[i][colIdx] || '').trim().match(new RegExp('^' + prefix + '-(\\d+)$', 'i'));
    if (!m) continue;
    const n = Number(m[1] || 0);
    if (n > max) max = n;
  }
  return prefix + '-' + String(max + 1).padStart(3, '0');
}
function sched_timeToMin_(time12) {
  const m = String(time12 || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = Number(m[1]), mi = Number(m[2]);
  const ap = String(m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + mi;
}
function sched_tzOffsetMs_(instant, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  dtf.formatToParts(instant).forEach(function (x) { p[x.type] = x.value; });
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - instant.getTime();
}
function sched_wallClockToInstant_(y, mo, d, time12, tz) {
  const mins = sched_timeToMin_(time12);
  if (mins < 0) return null;
  const h = Math.floor(mins / 60), mi = mins % 60;
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off1 = sched_tzOffsetMs_(new Date(naive), tz);
  const adj = naive - off1;
  const off2 = sched_tzOffsetMs_(new Date(adj), tz);
  return new Date(off1 === off2 ? adj : adj - off2 + off1);
}
function sched_convertTeacherToCampus_(teacherDay, teacherTime, monthName, yearNum, teacherTz, campusTz) {
  const month = sched_monthToIndex_(monthName);
  if (!month) return { classDay: teacherDay, classTime: teacherTime };
  const weekdayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const target = weekdayMap[String(teacherDay || '').trim()];
  if (target == null) return { classDay: teacherDay, classTime: teacherTime };
  const first = new Date(yearNum, month - 1, 1);
  const dom = 1 + ((target - first.getDay() + 7) % 7);
  const instant = sched_wallClockToInstant_(yearNum, month, dom, teacherTime, teacherTz);
  if (!instant) return { classDay: teacherDay, classTime: teacherTime };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: campusTz, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(instant);
  let day = '', hour = '', minute = '', dayPeriod = '';
  parts.forEach(function (p) {
    if (p.type === 'weekday') day = p.value;
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
    if (p.type === 'dayPeriod') dayPeriod = String(p.value || '').toUpperCase();
  });
  return { classDay: day || teacherDay, classTime: hour && minute ? `${hour}:${minute} ${dayPeriod}` : teacherTime };
}
function sched_datesForWeekdayInMonth_(weekdayName, monthName, yearNum) {
  const month = sched_monthToIndex_(monthName);
  if (!month) return [];

  const weekdayMap = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  const target = weekdayMap[String(weekdayName || '').trim()];
  if (target == null) return [];

  const out = [];
  const d = new Date(yearNum, month - 1, 1);

  while (d.getMonth() === month - 1) {
    if (d.getDay() === target) {
      out.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    }
    d.setDate(d.getDate() + 1);
  }

  return out;
}

function parseIsoDateOnly_(value) {
  if (!value) throw new Error('Missing batch start Sunday');
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Batch Start Sunday must be yyyy-MM-dd');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function assertSunday_(dateOnly) {
  if (dateOnly.getDay() !== 0) throw new Error('Batch Start Sunday must be a Sunday.');
}

function calculateClassStartDateFromBatchSunday_(batchStartSunday, day) {
  const offsets = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const cleanDate = parseIsoDateOnly_(batchStartSunday);
  const offset = offsets[String(day || '').trim()];
  if (offset == null) throw new Error('Invalid class day: ' + day);
  cleanDate.setDate(cleanDate.getDate() + offset);
  return Utilities.formatDate(cleanDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function normalizeTimeText_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  const s = String(value).trim();
  const dateTimeMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(GMT|UTC|[A-Z]{3,})?/i);
  if (s.indexOf('1899') >= 0 && dateTimeMatch) {
    const h = Number(dateTimeMatch[1]);
    const min = dateTimeMatch[2];
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return hour12 + ':' + min + ' ' + suffix;
  }
  const normalTime = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (normalTime) {
    const hour = Number(normalTime[1]);
    const min = normalTime[2] || '00';
    const ampm = normalTime[3].toUpperCase();
    return hour + ':' + min + ' ' + ampm;
  }
  return s;
}

function normalizeDisplayTime_(value) {
  return normalizeTimeText_(value);
}

function teacherAvail_getTeachers_() {
  try {
    const sh = getSheet(SCHED_SHEETS_.TEACHERS);
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];
    const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
    const H = headerIndex(data[0]);
    const idCol = sched_findCol_(H, ['TeacherID']);
    const nameCol = sched_findCol_(H, ['TeacherName', 'Name']);
    const emailCol = sched_findCol_(H, ['TeacherEmail', 'Email']);
    const tzCol = sched_findCol_(H, ['TeacherTimezone', 'Timezone']);
    const activeCol = sched_findCol_(H, ['Active']);
    if (nameCol < 0 || emailCol < 0) return [];
    const out = [];
    let tmpSeq = 1;
    for (let i = 1; i < data.length; i++) {
      const row = data[i] || [];
      if (!String(row.join('') || '').trim()) continue;
      const activeRaw = activeCol >= 0 ? String(row[activeCol] || '').trim() : '';
      const activeNorm = activeRaw.toLowerCase();
      const includeByActive = (
        !activeRaw ||
        activeNorm === 'true' ||
        activeNorm === 'yes' ||
        activeNorm === '1' ||
        activeNorm === 'active'
      );
      const excludeByActive = (
        activeNorm === 'false' ||
        activeNorm === 'no' ||
        activeNorm === '0' ||
        activeNorm === 'inactive'
      );
      if (!includeByActive || excludeByActive) continue;
      const teacherName = String(row[nameCol] || '').trim();
      const teacherEmail = String(row[emailCol] || '').trim();
      const teacherTimezone = tzCol >= 0 ? String(row[tzCol] || '').trim() : '';
      let teacherID = idCol >= 0 ? String(row[idCol] || '').trim() : '';
      if (!teacherID) teacherID = 'TMP-' + String(tmpSeq++).padStart(3, '0');
      if (!teacherName || !teacherEmail) continue;
      out.push({ teacherID: teacherID, teacherName: teacherName, teacherEmail: teacherEmail, teacherTimezone: teacherTimezone });
    }
    return out;
  } catch (e) { throw new Error('teacherAvail_getTeachers_ failed: ' + (e && e.message ? e.message : e)); }
}

function teacherAvail_getCampuses_() {
  try {
    const sh = getSheet(SCHED_SHEETS_.FELLOWSHIP_MAP);
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    const H = headerIndex(data[0]);
    const codeCol = sched_findCol_(H, ['FellowshipCode', 'CampusCode', 'Code']);
    const nameCol = sched_findCol_(H, ['CampusName', 'FellowshipName', 'Name']);
    const groupCol = sched_findCol_(H, ['GroupID', 'Group']);
    const subgroupCol = sched_findCol_(H, ['SubgroupID', 'Subgroup']);
    const activeCol = sched_findCol_(H, ['Active']);
    const tzCol = sched_findCol_(H, ['Timezone', 'CampusTimezone']);
    if (codeCol < 0 || nameCol < 0) return [];
    const stats = {
      sheet: SCHED_SHEETS_.FELLOWSHIP_MAP,
      headersFound: data[0],
      headerMap: H,
      rowsRead: data.length - 1,
      included: 0,
      skipped: 0,
      reasons: {}
    };
    const out = [];
    for (let i = 1; i < data.length; i++) {
      const activeRaw = activeCol >= 0 ? String(data[i][activeCol] || '').trim() : '';
      const activeNorm = activeRaw.toLowerCase();
      const isActive = (
        !activeRaw ||
        activeNorm === 'true' ||
        activeNorm === 'yes' ||
        activeNorm === '1' ||
        activeNorm === 'active'
      );
      const isInactive = (
        activeNorm === 'false' ||
        activeNorm === 'no' ||
        activeNorm === '0' ||
        activeNorm === 'inactive'
      );
      if (!isActive || isInactive) {
        stats.skipped++;
        stats.reasons.inactive = (stats.reasons.inactive || 0) + 1;
        continue;
      }
      const code = normalizeCode(data[i][codeCol]);
      const campusName = String(data[i][nameCol] || '').trim();
      if (!code) {
        stats.skipped++;
        stats.reasons.missingFellowshipCode = (stats.reasons.missingFellowshipCode || 0) + 1;
        continue;
      }
      if (!campusName) {
        stats.skipped++;
        stats.reasons.missingCampusName = (stats.reasons.missingCampusName || 0) + 1;
        continue;
      }
      out.push({
        code: code,
        campusName: campusName,
        groupID: groupCol >= 0 ? String(data[i][groupCol] || '').trim() : '',
        subgroupID: subgroupCol >= 0 ? String(data[i][subgroupCol] || '').trim() : '',
        timezone: tzCol >= 0 ? (String(data[i][tzCol] || '').trim() || 'America/Toronto') : 'America/Toronto'
      });
      stats.included++;
    }
    out.sort(function (a, b) { return String(a.campusName).localeCompare(String(b.campusName)); });
    Logger.log(JSON.stringify({
      sheet: stats.sheet,
      headersFound: stats.headersFound,
      headerMap: stats.headerMap,
      rowsRead: stats.rowsRead,
      included: stats.included,
      skipped: stats.skipped,
      reasons: stats.reasons,
      sample: out.slice(0, 5)
    }));
    return out;
  } catch (e) { throw new Error('teacherAvail_getCampuses_ failed: ' + (e && e.message ? e.message : e)); }
}

function sched_teacherInitials_(teacherName) {
  const parts = String(teacherName || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ? String(parts[0]).charAt(0).toUpperCase() : 'X';
  const last = parts.length > 1 ? String(parts[parts.length - 1]).charAt(0).toUpperCase() : 'X';
  return first + last;
}

function sched_nextTeacherIdForPrefix_(data, idCol, prefix) {
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const cur = String(data[i][idCol] || '').trim();
    const m = cur.match(new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{3})$', 'i'));
    if (!m) continue;
    max = Math.max(max, Number(m[1] || 0));
  }
  return prefix + String(max + 1).padStart(3, '0');
}

function upsertTeacherFromAvailability_(teacher, options) {
  setupSchedulerSheets();
  const opts = options || {};
  const createIfMissing = opts.createIfMissing !== false;
  const firstCampusCode = normalizeCode(opts.firstCampusCode || '');
  const teacherName = String((teacher && teacher.teacherName) || '').trim();
  const teacherEmail = String((teacher && teacher.teacherEmail) || '').trim();
  const teacherTimezone = String((teacher && teacher.teacherTimezone) || '').trim() || 'America/Toronto';
  if (!teacherName || !teacherEmail) throw new Error('Teacher name and email are required.');
  const nEmail = sched_norm_(teacherEmail);

  const sh = getSheet(SCHED_SHEETS_.TEACHERS);
  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0]);
  const idCol = sched_findCol_(H, ['TeacherID']);
  const nameCol = sched_findCol_(H, ['TeacherName', 'Name']);
  const emailCol = sched_findCol_(H, ['TeacherEmail', 'Email']);
  const tzCol = sched_findCol_(H, ['TeacherTimezone', 'Timezone']);
  const activeCol = sched_findCol_(H, ['Active']);
  if (nameCol < 0 || emailCol < 0) throw new Error('TEACHERS must include TeacherName and TeacherEmail columns.');
  for (let i = 1; i < data.length; i++) {
    if (sched_norm_(data[i][emailCol]) !== nEmail) continue;
    let id = idCol >= 0 ? String(data[i][idCol] || '').trim() : '';
    if (!id && idCol >= 0) {
      if (createIfMissing) {
        const prefix = (firstCampusCode || 'TCH') + '_' + sched_teacherInitials_(teacherName) + '_';
        id = sched_nextTeacherIdForPrefix_(data, idCol, prefix);
        sh.getRange(i + 1, idCol + 1).setValue(id);
      } else {
        Logger.log(JSON.stringify({ teacherLookup: 'found_without_id', teacherEmail: teacherEmail, created: false }));
        return '';
      }
    }
    if (String(data[i][nameCol] || '').trim() !== teacherName) sh.getRange(i + 1, nameCol + 1).setValue(teacherName);
    if (createIfMissing && tzCol >= 0 && !String(data[i][tzCol] || '').trim()) {
      sh.getRange(i + 1, tzCol + 1).setValue(teacherTimezone);
    }
    if (activeCol >= 0) sh.getRange(i + 1, activeCol + 1).setValue('TRUE');
    Logger.log(JSON.stringify({ teacherLookup: 'found_existing', teacherEmail: teacherEmail, teacherID: id, created: false }));
    return id;
  }
  if (!createIfMissing) {
    Logger.log(JSON.stringify({ teacherLookup: 'not_found', teacherEmail: teacherEmail, created: false }));
    return '';
  }
  const nextId = idCol >= 0
    ? sched_nextTeacherIdForPrefix_(data, idCol, (firstCampusCode || 'TCH') + '_' + sched_teacherInitials_(teacherName) + '_')
    : 'TMP-' + Date.now();
  const row = new Array(data[0].length).fill('');
  if (idCol >= 0) row[idCol] = nextId;
  row[nameCol] = teacherName;
  row[emailCol] = teacherEmail;
  if (tzCol >= 0) row[tzCol] = teacherTimezone;
  if (activeCol >= 0) row[activeCol] = 'TRUE';
  sh.appendRow(row);
  Logger.log(JSON.stringify({ teacherLookup: 'created_new', teacherEmail: teacherEmail, teacherID: nextId, created: true }));
  return nextId;
}

function debugTeachers_() {
  const ss = getFoundationSpreadsheet_();
  const sh = getSheet(SCHED_SHEETS_.TEACHERS);
  const lastRow = sh.getLastRow();
  const lastColumn = sh.getLastColumn();
  const maxRows = sh.getMaxRows();
  const maxColumns = sh.getMaxColumns();
  const data = (lastRow > 0 && lastColumn > 0) ? sh.getRange(1, 1, lastRow, lastColumn).getValues() : [];
  if (data.length < 2) {
    return {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheetNames: ss.getSheets().map(function (s) { return s.getName(); }),
      selectedSheetName: sh.getName(),
      lastRow: lastRow,
      lastColumn: lastColumn,
      maxRows: maxRows,
      maxColumns: maxColumns,
      headers: data[0] || [],
      normalizedHeaderMap: data[0] ? headerIndexLoose(data[0]) : {},
      rowsRead: 0,
      rowsIncluded: 0,
      rowsSkipped: 0,
      skippedReasons: {},
      sampleTeachers: []
    };
  }
  const H = headerIndex(data[0]);
  const HLoose = headerIndexLoose(data[0]);
  const idCol = sched_findCol_(H, ['TeacherID']);
  const nameCol = sched_findCol_(H, ['TeacherName', 'Name']);
  const emailCol = sched_findCol_(H, ['TeacherEmail', 'Email']);
  const tzCol = sched_findCol_(H, ['TeacherTimezone', 'Timezone']);
  const activeCol = sched_findCol_(H, ['Active']);
  let included = 0;
  const skipped = {};
  const sampleTeachers = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!String((r || []).join('') || '').trim()) { skipped.blankRow = (skipped.blankRow || 0) + 1; continue; }
    const activeRaw = activeCol >= 0 ? String(r[activeCol] || '').trim() : '';
    const activeNorm = activeRaw.toLowerCase();
    const includeByActive = (
      !activeRaw ||
      activeNorm === 'true' ||
      activeNorm === 'yes' ||
      activeNorm === '1' ||
      activeNorm === 'active'
    );
    const excludeByActive = (
      activeNorm === 'false' ||
      activeNorm === 'no' ||
      activeNorm === '0' ||
      activeNorm === 'inactive'
    );
    if (!includeByActive || excludeByActive) { skipped.explicitlyInactive = (skipped.explicitlyInactive || 0) + 1; continue; }
    if (nameCol < 0 || !String(r[nameCol] || '').trim()) { skipped.missingName = (skipped.missingName || 0) + 1; continue; }
    if (emailCol < 0 || !String(r[emailCol] || '').trim()) { skipped.missingEmail = (skipped.missingEmail || 0) + 1; continue; }
    included++;
    if (sampleTeachers.length < 5) {
      sampleTeachers.push({
        teacherID: idCol >= 0 ? String(r[idCol] || '').trim() : '',
        teacherName: String(r[nameCol] || '').trim(),
        teacherEmail: String(r[emailCol] || '').trim(),
        teacherTimezone: tzCol >= 0 ? String(r[tzCol] || '').trim() : '',
        active: activeRaw
      });
    }
  }
  const skippedTotal = Object.keys(skipped).reduce(function (a, k) { return a + skipped[k]; }, 0);
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetNames: ss.getSheets().map(function (s) { return s.getName(); }),
    selectedSheetName: sh.getName(),
    lastRow: lastRow,
    lastColumn: lastColumn,
    maxRows: maxRows,
    maxColumns: maxColumns,
    headers: data[0],
    normalizedHeaderMap: HLoose,
    rowsRead: data.length - 1,
    rowsIncluded: included,
    rowsSkipped: skippedTotal,
    skippedReasons: skipped,
    sampleTeachers: sampleTeachers
  };
}

function debugCampuses_() {
  const ss = getFoundationSpreadsheet_();
  const sh = getSheet(SCHED_SHEETS_.FELLOWSHIP_MAP);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) {
    return {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheetNames: ss.getSheets().map(function (s) { return s.getName(); }),
      fellowshipMapLastRow: sh.getLastRow(),
      headers: data[0] || [],
      first5Rows: [],
      rowsRead: 0,
      rowsIncluded: 0,
      rowsSkipped: 0,
      skippedReasons: {}
    };
  }
  const H = headerIndex(data[0]);
  const codeCol = sched_findCol_(H, ['FellowshipCode']);
  const nameCol = sched_findCol_(H, ['CampusName', 'FellowshipName', 'Name']);
  const activeCol = sched_findCol_(H, ['Active']);
  let included = 0;
  const skipped = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (activeCol >= 0 && sched_isExplicitFalse_(r[activeCol])) { skipped.explicitlyInactive = (skipped.explicitlyInactive || 0) + 1; continue; }
    if (codeCol < 0 || !String(r[codeCol] || '').trim()) { skipped.missingCode = (skipped.missingCode || 0) + 1; continue; }
    if (nameCol < 0 || !String(r[nameCol] || '').trim()) { skipped.missingName = (skipped.missingName || 0) + 1; continue; }
    included++;
  }
  const skippedTotal = Object.keys(skipped).reduce(function (a, k) { return a + skipped[k]; }, 0);
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetNames: ss.getSheets().map(function (s) { return s.getName(); }),
    fellowshipMapLastRow: sh.getLastRow(),
    headers: data[0],
    first5Rows: data.slice(1, 6),
    rowsRead: data.length - 1,
    rowsIncluded: included,
    rowsSkipped: skippedTotal,
    skippedReasons: skipped
  };
}

// ADD TO 99_MENU.js Teacher Availability submenu:
// .addItem('Fix teachers sheet (run once)', 'fixTeachersSheet_')
function fixTeachersSheet_() {
  setupSchedulerSheets();
  const sh = getSheet(SCHED_SHEETS_.TEACHERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { rowsFixed: 0, timezonesDefaulted: 0, activatedRows: 0 };
  const H = headerIndex(data[0]);
  const idCol = sched_findCol_(H, ['TeacherID']);
  const nameCol = sched_findCol_(H, ['TeacherName', 'Name']);
  const emailCol = sched_findCol_(H, ['TeacherEmail', 'Email']);
  const tzCol = sched_findCol_(H, ['TeacherTimezone', 'Timezone']);
  const activeCol = sched_findCol_(H, ['Active']);

  let rowsFixed = 0;
  let timezonesDefaulted = 0;
  let activatedRows = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const origId = idCol >= 0 ? String(row[idCol] == null ? '' : row[idCol]) : '';
    const origName = nameCol >= 0 ? String(row[nameCol] == null ? '' : row[nameCol]) : '';
    const origEmail = emailCol >= 0 ? String(row[emailCol] == null ? '' : row[emailCol]) : '';
    const trimmedId = origId.trim();
    const trimmedName = origName.trim();
    const trimmedEmail = origEmail.trim();
    const hasTeacherData = !!(trimmedName || trimmedEmail);
    let changed = false;

    if (idCol >= 0 && origId !== trimmedId) { row[idCol] = trimmedId; changed = true; }
    if (nameCol >= 0 && origName !== trimmedName) { row[nameCol] = trimmedName; changed = true; }
    if (emailCol >= 0 && origEmail !== trimmedEmail) { row[emailCol] = trimmedEmail; changed = true; }

    if (tzCol >= 0) {
      const tz = String(row[tzCol] == null ? '' : row[tzCol]).trim();
      if (!tz && hasTeacherData) {
        row[tzCol] = 'America/Toronto';
        timezonesDefaulted++;
        changed = true;
      }
    }

    if (activeCol >= 0) {
      const active = String(row[activeCol] == null ? '' : row[activeCol]).trim();
      if (!active && hasTeacherData) {
        row[activeCol] = 'TRUE';
        activatedRows++;
        changed = true;
      }
    }

    if (changed) rowsFixed++;
  }

  sh.getRange(2, 1, data.length - 1, data[0].length).setValues(data.slice(1));
  return { rowsFixed: rowsFixed, timezonesDefaulted: timezonesDefaulted, activatedRows: activatedRows };
}

function teacherAvail_loadAvailability_(context) {
  setupSchedulerSheets();
  const req = context || {};
  const month = String(req.month || '').trim();
  const year = Number(req.year || 0);
  const teacherEmail = String(req.teacherEmail || '').trim();
  if (!month || !year || !teacherEmail) return [];

  const teacherID = upsertTeacherFromAvailability_({
    teacherName: String(req.teacherName || teacherEmail).trim(),
    teacherEmail: teacherEmail,
    teacherTimezone: String(req.teacherTimezone || 'America/Toronto').trim()
  }, { createIfMissing: false });
  if (!teacherID) return [];
  const sh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const H = headerIndex(data[0]);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[H.TeacherID] || '').trim() !== teacherID) continue;
    if (String(r[H.Month] || '').trim() !== month) continue;
    if (Number(r[H.Year] || 0) !== year) continue;
    out.push({
      availabilityID: String(r[H.AvailabilityID] || '').trim(),
      campusCode: String(r[H.CampusCode] || '').trim(),
      teacherDay: String(r[H.TeacherDay] || '').trim(),
      teacherTime: String(r[H.TeacherTime] || '').trim(),
      status: String(r[H.Status] || '').trim(),
      adminApproved: sched_isTrue_(r[H.AdminApproved])
    });
  }
  return out;
}

function submitTeacherAvailability_(body) {
  setupSchedulerSheets();
  const req = body || {};
  const teacherName = String(req.teacherName || '').trim();
  const teacherEmail = String(req.teacherEmail || '').trim();
  const teacherTimezone = String(req.teacherTimezone || '').trim() || 'America/Toronto';
  const month = String(req.month || '').trim();
  const year = Number(req.year || 0);
  const slots = Array.isArray(req.slots) ? req.slots : [];
  if (!teacherName || !teacherEmail || !teacherTimezone || !month || !year || !slots.length) {
    throw new Error('teacherName, teacherEmail, teacherTimezone, month, year, and slots are required.');
  }
  const firstCampusCode = normalizeCode((slots[0] && slots[0].campusCode) || '');
  const teacherID = upsertTeacherFromAvailability_(
    { teacherName: teacherName, teacherEmail: teacherEmail, teacherTimezone: teacherTimezone },
    { createIfMissing: true, firstCampusCode: firstCampusCode }
  );

  const campusSet = {};
  teacherAvail_getCampuses_().forEach(function (c) { campusSet[normalizeCode(c.code)] = true; });
  const sh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  let data = sh.getDataRange().getValues();
  let H = headerIndex(data[0]);

  const deletable = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[H.TeacherID] || '').trim() !== teacherID) continue;
    if (String(r[H.Month] || '').trim() !== month) continue;
    if (Number(r[H.Year] || 0) !== year) continue;
    const st = String(r[H.Status] || '').trim().toUpperCase();
    if (st === 'PENDING' || st === 'REJECTED') deletable.push(i + 1);
  }
  deletable.sort(function (a, b) { return b - a; }).forEach(function (rowNum) { sh.deleteRow(rowNum); });

  data = sh.getDataRange().getValues();
  H = headerIndex(data[0]);
  const rows = [];
  const now = new Date();
  const idSeed = Date.now();
  Logger.log(JSON.stringify({ selectedCampusCodes: slots.map(function (s) { return normalizeCode((s && s.campusCode) || ''); }).filter(Boolean), teacherID: teacherID }));
  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s] || {};
    const campusCode = normalizeCode(slot.campusCode || '');
    const teacherDay = String(slot.teacherDay || '').trim();
    const teacherTime = String(slot.teacherTime || '').trim();
    if (!campusCode || !teacherDay || !teacherTime || !campusSet[campusCode]) continue;
    rows.push(['AVL-' + (idSeed + s), teacherID, campusCode, month, year, teacherDay, teacherTime, 'PENDING', 'FALSE', now, now]);
  }
  if (!rows.length) throw new Error('No valid slots to insert.');
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, SCHED_HEADERS_.TEACHER_AVAILABILITY.length).setValues(rows);
  return { teacherID: teacherID, inserted: rows.length };
}

function syncApprovedAvailabilityToClassOptions(batchStartSunday) {
  setupSchedulerSheets();
  const avSh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const av = avSh.getDataRange().getValues();
  if (av.length < 2) return { created: 0, updated: 0, skipped: 0, errors: [] };
  const AH = headerIndex(av[0]);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const batchStart = String(batchStartSunday || '').trim();

  let needsSync = false;
  for (let i = 1; i < av.length; i++) {
    const row = av[i];
    if (sched_isTrue_(row[AH.AdminApproved]) && String(row[AH.Status] || '').trim().toUpperCase() === 'APPROVED') {
      needsSync = true;
      break;
    }
  }
  if (needsSync && !batchStart) {
    throw new Error('Please select the Batch Start Sunday before syncing approved class options.');
  }

  for (let i = 1; i < av.length; i++) {
    const row = av[i];
    if (!(sched_isTrue_(row[AH.AdminApproved]) && String(row[AH.Status] || '').trim().toUpperCase() === 'APPROVED')) continue;
    const sourceId = String(row[AH.AvailabilityID] || '').trim();
    if (!sourceId) { skipped++; continue; }
    try {
      const res = createOrUpdateClassOptionFromAvailability_(sourceId, { batchStartSunday: batchStart });
      if (res && res.created) created++;
      else updated++;
      if ('UpdatedAt' in AH) avSh.getRange(i + 1, AH.UpdatedAt + 1).setValue(new Date());
    } catch (err) {
      skipped++;
      errors.push({ availabilityId: sourceId, error: String((err && err.message) || err || 'Unknown sync error') });
    }
  }
  return { created: created, updated: updated, skipped: skipped, errors: errors };
}

function getScheduledClasses(filters) {
  const f = filters || {};
  const campusCode = normalizeCode(f.campusCode || '');
  const groupID = String(f.groupID || '').trim();
  const teacherID = String(f.teacherID || '').trim();
  const month = String(f.month || '').trim();
  const year = Number(f.year || 0);
  const activeOnly = String(f.activeOnly || '').trim().toLowerCase() !== 'false';

  const clSh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const cl = clSh.getDataRange().getValues();
  if (cl.length < 2) return { classes: [] };
  const CH = headerIndex(cl[0]);
  const campBy = {};
  teacherAvail_getCampuses_().forEach(function (c) { campBy[normalizeCode(c.code)] = c; });
  const teacherBy = {};
  teacherAvail_getTeachers_().forEach(function (t) { teacherBy[String(t.teacherID || '').trim()] = t; });

  const classIdCol = sched_findCol_(CH, ['ClassID', 'ClassOptionID']);
  const fellowshipCodeCol = sched_findCol_(CH, ['FellowshipCode']);
  const groupIdCol = sched_findCol_(CH, ['GroupID']);
  const teacherIdCol = sched_findCol_(CH, ['TeacherID']);
  const dayCol = sched_findCol_(CH, ['Day']);
  const timeCol = sched_findCol_(CH, ['Time']);
  const classStartDateCol = sched_findCol_(CH, ['ClassStartDate']);
  const batchCol = sched_findCol_(CH, ['Batch']);
  const activeCol = sched_findCol_(CH, ['Active']);
  const out = [];
  for (let i = 1; i < cl.length; i++) {
    const r = cl[i];
    const cc = fellowshipCodeCol >= 0 ? normalizeCode(r[fellowshipCodeCol]) : '';
    const gg = groupIdCol >= 0 ? String(r[groupIdCol] || '').trim() : '';
    const tt = teacherIdCol >= 0 ? String(r[teacherIdCol] || '').trim() : '';
    const act = activeCol >= 0 ? sched_isTrue_(r[activeCol]) : true;
    if (activeOnly && !act) continue;
    if (campusCode && campusCode !== cc) continue;
    if (groupID && groupID !== gg) continue;
    if (teacherID && teacherID !== tt) continue;
    if (month || year) {
      const batch = batchCol >= 0 ? String(r[batchCol] || '').trim() : '';
      if (month && batch && batch.toLowerCase().indexOf(String(month).toLowerCase()) !== 0) continue;
      if (year && batch && batch.toLowerCase().indexOf(String(year).toLowerCase()) < 0) continue;
    }
    const c = campBy[cc] || {};
    const t = teacherBy[tt] || {};
    const rawTime = timeCol >= 0 ? r[timeCol] : '';
    const timeVal = rawTime instanceof Date ? Utilities.formatDate(rawTime, Session.getScriptTimeZone(), 'h:mm a') : String(rawTime || '').trim();
    const rawDate = classStartDateCol >= 0 ? r[classStartDateCol] : '';
    const dateVal = rawDate instanceof Date ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(rawDate || '').trim();
    out.push({
      classOptionID: classIdCol >= 0 ? String(r[classIdCol] || '').trim() : '',
      classID: classIdCol >= 0 ? String(r[classIdCol] || '').trim() : '',
      campusCode: cc,
      campusName: String(c.campusName || ''),
      groupID: gg,
      teacherID: tt,
      teacherName: String(t.teacherName || ''),
      teacherEmail: String(t.teacherEmail || ''),
      teacherTimezone: String(t.teacherTimezone || ''),
      classDate: dateVal,
      classDay: dayCol >= 0 ? String(r[dayCol] || '').trim() : '',
      classTime: timeVal,
      timezone: String(c.timezone || 'America/Toronto'),
      batch: batchCol >= 0 ? String(r[batchCol] || '').trim() : '',
      active: act
    });
  }
  return { classes: out };
}

function getCampusSchedule(campusCode, month, year) {
  return getScheduledClasses({ campusCode: campusCode, month: month, year: year, activeOnly: true });
}

function getScheduledClassConflicts_(campusCodesCsv) {
  const codes = String(campusCodesCsv || '')
    .split(',')
    .map(function (x) { return normalizeCode(x); })
    .filter(Boolean);
  const codeSet = {};
  codes.forEach(function (c) { codeSet[c] = true; });

  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const H = headerIndex(data[0]);
  const codeCol = sched_findCol_(H, ['FellowshipCode', 'CampusCode', 'Code']);
  const classIdCol = sched_findCol_(H, ['ClassID', 'ClassOptionID', 'Value']);
  const teacherIdCol = sched_findCol_(H, ['TeacherID']);
  const dayCol = sched_findCol_(H, ['Day']);
  const timeCol = sched_findCol_(H, ['Time']);
  const activeCol = sched_findCol_(H, ['Active']);
  const classStartDateCol = sched_findCol_(H, ['ClassStartDate']);
  const batchIdCol = sched_findCol_(H, ['Batch']);
  const teacherBy = {};
  teacherAvail_getTeachers_().forEach(function (t) { teacherBy[String(t.teacherID || '').trim()] = t; });

  const stats = { selectedCampusCodes: codes, rowsRead: data.length - 1, included: 0, skipped: 0, reasons: {} };
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const code = codeCol >= 0 ? normalizeCode(r[codeCol]) : '';
    if (!code || (codes.length && !codeSet[code])) { stats.skipped++; stats.reasons.campusFiltered = (stats.reasons.campusFiltered || 0) + 1; continue; }

    const activeRaw = activeCol >= 0 ? String(r[activeCol] || '').trim() : '';
    const activeNorm = activeRaw.toLowerCase();
    const includeByActive = (!activeRaw || activeNorm === 'true' || activeNorm === 'yes' || activeNorm === '1' || activeNorm === 'active');
    const excludeByActive = (activeNorm === 'false' || activeNorm === 'no' || activeNorm === '0' || activeNorm === 'inactive');
    if (!includeByActive || excludeByActive) { stats.skipped++; stats.reasons.inactive = (stats.reasons.inactive || 0) + 1; continue; }

    const classId = classIdCol >= 0 ? String(r[classIdCol] || '').trim() : '';
    const day = dayCol >= 0 ? String(r[dayCol] || '').trim() : '';
    const rawTime = timeCol >= 0 ? r[timeCol] : '';
    const time = rawTime instanceof Date ? Utilities.formatDate(rawTime, Session.getScriptTimeZone(), 'h:mm a') : String(rawTime || '').trim();
    if (!classId || !day || !time) { stats.skipped++; stats.reasons.missingCore = (stats.reasons.missingCore || 0) + 1; continue; }
    const rawDate = classStartDateCol >= 0 ? r[classStartDateCol] : '';
    const classStartDate = rawDate instanceof Date ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(rawDate || '').trim();
    const teacherId = teacherIdCol >= 0 ? String(r[teacherIdCol] || '').trim() : '';
    const teacherName = String((teacherBy[teacherId] && teacherBy[teacherId].teacherName) || '').trim();
    out.push({
      fellowshipCode: code,
      classId: classId,
      teacherId: teacherId,
      teacherName: teacherName,
      day: day,
      time: time,
      classStartDate: classStartDate,
      batchId: batchIdCol >= 0 ? String(r[batchIdCol] || '').trim() : '',
      label: 'Already scheduled: ' + code + ' ' + classId + ' with ' + (teacherName || 'Teacher')
    });
    stats.included++;
  }
  Logger.log(JSON.stringify({ conflictDebug: stats, sample: out.slice(0, 5) }));
  return out;
}

function getSchedulesForCampuses(campusCodesCsv, month, year) {
  const codes = String(campusCodesCsv || '')
    .split(',')
    .map(function (x) { return normalizeCode(x); })
    .filter(Boolean);
  const codeSet = {};
  codes.forEach(function (c) { codeSet[c] = true; });
  const out = {};
  codes.forEach(function (c) { out[c] = []; });
  if (!codes.length) return out;

  const mFilter = String(month || '').trim();
  const yFilter = Number(year || 0);
  const clSh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const cl = clSh.getDataRange().getValues();
  if (cl.length < 2) return out;
  const CH = headerIndex(cl[0]);
  const codeCol = sched_findCol_(CH, ['FellowshipCode']);
  const activeCol = sched_findCol_(CH, ['Active']);
  const batchCol = sched_findCol_(CH, ['Batch']);
  const dayCol = sched_findCol_(CH, ['Day']);
  const timeCol = sched_findCol_(CH, ['Time']);
  const dateCol = sched_findCol_(CH, ['ClassStartDate']);

  for (let i = 1; i < cl.length; i++) {
    const r = cl[i];
    const code = codeCol >= 0 ? normalizeCode(r[codeCol]) : '';
    if (!codeSet[code]) continue;
    if (activeCol >= 0 && !sched_isTrue_(r[activeCol])) continue;

    if (mFilter || yFilter) {
      const b = batchCol >= 0 ? String(r[batchCol] || '').trim() : '';
      if (mFilter && b && b.toLowerCase().indexOf(mFilter.toLowerCase()) !== 0) continue;
      if (yFilter && b && b.toLowerCase().indexOf(String(yFilter).toLowerCase()) < 0) continue;
    }

    const rawTime = timeCol >= 0 ? r[timeCol] : '';
    const timeVal = rawTime instanceof Date ? Utilities.formatDate(rawTime, Session.getScriptTimeZone(), 'h:mm a') : String(rawTime || '').trim();
    const rawDate = dateCol >= 0 ? r[dateCol] : '';
    const dateVal = rawDate instanceof Date ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(rawDate || '').trim();
    out[code].push({
      classDay: dayCol >= 0 ? String(r[dayCol] || '').trim() : '',
      classTime: timeVal,
      classDate: dateVal,
      batch: batchCol >= 0 ? String(r[batchCol] || '').trim() : ''
    });
  }
  return out;
}

function getGroupSchedule(groupID, subgroupID, month, year) {
  const res = getScheduledClasses({ groupID: groupID, subgroupID: subgroupID, month: month, year: year, activeOnly: true });
  res.classes.sort(function (a, b) {
    return String(a.subgroupID).localeCompare(String(b.subgroupID)) ||
      String(a.campusCode).localeCompare(String(b.campusCode)) ||
      String(a.classDay).localeCompare(String(b.classDay)) ||
      sched_timeToMin_(a.classTime) - sched_timeToMin_(b.classTime);
  });
  return res;
}

function teacherAvail_ensureReviewColumns_() {
  const avSh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  ensureColumns(avSh, [
    'AvailabilityID', 'TeacherID', 'CampusCode', 'Month', 'Year',
    'TeacherDay', 'TeacherTime', 'Status', 'AdminApproved', 'SubmittedAt', 'UpdatedAt',
    'TeacherName', 'TeacherEmail', 'TeacherTimezone', 'AdminNotes', 'ReviewedBy', 'ApprovedAt', 'RecordID'
  ]);
  const clSh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  ensureColumns(clSh, [
    'ClassOptionID', 'ClassID', 'FellowshipCode', 'GroupID', 'TeacherID', 'Day', 'Time',
    'ClassStartDate', 'Batch', 'Active', 'SourceAvailabilityID', 'CreatedAt', 'UpdatedAt',
    'DeactivatedAt', 'Source'
  ]);
}

function findAvailabilityRowByRecordId_(recordId) {
  teacherAvail_ensureReviewColumns_();
  const key = String(recordId || '').trim();
  if (!key) return null;
  const sh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return null;
  const H = headerIndex(data[0]);
  const idCol = sched_findCol_(H, ['AvailabilityID', 'RecordID']);
  if (idCol < 0) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol] || '').trim() === key) return { sh: sh, data: data, H: H, rowNum: i + 1, row: data[i] };
  }
  return null;
}

function findClassOptionByAvailabilityRecordId_(recordId) {
  teacherAvail_ensureReviewColumns_();
  const key = String(recordId || '').trim();
  if (!key) return null;
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return null;
  const H = headerIndex(data[0]);
  const srcCol = sched_findCol_(H, ['SourceAvailabilityID']);
  if (srcCol < 0) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][srcCol] || '').trim() === key) return { sh: sh, data: data, H: H, rowNum: i + 1, row: data[i] };
  }
  return null;
}

function removeClassOptionByAvailabilityId_(availabilityId) {
  const key = String(availabilityId || '').trim();
  if (!key) return 0;
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;
  const H = headerIndex(data[0]);
  const sourceCol = sched_findCol_(H, ['SourceAvailabilityID']);
  if (sourceCol < 0) throw new Error('CLASS_OPTIONS missing SourceAvailabilityID column');
  let removed = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][sourceCol] || '').trim() === key) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

function generateClassOptionId_() {
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0] || []);
  const idCol = sched_findCol_(H, ['ClassOptionID', 'ClassID']);
  if (idCol < 0) return 'CLS-' + Date.now();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][idCol] || '').trim().match(/^CLS-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  if (!max) return 'CLS-' + Date.now();
  return 'CLS-' + String(max + 1);
}

function createOrUpdateClassOptionFromAvailability_(recordId, options) {
  teacherAvail_ensureReviewColumns_();
  const opts = options || {};
  const batchStartSunday = String(opts.batchStartSunday || '').trim();
  if (!batchStartSunday) throw new Error('Please select the Batch Start Sunday before approving class options.');
  const sunday = parseIsoDateOnly_(batchStartSunday);
  assertSunday_(sunday);
  const avRef = findAvailabilityRowByRecordId_(recordId);
  if (!avRef) throw new Error('Availability record not found: ' + recordId);
  const av = avRef.row;
  const AH = avRef.H;
  const teacherID = String(av[sched_findCol_(AH, ['TeacherID'])] || '').trim();
  const teacherName = String(av[sched_findCol_(AH, ['TeacherName'])] || '').trim();
  const fellowshipCode = normalizeCode(av[sched_findCol_(AH, ['CampusCode', 'FellowshipCode'])] || '');
  const day = String(av[sched_findCol_(AH, ['TeacherDay', 'Day', 'ClassDay'])] || '').trim();
  const time = normalizeDisplayTime_(av[sched_findCol_(AH, ['TeacherTime', 'Time', 'ClassTime'])]);
  const batchFromAvailability = String(av[sched_findCol_(AH, ['BatchID', 'Batch'])] || '').trim();
  const batch = batchFromAvailability || Utilities.formatDate(sunday, Session.getScriptTimeZone(), 'MMMM yyyy');
  const classStartDate = calculateClassStartDateFromBatchSunday_(batchStartSunday, day);

  if (!teacherID) throw new Error('Cannot create class option: TeacherID is blank');
  if (!fellowshipCode) throw new Error('Cannot create class option: FellowshipCode/CampusCode is blank');
  if (!day) throw new Error('Cannot create class option: TeacherDay is blank');
  if (!time) throw new Error('Cannot create class option: TeacherTime is blank');
  if (!classStartDate) throw new Error('Cannot create class option: ClassStartDate is blank');
  if (!batchStartSunday) throw new Error('Cannot create class option: batchStartSunday is blank');
  const campusByCode = {};
  teacherAvail_getCampuses_().forEach(function (c) { campusByCode[normalizeCode(c.code)] = c; });
  const groupID = String((campusByCode[fellowshipCode] && campusByCode[fellowshipCode].groupID) || '').trim();

  const clSh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const clData = clSh.getDataRange().getValues();
  const CH = headerIndex(clData[0] || []);
  const sourceId = String(recordId || '').trim();

  let existing = findClassOptionByAvailabilityRecordId_(sourceId);

  const map = {};
  function setIf(colNames, value) {
    const idx = sched_findCol_(CH, colNames);
    if (idx >= 0) map[idx] = value;
  }
  const existingId = existing ? String(existing.row[sched_findCol_(CH, ['ClassOptionID', 'ClassID'])] || '').trim() : '';
  const classId = existingId || generateClassOptionId_();
  setIf(['ClassOptionID'], classId);
  setIf(['ClassID'], classId);
  setIf(['SourceAvailabilityID'], sourceId);
  setIf(['TeacherID'], teacherID);
  setIf(['TeacherName'], teacherName);
  setIf(['FellowshipCode'], fellowshipCode);
  setIf(['GroupID'], groupID);
  setIf(['Day'], day);
  setIf(['Time'], time);
  setIf(['ClassStartDate'], classStartDate);
  setIf(['BatchID'], batch);
  setIf(['Batch'], batch);
  setIf(['Active'], 'TRUE');
  setIf(['DeactivatedAt'], '');
  setIf(['UpdatedAt'], new Date());
  setIf(['Source'], 'TeacherAvailabilityAdminReview');

  if (existing) {
    Object.keys(map).forEach(function (k) { existing.sh.getRange(existing.rowNum, Number(k) + 1).setValue(map[k]); });
    return { ok: true, created: false, classOptionId: map[sched_findCol_(CH, ['ClassOptionID', 'ClassID'])] };
  }

  const newRow = new Array(clData[0].length).fill('');
  Object.keys(map).forEach(function (k) { newRow[Number(k)] = map[k]; });
  const createdAtCol = sched_findCol_(CH, ['CreatedAt']);
  if (createdAtCol >= 0 && !newRow[createdAtCol]) newRow[createdAtCol] = new Date();
  clSh.appendRow(newRow);
  return { ok: true, created: true, classOptionId: map[sched_findCol_(CH, ['ClassOptionID', 'ClassID'])] };
}

function deactivateClassOptionForAvailability_(recordId) {
  teacherAvail_ensureReviewColumns_();
  const key = String(recordId || '').trim();
  if (!key) return { ok: true, deactivated: false, classOptionId: '' };
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, deactivated: false, classOptionId: '' };
  const H = headerIndex(data[0]);
  const srcCol = sched_findCol_(H, ['SourceAvailabilityID']);
  if (srcCol < 0) throw new Error('CLASS_OPTIONS missing SourceAvailabilityID column');
  const activeCol = sched_findCol_(H, ['Active']);
  const updatedAtCol = sched_findCol_(H, ['UpdatedAt']);
  const deactivatedAtCol = sched_findCol_(H, ['DeactivatedAt']);
  const idCol = sched_findCol_(H, ['ClassOptionID', 'ClassID']);
  let touched = 0;
  let firstId = '';
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][srcCol] || '').trim() !== key) continue;
    if (!firstId && idCol >= 0) firstId = String(data[i][idCol] || '').trim();
    if (activeCol >= 0) sh.getRange(i + 1, activeCol + 1).setValue('FALSE');
    if (deactivatedAtCol >= 0) sh.getRange(i + 1, deactivatedAtCol + 1).setValue(new Date());
    if (updatedAtCol >= 0) sh.getRange(i + 1, updatedAtCol + 1).setValue(new Date());
    touched++;
  }
  return { ok: true, deactivated: touched > 0, classOptionId: firstId };
}

function loadTeacherAvailabilityForReview(filters) {
  teacherAvail_ensureReviewColumns_();
  const f = filters || {};
  const monthFilter = String(f.month || '').trim();
  const yearFilter = Number(f.year || 0);
  const teacherFilter = String(f.teacher || '').trim().toLowerCase();
  const campusFilter = normalizeCode(f.campusCode || '');
  const statusFilter = String(f.status || '').trim().toUpperCase();
  const groupFilter = String(f.groupId || '').trim().toUpperCase();

  const sh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, rows: [], summary: { total: 0, pending: 0, approved: 0, rejected: 0 } };
  const H = headerIndex(data[0]);
  const teachersById = {};
  teacherAvail_getTeachers_().forEach(function (t) { teachersById[String(t.teacherID || '').trim()] = t; });
  const campusesByCode = {};
  const groupsSet = {};
  teacherAvail_getCampuses_().forEach(function (c) {
    const code = normalizeCode(c.code || '');
    const g = String(c.groupID || '').trim();
    campusesByCode[code] = {
      fellowshipCode: code,
      campusCode: code,
      campusName: String(c.campusName || '').trim(),
      fellowshipName: String(c.campusName || '').trim(),
      groupId: g,
      timezone: String(c.timezone || 'America/Toronto').trim() || 'America/Toronto'
    };
    if (g) groupsSet[g] = true;
  });
  const rows = [];
  const counts = { total: 0, pending: 0, approved: 0, rejected: 0 };
  const scriptTz = Session.getScriptTimeZone() || 'America/Toronto';
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!String((r || []).join('') || '').trim()) continue;
    const teacherID = String(r[sched_findCol_(H, ['TeacherID'])] || '').trim();
    const t = teachersById[teacherID] || {};
    const teacherName = String(r[sched_findCol_(H, ['TeacherName'])] || t.teacherName || '').trim();
    const teacherEmail = String(r[sched_findCol_(H, ['TeacherEmail'])] || t.teacherEmail || '').trim();
    const teacherTimezone = String(r[sched_findCol_(H, ['TeacherTimezone'])] || t.teacherTimezone || '').trim();
    const campusCode = normalizeCode(r[sched_findCol_(H, ['CampusCode'])] || '');
    const campusMeta = campusesByCode[campusCode] || {
      fellowshipCode: campusCode,
      campusCode: campusCode,
      campusName: campusCode,
      fellowshipName: campusCode,
      groupId: '',
      timezone: 'America/Toronto'
    };
    const month = String(r[sched_findCol_(H, ['Month'])] || '').trim();
    const year = Number(r[sched_findCol_(H, ['Year'])] || 0);
    const dayRaw = r[sched_findCol_(H, ['TeacherDay'])];
    const day = dayRaw instanceof Date
      ? Utilities.formatDate(dayRaw, scriptTz, 'EEEE')
      : String(dayRaw || '').trim();
    const timeRaw = r[sched_findCol_(H, ['TeacherTime'])];
    const time = timeRaw instanceof Date
      ? Utilities.formatDate(timeRaw, scriptTz, 'h:mm a')
      : String(timeRaw || '').trim();
    const status = String(r[sched_findCol_(H, ['Status'])] || 'PENDING').trim().toUpperCase() || 'PENDING';
    const recordId = String(r[sched_findCol_(H, ['AvailabilityID', 'RecordID'])] || '').trim();

    if (monthFilter && month !== monthFilter) continue;
    if (yearFilter && year !== yearFilter) continue;
    if (teacherFilter && !(teacherName.toLowerCase().indexOf(teacherFilter) >= 0 || teacherID.toLowerCase().indexOf(teacherFilter) >= 0 || teacherEmail.toLowerCase().indexOf(teacherFilter) >= 0)) continue;
    if (campusFilter && campusCode !== campusFilter) continue;
    if (groupFilter && groupFilter !== 'ALL' && String(campusMeta.groupId || '').toUpperCase() !== groupFilter) continue;
    if (statusFilter && status !== statusFilter) continue;
    counts.total++;
    if (status === 'APPROVED') counts.approved++;
    else if (status === 'REJECTED') counts.rejected++;
    else counts.pending++;
    rows.push({
      recordId: recordId,
      teacherId: teacherID,
      teacherName: teacherName,
      teacherEmail: teacherEmail,
      teacherTimezone: teacherTimezone,
      campusCode: campusCode,
      fellowshipCode: campusMeta.fellowshipCode,
      campusName: campusMeta.campusName,
      fellowshipName: campusMeta.fellowshipName,
      groupId: campusMeta.groupId,
      timezone: campusMeta.timezone,
      month: month,
      year: year,
      day: day,
      time: time,
      status: status,
      adminNotes: String(r[sched_findCol_(H, ['AdminNotes', 'Notes'])] || '').trim(),
      reviewedBy: String(r[sched_findCol_(H, ['ReviewedBy'])] || '').trim(),
      submittedAt: (function () {
        const v = r[sched_findCol_(H, ['SubmittedAt'])];
        return v instanceof Date ? Utilities.formatDate(v, scriptTz, 'yyyy-MM-dd HH:mm') : String(v || '').trim();
      })(),
      approvedAt: (function () {
        const v = r[sched_findCol_(H, ['ApprovedAt'])];
        return v instanceof Date ? Utilities.formatDate(v, scriptTz, 'yyyy-MM-dd HH:mm') : String(v || '').trim();
      })()
    });
  }
  rows.sort(function (a, b) {
    const ga = String(a.groupId || '').toUpperCase();
    const gb = String(b.groupId || '').toUpperCase();
    const ca = String(a.campusName || a.campusCode || '').toUpperCase();
    const cb = String(b.campusName || b.campusCode || '').toUpperCase();
    const da = String(a.day || '');
    const db = String(b.day || '');
    const ta = sched_timeToMin_(String(a.time || ''));
    const tb = sched_timeToMin_(String(b.time || ''));
    const na = String(a.teacherName || '').toUpperCase();
    const nb = String(b.teacherName || '').toUpperCase();
    if (groupFilter && groupFilter !== 'ALL') {
      return ca.localeCompare(cb) || da.localeCompare(db) || (ta - tb) || na.localeCompare(nb);
    }
    return ga.localeCompare(gb) || ca.localeCompare(cb) || da.localeCompare(db) || (ta - tb) || na.localeCompare(nb);
  });
  return { ok: true, rows: rows, groups: Object.keys(groupsSet).sort(), summary: counts, source: 'live' };
}

function updateTeacherAvailabilityStatus(recordId, status, notes, reviewedBy, batchStartSunday) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
  teacherAvail_ensureReviewColumns_();
  const ref = findAvailabilityRowByRecordId_(recordId);
  if (!ref) return { ok: false, error: 'record not found' };
  const H = ref.H;
  const normStatus = String(status || '').trim().toUpperCase();
  if (['PENDING', 'APPROVED', 'REJECTED'].indexOf(normStatus) < 0) return { ok: false, error: 'invalid status' };
  const now = new Date();

  let syncResult = { ok: true, classOptionId: '' };
  if (normStatus === 'APPROVED') {
    const batch = String(batchStartSunday || '').trim();
    if (!batch) return { ok: false, error: 'Please select the Batch Start Sunday before approving class options.' };
    try {
      syncResult = createOrUpdateClassOptionFromAvailability_(recordId, { batchStartSunday: batch });
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err || 'Class option creation failed') };
    }
    ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['Status']) + 1).setValue('APPROVED');
    if (sched_findCol_(H, ['AdminApproved']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['AdminApproved']) + 1).setValue('TRUE');
    if (sched_findCol_(H, ['ApprovedAt']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['ApprovedAt']) + 1).setValue(now);
    if (sched_findCol_(H, ['UpdatedAt']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['UpdatedAt']) + 1).setValue(now);
    if (sched_findCol_(H, ['AdminNotes', 'Notes']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['AdminNotes', 'Notes']) + 1).setValue(String(notes || '').trim());
    if (sched_findCol_(H, ['ReviewedBy']) >= 0 && reviewedBy) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['ReviewedBy']) + 1).setValue(String(reviewedBy || '').trim());
  } else {
    ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['Status']) + 1).setValue(normStatus);
    if (sched_findCol_(H, ['UpdatedAt']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['UpdatedAt']) + 1).setValue(now);
    if (sched_findCol_(H, ['AdminApproved']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['AdminApproved']) + 1).setValue('FALSE');
    if (sched_findCol_(H, ['AdminNotes', 'Notes']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['AdminNotes', 'Notes']) + 1).setValue(String(notes || '').trim());
    if (sched_findCol_(H, ['ReviewedBy']) >= 0 && reviewedBy) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['ReviewedBy']) + 1).setValue(String(reviewedBy || '').trim());
    if (sched_findCol_(H, ['ApprovedAt']) >= 0) ref.sh.getRange(ref.rowNum, sched_findCol_(H, ['ApprovedAt']) + 1).setValue('');
    if (normStatus === 'REJECTED' || normStatus === 'PENDING') syncResult = deactivateClassOptionForAvailability_(recordId);
  }

  return {
    ok: true,
    recordId: recordId,
    status: normStatus,
    classOptionSynced: !!(syncResult && syncResult.ok),
    classOptionId: String((syncResult && syncResult.classOptionId) || '')
  };
  } finally {
    lock.releaseLock();
  }
}

function repairApprovedAvailabilityMissingClassOptions(batchStartSunday) {
  teacherAvail_ensureReviewColumns_();
  const batch = String(batchStartSunday || '').trim();
  if (!batch) throw new Error('Please select the Batch Start Sunday before repairing class options.');
  const sunday = parseIsoDateOnly_(batch);
  assertSunday_(sunday);

  const sh = getSheet(SCHED_SHEETS_.TEACHER_AVAILABILITY);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, created: 0, skipped: 0, errors: [] };
  const H = headerIndex(data[0]);
  const idCol = sched_findCol_(H, ['AvailabilityID', 'RecordID']);
  const statusCol = sched_findCol_(H, ['Status']);
  const approvedCol = sched_findCol_(H, ['AdminApproved']);

  let created = 0;
  let skipped = 0;
  const errors = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[statusCol] || '').trim().toUpperCase();
    const isApproved = approvedCol >= 0 ? sched_isTrue_(row[approvedCol]) : false;
    if (!(status === 'APPROVED' && isApproved)) continue;
    const availabilityId = String(row[idCol] || '').trim();
    if (!availabilityId) { skipped++; continue; }
    const existing = findClassOptionByAvailabilityRecordId_(availabilityId);
    if (existing) { skipped++; continue; }
    try {
      const res = createOrUpdateClassOptionFromAvailability_(availabilityId, { batchStartSunday: batch });
      if (res && res.ok) created++;
      else skipped++;
    } catch (err) {
      errors.push({ availabilityId: availabilityId, error: String((err && err.message) || err || 'Repair failed') });
    }
  }
  return { ok: true, created: created, skipped: skipped, errors: errors };
}

function resetTeacherAvailabilityStatus(recordId) {
  return updateTeacherAvailabilityStatus(recordId, 'PENDING', '', '');
}

function bulkApproveTeacherAvailability(teacherId, month, year, reviewedBy, batchStartSunday) {
  const rows = loadTeacherAvailabilityForReview({ teacher: teacherId, month: month, year: year, status: 'PENDING' }).rows || [];
  let approved = 0;
  rows.forEach(function (r) {
    const res = updateTeacherAvailabilityStatus(r.recordId, 'APPROVED', r.adminNotes || '', reviewedBy || '', batchStartSunday);
    if (res && res.ok) approved++;
  });
  return { ok: true, approved: approved, teacherId: teacherId, month: month, year: year };
}

function bulkApproveCampusAvailability(campusCode, month, year, reviewedBy, batchStartSunday) {
  const rows = loadTeacherAvailabilityForReview({ campusCode: campusCode, month: month, year: year, status: 'PENDING' }).rows || [];
  let approved = 0;
  rows.forEach(function (r) {
    const res = updateTeacherAvailabilityStatus(r.recordId, 'APPROVED', r.adminNotes || '', reviewedBy || '', batchStartSunday);
    if (res && res.ok) approved++;
  });
  return { ok: true, approved: approved, campusCode: campusCode, month: month, year: year };
}

function cloneTeacherAvailabilityCampus(recordId, campusCode) {
  teacherAvail_ensureReviewColumns_();
  const src = findAvailabilityRowByRecordId_(recordId);
  if (!src) return { ok: false, error: 'record not found' };
  const code = normalizeCode(campusCode || '');
  if (!code) return { ok: false, error: 'campusCode required' };
  const H = src.H;
  const row = new Array(src.data[0].length).fill('');
  const now = new Date();
  const newId = 'AVL-' + Date.now();
  row[sched_findCol_(H, ['AvailabilityID', 'RecordID'])] = newId;
  row[sched_findCol_(H, ['TeacherID'])] = src.row[sched_findCol_(H, ['TeacherID'])];
  row[sched_findCol_(H, ['CampusCode'])] = code;
  row[sched_findCol_(H, ['Month'])] = src.row[sched_findCol_(H, ['Month'])];
  row[sched_findCol_(H, ['Year'])] = src.row[sched_findCol_(H, ['Year'])];
  row[sched_findCol_(H, ['TeacherDay'])] = src.row[sched_findCol_(H, ['TeacherDay'])];
  row[sched_findCol_(H, ['TeacherTime'])] = src.row[sched_findCol_(H, ['TeacherTime'])];
  row[sched_findCol_(H, ['Status'])] = 'PENDING';
  row[sched_findCol_(H, ['AdminApproved'])] = 'FALSE';
  row[sched_findCol_(H, ['SubmittedAt'])] = now;
  row[sched_findCol_(H, ['UpdatedAt'])] = now;
  if (sched_findCol_(H, ['TeacherName']) >= 0) row[sched_findCol_(H, ['TeacherName'])] = src.row[sched_findCol_(H, ['TeacherName'])];
  if (sched_findCol_(H, ['TeacherEmail']) >= 0) row[sched_findCol_(H, ['TeacherEmail'])] = src.row[sched_findCol_(H, ['TeacherEmail'])];
  if (sched_findCol_(H, ['TeacherTimezone']) >= 0) row[sched_findCol_(H, ['TeacherTimezone'])] = src.row[sched_findCol_(H, ['TeacherTimezone'])];
  if (sched_findCol_(H, ['AdminNotes']) >= 0) row[sched_findCol_(H, ['AdminNotes'])] = '';
  if (sched_findCol_(H, ['ReviewedBy']) >= 0) row[sched_findCol_(H, ['ReviewedBy'])] = '';
  if (sched_findCol_(H, ['ApprovedAt']) >= 0) row[sched_findCol_(H, ['ApprovedAt'])] = '';
  src.sh.appendRow(row);
  return { ok: true, recordId: newId, campusCode: code };
}

function deactivateClassOptionsForMonth_(month, year) {
  teacherAvail_ensureReviewColumns_();
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, updated: 0, month: month, year: year, campuses: 0 };
  const H = headerIndex(data[0]);
  const batchCol = sched_findCol_(H, ['Batch']);
  const activeCol = sched_findCol_(H, ['Active']);
  const deactivatedAtCol = sched_findCol_(H, ['DeactivatedAt']);
  const updatedAtCol = sched_findCol_(H, ['UpdatedAt']);
  const campusCol = sched_findCol_(H, ['FellowshipCode']);
  let updated = 0;
  const campusSet = {};
  const targetBatch = String(month + ' ' + Number(year || 0)).trim();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const rowBatch = batchCol >= 0 ? String(r[batchCol] || '').trim() : '';
    if (targetBatch && rowBatch !== targetBatch) continue;
    if (activeCol >= 0 && !sched_isTrue_(r[activeCol])) continue;
    if (activeCol >= 0) sh.getRange(i + 1, activeCol + 1).setValue('FALSE');
    if (deactivatedAtCol >= 0) sh.getRange(i + 1, deactivatedAtCol + 1).setValue(new Date());
    if (updatedAtCol >= 0) sh.getRange(i + 1, updatedAtCol + 1).setValue(new Date());
    updated++;
    if (campusCol >= 0) campusSet[normalizeCode(r[campusCol] || '')] = true;
  }
  return { ok: true, updated: updated, month: month, year: Number(year || 0), campuses: Object.keys(campusSet).filter(Boolean).length };
}

function deactivatePreviousMonthClassOptions(currentMonth, currentYear) {
  const monthIdx = sched_monthToIndex_(currentMonth);
  const yearNum = Number(currentYear || 0);
  if (!monthIdx || !yearNum) return { ok: false, error: 'currentMonth and currentYear are required' };
  const prevIdx = monthIdx === 1 ? 12 : monthIdx - 1;
  const prevYear = monthIdx === 1 ? yearNum - 1 : yearNum;
  const prevMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][prevIdx - 1];
  return deactivateClassOptionsForMonth_(prevMonth, prevYear);
}

function removeDeprecatedClassOptionsColumns_() {
  const deprecated = [
    'CampusCode',
    'TeacherEmail',
    'TeacherTimezone',
    'ClassDay',
    'ClassTime',
    'ClassDate',
    'Month',
    'Year',
    'ClassName'
  ];
  const sh = getSheet(SCHED_SHEETS_.CLASS_OPTIONS);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return { ok: true, removed: [], missing: deprecated };
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  const toDelete = [];
  const removed = [];
  const missing = [];
  for (let i = 0; i < deprecated.length; i++) {
    const name = deprecated[i];
    const idx = headers.indexOf(name);
    if (idx >= 0) {
      toDelete.push(idx + 1); // 1-based
      removed.push(name);
    } else {
      missing.push(name);
    }
  }
  toDelete.sort(function (a, b) { return b - a; }).forEach(function (col) { sh.deleteColumn(col); });
  return { ok: true, removed: removed, missing: missing };
}
