function respond_(ok, data, error) {
  var payload = { ok: !!ok };
  if (ok) payload.data = data;
  else payload.error = String(error || 'Unknown error');
  return payload;
}

function parseTrueTA_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'active';
}

function getSheetDataObjects_(sheetName) {
  var sh = getSheet(sheetName);
  var values = sh.getDataRange().getValues();
  if (!values.length) return { sheet: sh, headers: [], rows: [], objects: [], H: {} };
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var H = headerIndex(headers);
  var objects = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    objects.push({ rowIndex: i + 1, values: row, obj: obj });
  }
  return { sheet: sh, headers: headers, rows: values, objects: objects, H: H };
}

function appendObjectsToSheet_(sheetName, objects) {
  if (!objects || !objects.length) return 0;
  var ctx = getSheetDataObjects_(sheetName);
  var headers = ctx.headers;
  var out = objects.map(function (obj) {
    return headers.map(function (h) { return obj[h] == null ? '' : obj[h]; });
  });
  ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, out.length, headers.length).setValues(out);
  return out.length;
}

function findRowById_(objectsCtx, candidates, value) {
  var want = String(value || '').trim().toLowerCase();
  if (!want) return null;
  for (var i = 0; i < objectsCtx.objects.length; i++) {
    var o = objectsCtx.objects[i];
    for (var c = 0; c < candidates.length; c++) {
      var key = candidates[c];
      var cur = String(o.obj[key] || '').trim().toLowerCase();
      if (cur && cur === want) return o;
    }
  }
  return null;
}

function ensureTeacherAttendanceHeaders_() {
  ensureColumns(getSheet('STUDENTS'), ['ClassOptionID', 'BatchID', 'ApplicantID', 'LastAttendanceAt', 'UpdatedAt']);
  ensureColumns(getSheet('ATTENDANCE_LOG'), [
    'AttendanceID', 'SubmittedAt', 'TeacherID', 'TeacherName', 'ClassOptionID', 'ClassSession', 'ClassDate',
    'PersonID', 'PersonType', 'FullName', 'Email', 'AttendanceStatus', 'FellowshipCode', 'BatchID'
  ]);
}

function normalizeDisplayTimeTA_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  }
  var s = String(value).trim();
  if (!s) return '';
  var mDate = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if ((s.indexOf('1899') >= 0 || s.indexOf('GMT') >= 0 || s.indexOf('UTC') >= 0) && mDate) {
    var h1 = Number(mDate[1]);
    var mi1 = mDate[2];
    var ap1 = h1 >= 12 ? 'PM' : 'AM';
    var hh1 = h1 % 12 || 12;
    return hh1 + ':' + mi1 + ' ' + ap1;
  }
  var m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    return Number(m12[1]) + ':' + (m12[2] || '00') + ' ' + String(m12[3]).toUpperCase();
  }
  var m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    var h2 = Number(m24[1]);
    var mi2 = m24[2];
    var ap2 = h2 >= 12 ? 'PM' : 'AM';
    var hh2 = h2 % 12 || 12;
    return hh2 + ':' + mi2 + ' ' + ap2;
  }
  return s;
}

function toDateOnlyIso_(value) {
  if (!value) return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(value).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getColByCandidates_(headers, candidates) {
  var H = headerIndexLoose(headers);
  for (var i = 0; i < candidates.length; i++) {
    var k = String(candidates[i] || '').replace(/\s+/g, '').toLowerCase();
    if (H[k] != null) return H[k];
  }
  return -1;
}

function getTeacherRecordById_(teacherId) {
  var ctx = getSheetDataObjects_('TEACHERS');
  var idCol = getColByCandidates_(ctx.headers, ['TeacherID']);
  var nameCol = getColByCandidates_(ctx.headers, ['TeacherName', 'Name']);
  var emailCol = getColByCandidates_(ctx.headers, ['TeacherEmail', 'Email']);
  var tzCol = getColByCandidates_(ctx.headers, ['TeacherTimezone', 'Timezone']);
  var activeCol = getColByCandidates_(ctx.headers, ['Active']);
  var want = String(teacherId || '').trim().toLowerCase();
  for (var i = 0; i < ctx.objects.length; i++) {
    var row = ctx.objects[i];
    var curId = String(idCol >= 0 ? row.values[idCol] : '').trim();
    if (!curId || curId.toLowerCase() !== want) continue;
    var isActive = activeCol < 0 ? true : parseTrueTA_(row.values[activeCol]);
    if (!isActive) return null;
    return {
      teacherId: curId,
      fullName: String(nameCol >= 0 ? row.values[nameCol] : '').trim(),
      email: String(emailCol >= 0 ? row.values[emailCol] : '').trim(),
      timezone: String(tzCol >= 0 ? row.values[tzCol] : '').trim() || 'America/Toronto',
      rowIndex: row.rowIndex
    };
  }
  return null;
}

function classOptionForTeacher_(classOptionId, teacherId) {
  var ctx = getSheetDataObjects_('CLASS_OPTIONS');
  var classIdCol = getColByCandidates_(ctx.headers, ['ClassOptionID', 'ClassID']);
  var teacherIdCol = getColByCandidates_(ctx.headers, ['TeacherID']);
  var activeCol = getColByCandidates_(ctx.headers, ['Active']);
  if (classIdCol < 0 || teacherIdCol < 0) return null;
  var wantClass = String(classOptionId || '').trim().toLowerCase();
  var wantTeacher = String(teacherId || '').trim().toLowerCase();
  for (var i = 0; i < ctx.objects.length; i++) {
    var row = ctx.objects[i];
    var curClass = String(row.values[classIdCol] || '').trim();
    var curTeacher = String(row.values[teacherIdCol] || '').trim();
    if (!curClass || !curTeacher) continue;
    if (curClass.toLowerCase() !== wantClass) continue;
    if (curTeacher.toLowerCase() !== wantTeacher) return { mismatch: true };
    if (activeCol >= 0 && !parseTrueTA_(row.values[activeCol])) return { inactive: true };
    return { row: row, headers: ctx.headers, values: row.values };
  }
  return null;
}

function getClassMetaFromRow_(headers, values) {
  return {
    classOptionId: String(values[getColByCandidates_(headers, ['ClassOptionID', 'ClassID'])] || '').trim(),
    teacherId: String(values[getColByCandidates_(headers, ['TeacherID'])] || '').trim(),
    campus: String(values[getColByCandidates_(headers, ['FellowshipCode', 'CampusCode', 'Campus'])] || '').trim(),
    fellowship: String(values[getColByCandidates_(headers, ['FellowshipCode', 'CampusCode'])] || '').trim(),
    day: String(values[getColByCandidates_(headers, ['Day'])] || '').trim(),
    time: normalizeDisplayTimeTA_(values[getColByCandidates_(headers, ['Time'])]),
    batch: String(values[getColByCandidates_(headers, ['BatchID', 'Batch'])] || '').trim(),
    startDate: toDateOnlyIso_(values[getColByCandidates_(headers, ['ClassStartDate', 'StartDate'])])
  };
}

function lookupTeacherForAttendance_(query) {
  var q = String(query || '').trim();
  if (q.length < 2) return [];
  var ql = q.toLowerCase();
  var ctx = getSheetDataObjects_('TEACHERS');
  var idCol = getColByCandidates_(ctx.headers, ['TeacherID']);
  var nameCol = getColByCandidates_(ctx.headers, ['TeacherName', 'Name']);
  var emailCol = getColByCandidates_(ctx.headers, ['TeacherEmail', 'Email']);
  var tzCol = getColByCandidates_(ctx.headers, ['TeacherTimezone', 'Timezone']);
  var subgroupCol = getColByCandidates_(ctx.headers, ['SubGroupLabel', 'Subgroup', 'Campus']);
  var activeCol = getColByCandidates_(ctx.headers, ['Active']);
  var out = [];
  for (var i = 0; i < ctx.objects.length; i++) {
    var r = ctx.objects[i].values;
    if (activeCol >= 0 && !parseTrueTA_(r[activeCol])) continue;
    var teacherId = String(idCol >= 0 ? r[idCol] : '').trim();
    var fullName = String(nameCol >= 0 ? r[nameCol] : '').trim();
    var email = String(emailCol >= 0 ? r[emailCol] : '').trim();
    if (!teacherId || !fullName) continue;
    var rank = -1;
    if (email && email.toLowerCase() === ql) rank = 1;
    else if (teacherId.toLowerCase() === ql) rank = 2;
    else if (fullName.toLowerCase() === ql) rank = 3;
    else if ((fullName && fullName.toLowerCase().indexOf(ql) >= 0) || (email && email.toLowerCase().indexOf(ql) >= 0)) rank = 4;
    if (rank < 0) continue;
    out.push({
      rank: rank,
      teacherId: teacherId,
      fullName: fullName,
      email: email,
      timezone: String(tzCol >= 0 ? r[tzCol] : '').trim() || 'America/Toronto',
      subGroupLabel: String(subgroupCol >= 0 ? r[subgroupCol] : '').trim()
    });
  }
  out.sort(function (a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.fullName.localeCompare(b.fullName);
  });
  return out.map(function (x) {
    return { teacherId: x.teacherId, fullName: x.fullName, email: x.email, timezone: x.timezone, subGroupLabel: x.subGroupLabel };
  });
}

function getTeacherActiveClassOptions_(teacherId) {
  var wantTeacher = String(teacherId || '').trim().toLowerCase();
  if (!wantTeacher) return [];
  var ctx = getSheetDataObjects_('CLASS_OPTIONS');
  var classIdCol = getColByCandidates_(ctx.headers, ['ClassOptionID', 'ClassID']);
  var teacherIdCol = getColByCandidates_(ctx.headers, ['TeacherID']);
  var activeCol = getColByCandidates_(ctx.headers, ['Active']);
  if (classIdCol < 0 || teacherIdCol < 0) return [];

  var studentsCtx = getSheetDataObjects_('STUDENTS');
  var sClassOptionCol = getColByCandidates_(studentsCtx.headers, ['ClassOptionID']);
  var sClassIdCol = getColByCandidates_(studentsCtx.headers, ['ClassID']);
  var sStatusCol = getColByCandidates_(studentsCtx.headers, ['Status']);

  var logCtx = getSheetDataObjects_('ATTENDANCE_LOG');
  var lClassOptionCol = getColByCandidates_(logCtx.headers, ['ClassOptionID', 'ClassID']);
  var lSessionCol = getColByCandidates_(logCtx.headers, ['ClassSession', 'ClassWeek']);

  var submittedMap = {};
  if (lClassOptionCol >= 0 && lSessionCol >= 0) {
    for (var li = 0; li < logCtx.objects.length; li++) {
      var lv = logCtx.objects[li].values;
      var k = String(lv[lClassOptionCol] || '').trim();
      var ss = String(lv[lSessionCol] || '').trim();
      if (!k || !ss) continue;
      submittedMap[k] = submittedMap[k] || {};
      submittedMap[k][ss] = true;
    }
  }

  var out = [];
  for (var i = 0; i < ctx.objects.length; i++) {
    var r = ctx.objects[i].values;
    var cid = String(r[classIdCol] || '').trim();
    var tid = String(r[teacherIdCol] || '').trim();
    if (!cid || !tid || tid.toLowerCase() !== wantTeacher) continue;
    if (activeCol >= 0 && !parseTrueTA_(r[activeCol])) continue;

    var enrolled = 0;
    for (var si = 0; si < studentsCtx.objects.length; si++) {
      var sv = studentsCtx.objects[si].values;
      var scid = '';
      if (sClassOptionCol >= 0) scid = String(sv[sClassOptionCol] || '').trim();
      if (!scid && sClassIdCol >= 0) scid = String(sv[sClassIdCol] || '').trim();
      if (scid !== cid) continue;
      var st = String(sStatusCol >= 0 ? sv[sStatusCol] : '').trim().toLowerCase();
      if (st === 'inactive' || st === 'graduated') continue;
      enrolled++;
    }

    var meta = getClassMetaFromRow_(ctx.headers, r);
    out.push({
      classOptionId: meta.classOptionId,
      teacherId: meta.teacherId,
      campus: meta.campus,
      fellowship: meta.fellowship,
      day: meta.day,
      time: meta.time,
      batch: meta.batch,
      startDate: meta.startDate,
      enrolledCount: enrolled,
      submittedSessions: Object.keys(submittedMap[cid] || {})
    });
  }
  return out;
}

function attendanceAlreadySubmitted_(classOptionId, classSession, classDate) {
  var ctx = getSheetDataObjects_('ATTENDANCE_LOG');
  var classCol = getColByCandidates_(ctx.headers, ['ClassOptionID', 'ClassID']);
  var sessCol = getColByCandidates_(ctx.headers, ['ClassSession', 'ClassWeek']);
  var dateCol = getColByCandidates_(ctx.headers, ['ClassDate', 'AttendanceDate']);
  if (classCol < 0 || sessCol < 0 || dateCol < 0) return false;
  var c = String(classOptionId || '').trim().toLowerCase();
  var s = String(classSession || '').trim().toLowerCase();
  var d = String(toDateOnlyIso_(classDate) || '').trim();
  for (var i = 0; i < ctx.objects.length; i++) {
    var row = ctx.objects[i].values;
    var rc = String(row[classCol] || '').trim().toLowerCase();
    var rs = String(row[sessCol] || '').trim().toLowerCase();
    var rd = toDateOnlyIso_(row[dateCol]);
    if (rc === c && rs === s && rd === d) return true;
  }
  return false;
}

function getStudentProgressColumnForSession_(classSession) {
  var map = {
    Class1: '1_Class',
    Class2: '2_Class',
    Class3: '3_Class',
    Class4A: '4A_Class',
    Class4B: '4B_Class',
    Class5: '5_Class',
    Class6: '6_Class',
    Class7: '7_Class'
  };
  return map[String(classSession || '').trim()] || '';
}

function generateStudentId_() {
  var sh = getSheet('STUDENTS');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return 'STD-0001';
  var H = headerIndex(values[0]);
  var col = H.StudentID;
  if (col == null) return Utilities.getUuid();
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var m = String(values[i][col] || '').trim().match(/^STD-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return 'STD-' + String(max + 1).padStart(4, '0');
}

function isActivePersonStatus_(status) {
  var s = String(status || '').trim().toLowerCase();
  return !(s === 'inactive' || s === 'graduated' || s === 'withdrawn');
}

function loadAttendanceRoster_(teacherId, classOptionId, classSession) {
  var owned = classOptionForTeacher_(classOptionId, teacherId);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');

  var studentsCtx = getSheetDataObjects_('STUDENTS');
  var sIdCol = getColByCandidates_(studentsCtx.headers, ['StudentID']);
  var sClassOptionCol = getColByCandidates_(studentsCtx.headers, ['ClassOptionID']);
  var sClassIdCol = getColByCandidates_(studentsCtx.headers, ['ClassID']);
  var sNameCol = getColByCandidates_(studentsCtx.headers, ['FullName']);
  var sEmailCol = getColByCandidates_(studentsCtx.headers, ['Email']);
  var sStatusCol = getColByCandidates_(studentsCtx.headers, ['Status']);

  var applicantsCtx = getSheetDataObjects_('APPLICANTS');
  var aIdCol = getColByCandidates_(applicantsCtx.headers, ['ApplicantID']);
  var aClassOptionCol = getColByCandidates_(applicantsCtx.headers, ['ClassOptionID']);
  var aClassIdCol = getColByCandidates_(applicantsCtx.headers, ['ClassID']);
  var aNameCol = getColByCandidates_(applicantsCtx.headers, ['FullName', 'FirstName']);
  var aEmailCol = getColByCandidates_(applicantsCtx.headers, ['Email']);
  var aStatusCol = getColByCandidates_(applicantsCtx.headers, ['Status']);

  var out = [];
  var seen = {};

  for (var i = 0; i < studentsCtx.objects.length; i++) {
    var sv = studentsCtx.objects[i].values;
    var scid = String(sClassOptionCol >= 0 ? sv[sClassOptionCol] : '').trim();
    if (!scid && sClassIdCol >= 0) scid = String(sv[sClassIdCol] || '').trim();
    if (scid !== classOptionId) continue;
    var st = String(sStatusCol >= 0 ? sv[sStatusCol] : '').trim();
    if (!isActivePersonStatus_(st)) continue;
    var sid = String(sIdCol >= 0 ? sv[sIdCol] : '').trim();
    if (!sid) continue;
    seen[sid.toLowerCase()] = true;
    out.push({ id: sid, personType: 'Student', fullName: String(sNameCol >= 0 ? sv[sNameCol] : '').trim(), email: String(sEmailCol >= 0 ? sv[sEmailCol] : '').trim(), status: st || 'Active', notes: '' });
  }

  for (var j = 0; j < applicantsCtx.objects.length; j++) {
    var av = applicantsCtx.objects[j].values;
    var acid = String(aClassOptionCol >= 0 ? av[aClassOptionCol] : '').trim();
    if (!acid && aClassIdCol >= 0) acid = String(av[aClassIdCol] || '').trim();
    if (acid !== classOptionId) continue;
    var ast = String(aStatusCol >= 0 ? av[aStatusCol] : '').trim();
    if (!isActivePersonStatus_(ast)) continue;
    var aid = String(aIdCol >= 0 ? av[aIdCol] : '').trim() || ('APPROW-' + applicantsCtx.objects[j].rowIndex);
    if (seen[aid.toLowerCase()]) continue;
    out.push({ id: aid, personType: 'Applicant', fullName: String(aNameCol >= 0 ? av[aNameCol] : '').trim(), email: String(aEmailCol >= 0 ? av[aEmailCol] : '').trim(), status: ast || 'Assigned', notes: '' });
  }

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var already = attendanceAlreadySubmitted_(classOptionId, classSession, today);
  return { data: out, alreadySubmitted: already, previousSubmissionSummary: already ? 'Attendance already exists for today.' : '' };
}

function searchAttendancePerson_(teacherId, classOptionId, query) {
  var owned = classOptionForTeacher_(classOptionId, teacherId);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');
  var q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];

  var out = [];
  var studentsCtx = getSheetDataObjects_('STUDENTS');
  var sId = getColByCandidates_(studentsCtx.headers, ['StudentID']);
  var sName = getColByCandidates_(studentsCtx.headers, ['FullName']);
  var sEmail = getColByCandidates_(studentsCtx.headers, ['Email']);
  var sStatus = getColByCandidates_(studentsCtx.headers, ['Status']);

  for (var i = 0; i < studentsCtx.objects.length; i++) {
    var sv = studentsCtx.objects[i].values;
    var nm = String(sName >= 0 ? sv[sName] : '').trim();
    var em = String(sEmail >= 0 ? sv[sEmail] : '').trim();
    if (nm.toLowerCase().indexOf(q) < 0 && em.toLowerCase().indexOf(q) < 0) continue;
    out.push({ id: String(sId >= 0 ? sv[sId] : '').trim(), personType: 'Student', fullName: nm, email: em, status: String(sStatus >= 0 ? sv[sStatus] : '').trim() || 'Active', notes: '' });
  }

  var applicantsCtx = getSheetDataObjects_('APPLICANTS');
  var aId = getColByCandidates_(applicantsCtx.headers, ['ApplicantID']);
  var aName = getColByCandidates_(applicantsCtx.headers, ['FullName', 'FirstName']);
  var aEmail = getColByCandidates_(applicantsCtx.headers, ['Email']);
  var aStatus = getColByCandidates_(applicantsCtx.headers, ['Status']);
  for (var j = 0; j < applicantsCtx.objects.length; j++) {
    var av = applicantsCtx.objects[j].values;
    var anm = String(aName >= 0 ? av[aName] : '').trim();
    var aem = String(aEmail >= 0 ? av[aEmail] : '').trim();
    if (anm.toLowerCase().indexOf(q) < 0 && aem.toLowerCase().indexOf(q) < 0) continue;
    out.push({ id: String(aId >= 0 ? av[aId] : '').trim() || ('APPROW-' + applicantsCtx.objects[j].rowIndex), personType: 'Applicant', fullName: anm, email: aem, status: String(aStatus >= 0 ? av[aStatus] : '').trim() || 'Registered', notes: '' });
  }

  return out.slice(0, 50);
}

function getTeacherClassProgressGrid_(teacherId, classOptionId) {
  var owned = classOptionForTeacher_(classOptionId, teacherId);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');
  var classMeta = getClassMetaFromRow_(owned.headers, owned.values);

  var progressCols = ['1_Class', '1_Work', '2_Class', '2_Work', '3_Class', '3_Work', '4A_Class', '4A_Work', '4B_Class', '4B_Work', '5_Class', '5_Work', '6_Class', '6_Work', '7_Class', 'EXAM'];

  var studentsCtx = getSheetDataObjects_('STUDENTS');
  var sApplicant = getColByCandidates_(studentsCtx.headers, ['ApplicantID']);
  var sEmail = getColByCandidates_(studentsCtx.headers, ['Email']);
  var sClassOpt = getColByCandidates_(studentsCtx.headers, ['ClassOptionID']);
  var sClassId = getColByCandidates_(studentsCtx.headers, ['ClassID']);
  var sId = getColByCandidates_(studentsCtx.headers, ['StudentID']);
  var sName = getColByCandidates_(studentsCtx.headers, ['FullName']);
  var sStatus = getColByCandidates_(studentsCtx.headers, ['Status']);

  var studentByApplicant = {};
  var studentByEmail = {};
  var assignedStudents = [];
  for (var i = 0; i < studentsCtx.objects.length; i++) {
    var sv = studentsCtx.objects[i].values;
    var status = String(sStatus >= 0 ? sv[sStatus] : '').trim();
    if (!isActivePersonStatus_(status)) continue;
    var appId = String(sApplicant >= 0 ? sv[sApplicant] : '').trim().toLowerCase();
    var email = String(sEmail >= 0 ? sv[sEmail] : '').trim().toLowerCase();
    if (appId) studentByApplicant[appId] = sv;
    if (email) studentByEmail[email] = sv;

    var scid = String(sClassOpt >= 0 ? sv[sClassOpt] : '').trim();
    if (!scid && sClassId >= 0) scid = String(sv[sClassId] || '').trim();
    if (scid !== classOptionId) continue;
    assignedStudents.push(sv);
  }

  var out = [];
  assignedStudents.forEach(function (sv) {
    var row = {
      personType: 'Student',
      studentId: String(sId >= 0 ? sv[sId] : '').trim(),
      fullName: String(sName >= 0 ? sv[sName] : '').trim(),
      email: String(sEmail >= 0 ? sv[sEmail] : '').trim(),
      status: String(sStatus >= 0 ? sv[sStatus] : '').trim() || 'Active'
    };
    progressCols.forEach(function (col) {
      var idx = getColByCandidates_(studentsCtx.headers, [col]);
      row[col] = idx >= 0 ? parseTrueTA_(sv[idx]) : false;
    });
    out.push(row);
  });

  var applicantsCtx = getSheetDataObjects_('APPLICANTS');
  var aId = getColByCandidates_(applicantsCtx.headers, ['ApplicantID']);
  var aClassOpt = getColByCandidates_(applicantsCtx.headers, ['ClassOptionID']);
  var aClassId = getColByCandidates_(applicantsCtx.headers, ['ClassID']);
  var aName = getColByCandidates_(applicantsCtx.headers, ['FullName', 'FirstName']);
  var aEmail = getColByCandidates_(applicantsCtx.headers, ['Email']);
  var aStatus = getColByCandidates_(applicantsCtx.headers, ['Status']);

  for (var j = 0; j < applicantsCtx.objects.length; j++) {
    var av = applicantsCtx.objects[j].values;
    var acid = String(aClassOpt >= 0 ? av[aClassOpt] : '').trim();
    if (!acid && aClassId >= 0) acid = String(av[aClassId] || '').trim();
    if (acid !== classOptionId) continue;
    var ast = String(aStatus >= 0 ? av[aStatus] : '').trim();
    if (!isActivePersonStatus_(ast)) continue;

    var aid = String(aId >= 0 ? av[aId] : '').trim().toLowerCase();
    var aem = String(aEmail >= 0 ? av[aEmail] : '').trim().toLowerCase();
    var linked = (aid && studentByApplicant[aid]) || (aem && studentByEmail[aem]) || null;

    var prow = {
      personType: 'Applicant',
      studentId: linked ? String(linked[sId] || '').trim() : '',
      fullName: String(aName >= 0 ? av[aName] : '').trim(),
      email: String(aEmail >= 0 ? av[aEmail] : '').trim(),
      status: ast || 'Assigned'
    };
    progressCols.forEach(function (col) {
      if (!linked) {
        prow[col] = false;
      } else {
        var idx = getColByCandidates_(studentsCtx.headers, [col]);
        prow[col] = idx >= 0 ? parseTrueTA_(linked[idx]) : false;
      }
    });
    out.push(prow);
  }

  return { classOption: classMeta, students: out };
}

function createOrUpdateStudentFromAttendance_(record, classMeta, teacherName, classSession, now, studentsCtx, applicantsCtx) {
  var studentsSh = studentsCtx.sheet;
  var SH = headerIndex(studentsCtx.headers);
  var sidCol = getColByCandidates_(studentsCtx.headers, ['StudentID']);
  var emailCol = getColByCandidates_(studentsCtx.headers, ['Email']);
  var applicantCol = getColByCandidates_(studentsCtx.headers, ['ApplicantID']);

  var targetRow = null;
  var personId = String(record.personId || '').trim();
  var email = String(record.email || '').trim().toLowerCase();

  if (record.personType === 'Applicant' && applicantCol >= 0 && personId) {
    for (var i = 0; i < studentsCtx.objects.length; i++) {
      var sv = studentsCtx.objects[i].values;
      if (String(sv[applicantCol] || '').trim().toLowerCase() === personId.toLowerCase()) {
        targetRow = studentsCtx.objects[i];
        break;
      }
    }
  }
  if (!targetRow && emailCol >= 0 && email) {
    for (var j = 0; j < studentsCtx.objects.length; j++) {
      var sv2 = studentsCtx.objects[j].values;
      if (String(sv2[emailCol] || '').trim().toLowerCase() === email) {
        targetRow = studentsCtx.objects[j];
        break;
      }
    }
  }

  var sessionCol = getStudentProgressColumnForSession_(classSession);
  if (!sessionCol) return;

  if (targetRow) {
    var v = targetRow.values.slice();
    if (SH[sessionCol] != null) v[SH[sessionCol]] = true;
    if (SH.Status != null) v[SH.Status] = 'Active';
    if (SH.ClassOptionID != null) v[SH.ClassOptionID] = classMeta.classOptionId;
    if (SH.ClassID != null) v[SH.ClassID] = classMeta.classOptionId;
    if (SH.BatchID != null) v[SH.BatchID] = classMeta.batch;
    if (SH.LastAttendanceAt != null) v[SH.LastAttendanceAt] = now;
    if (SH.UpdatedAt != null) v[SH.UpdatedAt] = now;
    if (record.personType === 'Applicant' && SH.ApplicantID != null && !String(v[SH.ApplicantID] || '').trim()) v[SH.ApplicantID] = personId;
    studentsSh.getRange(targetRow.rowIndex, 1, 1, studentsCtx.headers.length).setValues([v]);
    return;
  }

  var newRow = new Array(studentsCtx.headers.length).fill('');
  if (sidCol >= 0) newRow[sidCol] = generateStudentId_();
  if (SH.FullName != null) newRow[SH.FullName] = record.fullName || '';
  if (SH.Email != null) newRow[SH.Email] = record.email || '';
  if (SH.FellowshipCode != null) newRow[SH.FellowshipCode] = classMeta.fellowship || '';
  if (SH.TeacherName != null) newRow[SH.TeacherName] = teacherName || '';
  if (SH.ClassID != null) newRow[SH.ClassID] = classMeta.classOptionId || '';
  if (SH.ClassOptionID != null) newRow[SH.ClassOptionID] = classMeta.classOptionId || '';
  if (SH.BatchID != null) newRow[SH.BatchID] = classMeta.batch || '';
  if (SH.ApplicantID != null && record.personType === 'Applicant') newRow[SH.ApplicantID] = personId;
  if (SH.Status != null) newRow[SH.Status] = 'Active';
  if (SH[sessionCol] != null) newRow[SH[sessionCol]] = true;
  if (SH.LastAttendanceAt != null) newRow[SH.LastAttendanceAt] = now;
  if (SH.UpdatedAt != null) newRow[SH.UpdatedAt] = now;

  studentsSh.getRange(studentsSh.getLastRow() + 1, 1, 1, studentsCtx.headers.length).setValues([newRow]);
}

function submitTeacherAttendance_(payload) {
  ensureTeacherAttendanceHeaders_();

  var teacherId = String(payload.teacherId || '').trim();
  var classOptionId = String(payload.classOptionId || '').trim();
  var classSession = String(payload.classSession || '').trim();
  var classDate = toDateOnlyIso_(payload.classDate);
  var validSessions = { Class1: 1, Class2: 1, Class3: 1, Class4A: 1, Class4B: 1, Class5: 1, Class6: 1, Class7: 1 };

  if (!validSessions[classSession]) throw new Error('Invalid classSession.');
  var teacher = getTeacherRecordById_(teacherId);
  if (!teacher) throw new Error('Teacher not found or inactive.');

  var owned = classOptionForTeacher_(classOptionId, teacherId);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');

  if (attendanceAlreadySubmitted_(classOptionId, classSession, classDate)) {
    throw new Error('Attendance already submitted for this class/session/date.');
  }

  var classMeta = getClassMetaFromRow_(owned.headers, owned.values);
  var records = Array.isArray(payload.records) ? payload.records : [];
  var now = new Date();

  var logRows = [];
  for (var i = 0; i < records.length; i++) {
    var r = records[i] || {};
    logRows.push({
      AttendanceID: Utilities.getUuid(),
      SubmittedAt: now,
      TeacherID: teacherId,
      TeacherName: String(payload.teacherName || teacher.fullName || '').trim(),
      ClassOptionID: classOptionId,
      ClassSession: classSession,
      ClassDate: classDate,
      PersonID: String(r.personId || '').trim(),
      PersonType: String(r.personType || '').trim(),
      FullName: String(r.fullName || '').trim(),
      Email: String(r.email || '').trim(),
      AttendanceStatus: String(r.attendanceStatus || '').trim(),
      FellowshipCode: classMeta.fellowship || '',
      BatchID: classMeta.batch || ''
    });
  }
  appendObjectsToSheet_('ATTENDANCE_LOG', logRows);

  var studentsCtx = getSheetDataObjects_('STUDENTS');
  var applicantsCtx = getSheetDataObjects_('APPLICANTS');
  for (var j = 0; j < records.length; j++) {
    var rec = records[j] || {};
    if (String(rec.attendanceStatus || '').trim().toLowerCase() !== 'present') continue;
    createOrUpdateStudentFromAttendance_(rec, classMeta, String(payload.teacherName || teacher.fullName || '').trim(), classSession, now, studentsCtx, applicantsCtx);
  }

  return {
    attendanceId: Utilities.getUuid(),
    classOptionId: classOptionId,
    classSession: classSession,
    classDate: classDate,
    submittedCount: records.length
  };
}
