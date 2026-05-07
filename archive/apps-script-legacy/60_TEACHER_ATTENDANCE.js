function ta_respond_(ok, data, error) {
  var out = { ok: !!ok };
  if (ok) out.data = data;
  else out.error = String(error || 'Unknown error');
  return out;
}

function ta_parseTrue_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'active';
}

function ta_sheetObjects_(name) {
  var sh = getSheet(name);
  var vals = sh.getDataRange().getValues();
  if (!vals.length) return { sheet: sh, headers: [], rows: [], H: {}, objects: [] };
  var headers = vals[0].map(function (h) { return String(h || '').trim(); });
  var H = headerIndex(headers);
  var objects = [];
  for (var i = 1; i < vals.length; i++) objects.push({ rowIndex: i + 1, values: vals[i] });
  return { sheet: sh, headers: headers, rows: vals, H: H, objects: objects };
}

function ta_repoKey_(name) {
  return String(name || '').trim().toUpperCase();
}

function ta_repoContext_() {
  return { repos: {} };
}

function ta_getRepo_(ctx, name) {
  var target = ctx || ta_repoContext_();
  var key = ta_repoKey_(name);
  if (!target.repos[key]) {
    var repo = ta_sheetObjects_(key);
    repo.HLoose = headerIndexLoose(repo.headers || []);
    target.repos[key] = repo;
  }
  return target.repos[key];
}

function ta_colRepo_(repo, candidates) {
  var H = (repo && repo.HLoose) || {};
  for (var i = 0; i < candidates.length; i++) {
    var k = String(candidates[i] || '').replace(/\s+/g, '').toLowerCase();
    if (H[k] != null) return H[k];
  }
  return -1;
}

function ta_col_(headers, candidates) {
  var H = headerIndexLoose(headers || []);
  for (var i = 0; i < candidates.length; i++) {
    var k = String(candidates[i] || '').replace(/\s+/g, '').toLowerCase();
    if (H[k] != null) return H[k];
  }
  return -1;
}

function ta_time_(value) {
  if (typeof normalizeDisplayTime_ === 'function') return normalizeDisplayTime_(value);
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  var s = String(value || '').trim();
  return s;
}

function ta_date_(value) {
  if (!value) return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  throw new Error('Invalid classDate');
}

function ta_uuid_() { return Utilities.getUuid(); }
function ta_nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); }
function ta_logError_(meta) {
  try { Logger.log('[TeacherAttendance] ' + JSON.stringify(meta || {})); } catch (_) {}
}
function ta_withScriptLock_(operationType, fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } catch (err) {
    ta_logError_({ operationType: operationType, executionTimestamp: ta_nowIso_(), failureReason: String((err && err.message) || err || 'unknown') });
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function ta_activeStatus_(status) {
  var s = String(status || '').trim().toLowerCase();
  return !(s === 'inactive' || s === 'graduated' || s === 'withdrawn');
}

function ta_progressCol_(session) {
  var map = { Class1:'1_Class', Class2:'2_Class', Class3:'3_Class', Class4A:'4A_Class', Class4B:'4B_Class', Class5:'5_Class', Class6:'6_Class', Class7:'7_Class' };
  return map[String(session || '').trim()] || '';
}

function ta_classNumberFromSession_(session) {
  var s = String(session || '').trim();
  var map = { Class1:1, Class2:2, Class3:3, Class4A:4, Class4B:4, Class5:5, Class6:6, Class7:7 };
  return map[s] || 0;
}

function ta_ensureSheets_() {
  ensureColumns(getSheet('STUDENTS'), ['ClassOptionID', 'BatchID', 'ApplicantID', 'LastAttendanceAt', 'UpdatedAt']);
  ensureColumns(getSheet('ATTENDANCE_LOG'), ['AttendanceID','SubmittedAt','TeacherID','TeacherName','ClassOptionID','ClassSession','ClassDate','PersonID','PersonType','FullName','Email','AttendanceStatus','FellowshipCode','BatchID']);
  ensureSheet('CLASS_MILESTONES', ['MilestoneID','ClassSession','Question','Active','DisplayOrder','CreatedAt','UpdatedAt']);
  ensureSheet('CLASS_OUTCOMES', ['OutcomeID','StudentID','PersonType','FullName','Email','TeacherID','TeacherName','ClassOptionID','ClassSession','ClassDate','MilestoneID','Question','OutcomeResult','Submitted','SubmittedAt','AdminFollowUpNeeded','Notes']);
}

function ta_seedMilestonesIfEmpty_(repoCtx) {
  var target = repoCtx || ta_repoContext_();
  var ctx = ta_getRepo_(target, 'CLASS_MILESTONES');
  if (ctx.objects.length) return ctx;
  var now = new Date();
  var rows = [
    ['MS-CLASS1-BORNAGAIN','Class1','Were they born again?','TRUE',1,now,now],
    ['MS-CLASS2-SPIRIT','Class2','Were they filled with the Spirit?','TRUE',1,now,now],
    ['MS-CLASS6-EVANGELISE','Class6','Did they evangelise?','TRUE',1,now,now]
  ];
  ctx.sheet.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  target.repos.CLASS_MILESTONES = ta_sheetObjects_('CLASS_MILESTONES');
  target.repos.CLASS_MILESTONES.HLoose = headerIndexLoose(target.repos.CLASS_MILESTONES.headers || []);
  return target.repos.CLASS_MILESTONES;
}

function ta_teacherById_(teacherId, repoCtx) {
  var ctx = ta_getRepo_(repoCtx, 'TEACHERS');
  var idCol = ta_colRepo_(ctx, ['TeacherID']);
  var nameCol = ta_colRepo_(ctx, ['TeacherName','Name']);
  var emailCol = ta_colRepo_(ctx, ['TeacherEmail','Email']);
  var tzCol = ta_colRepo_(ctx, ['TeacherTimezone','Timezone']);
  var activeCol = ta_colRepo_(ctx, ['Active']);
  var want = String(teacherId || '').trim().toLowerCase();
  for (var i = 0; i < ctx.objects.length; i++) {
    var v = ctx.objects[i].values;
    var id = String(idCol >= 0 ? v[idCol] : '').trim();
    if (!id || id.toLowerCase() !== want) continue;
    if (activeCol >= 0 && !ta_parseTrue_(v[activeCol])) return null;
    return { teacherId: id, fullName: String(nameCol>=0?v[nameCol]:'').trim(), email: String(emailCol>=0?v[emailCol]:'').trim(), timezone: String(tzCol>=0?v[tzCol]:'').trim() || 'America/Toronto' };
  }
  return null;
}

function ta_classForTeacher_(classOptionId, teacherId, repoCtx) {
  var ctx = ta_getRepo_(repoCtx, 'CLASS_OPTIONS');
  var classCol = ta_colRepo_(ctx, ['ClassOptionID','ClassID']);
  var teacherCol = ta_colRepo_(ctx, ['TeacherID']);
  var activeCol = ta_colRepo_(ctx, ['Active']);
  var wantClass = String(classOptionId || '').trim().toLowerCase();
  var wantTeacher = String(teacherId || '').trim().toLowerCase();
  for (var i = 0; i < ctx.objects.length; i++) {
    var v = ctx.objects[i].values;
    var cid = String(classCol >= 0 ? v[classCol] : '').trim();
    if (!cid || cid.toLowerCase() !== wantClass) continue;
    var tid = String(teacherCol >= 0 ? v[teacherCol] : '').trim();
    if (!tid || tid.toLowerCase() !== wantTeacher) return { mismatch: true };
    if (activeCol >= 0 && !ta_parseTrue_(v[activeCol])) return { inactive: true };
    return { values: v, headers: ctx.headers, rowIndex: ctx.objects[i].rowIndex };
  }
  return null;
}

function ta_classMeta_(headers, values, repo) {
  var col = repo ? function (names) { return ta_colRepo_(repo, names); } : function (names) { return ta_col_(headers, names); };
  return {
    classOptionId: String(values[col(['ClassOptionID','ClassID'])] || '').trim(),
    teacherId: String(values[col(['TeacherID'])] || '').trim(),
    fellowship: String(values[col(['FellowshipCode','CampusCode'])] || '').trim(),
    campus: String(values[col(['CampusName','Campus','FellowshipCode','CampusCode'])] || '').trim(),
    day: String(values[col(['Day'])] || '').trim(),
    time: ta_time_(values[col(['Time'])]),
    batch: String(values[col(['BatchID','Batch'])] || '').trim()
  };
}

function ta_normEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

function ta_parseClassOptionIds_(classOptionIdRaw) {
  if (Array.isArray(classOptionIdRaw)) {
    var arr = [];
    for (var i = 0; i < classOptionIdRaw.length; i++) {
      var s = String(classOptionIdRaw[i] || '').trim();
      if (s && arr.indexOf(s) < 0) arr.push(s);
    }
    return arr;
  }
  var raw = String(classOptionIdRaw || '').trim();
  if (!raw) return [];
  var parts = raw.split(',');
  var out = [];
  for (var p = 0; p < parts.length; p++) {
    var id = String(parts[p] || '').trim();
    if (id && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

function ta_parseSessions_(classSessionRaw) {
  if (Array.isArray(classSessionRaw)) {
    var arr = [];
    for (var i = 0; i < classSessionRaw.length; i++) {
      var s = String(classSessionRaw[i] || '').trim();
      if (s && arr.indexOf(s) < 0) arr.push(s);
    }
    return arr;
  }
  var raw = String(classSessionRaw || '').trim();
  if (!raw) return [];
  var parts = raw.split(',');
  var out = [];
  for (var p = 0; p < parts.length; p++) {
    var id = String(parts[p] || '').trim();
    if (id && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

function ta_validateSessions_(classSessionRaw) {
  var sessions = ta_parseSessions_(classSessionRaw);
  var valid = { Class1:1, Class2:1, Class3:1, Class4A:1, Class4B:1, Class5:1, Class6:1, Class7:1 };
  if (!sessions.length) throw new Error('Select at least one session.');
  if (sessions.length > 2) throw new Error('You can select at most two sessions.');
  for (var i = 0; i < sessions.length; i++) {
    if (!valid[sessions[i]]) throw new Error('Invalid classSession.');
  }
  return sessions;
}

function ta_validateTeacherClassSet_(teacherId, classOptionIds, classSession, repoCtx) {
  var ids = ta_parseClassOptionIds_(classOptionIds);
  if (!ids.length) throw new Error('Class selection is required.');
  if (ids.length > 2) throw new Error('You can select at most two classes.');
  var owned = [];
  for (var i = 0; i < ids.length; i++) {
    var o = ta_classForTeacher_(ids[i], teacherId, repoCtx);
    if (!o || o.mismatch || o.inactive) throw new Error('You can only access your assigned active classes.');
    owned.push(o);
  }
  if (ids.length === 2) {
    var r0 = ta_classMeta_(owned[0].headers, owned[0].values, ta_getRepo_(repoCtx, 'CLASS_OPTIONS'));
    var r1 = ta_classMeta_(owned[1].headers, owned[1].values, ta_getRepo_(repoCtx, 'CLASS_OPTIONS'));
    if (String(r0.teacherId || '').trim().toLowerCase() !== String(r1.teacherId || '').trim().toLowerCase()) throw new Error('Merged attendance requires classes assigned to the same teacher.');
    if (classSession) {
      var valid = { Class1:1, Class2:1, Class3:1, Class4A:1, Class4B:1, Class5:1, Class6:1, Class7:1 };
      if (!valid[String(classSession || '').trim()]) throw new Error('Invalid classSession.');
    }
  }
  return { classOptionIds: ids, owned: owned };
}

function ta_rosterKeyFromPerson_(p) {
  var sid = String(p.studentId || '').trim();
  if (sid) return 'SID:' + sid.toLowerCase();
  var aid = String(p.applicantId || '').trim();
  if (aid) return 'AID:' + aid.toLowerCase();
  var em = ta_normEmail_(p.email);
  if (em) return 'EM:' + em;
  return '';
}

function ta_maybeSyncMoodle_(studentLike) {
  try {
    if (typeof syncStudentToMoodle_ === 'function') syncStudentToMoodle_(studentLike || {});
  } catch (err) {
    ta_logError_({ operationType: 'moodleSync', warning: String((err && err.message) || err || 'unknown') });
  }
}

function ta_getFellowships_(repoCtx) {
  var out = [];
  try {
    var ctx = ta_getRepo_(repoCtx, 'FELLOWSHIP_MAP');
    var codeCol = ta_colRepo_(ctx, ['FellowshipCode','Code']);
    var nameCol = ta_colRepo_(ctx, ['CampusName','FellowshipName','Name']);
    if (codeCol < 0 || nameCol < 0) return out;
    for (var i = 0; i < ctx.objects.length; i++) {
      var v = ctx.objects[i].values;
      var code = String(v[codeCol] || '').trim();
      var name = String(v[nameCol] || '').trim();
      if (!code || !name) continue;
      out.push({ code: code, name: name });
    }
  } catch (_) {}
  return out;
}

function ta_lookupTeacherForAttendance_(query, repoCtx) {
  var q = String(query || '').trim();
  if (q.length < 2) return [];
  var ql = q.toLowerCase();
  var ctx = ta_getRepo_(repoCtx, 'TEACHERS');
  var idCol = ta_colRepo_(ctx, ['TeacherID']);
  var nameCol = ta_colRepo_(ctx, ['TeacherName','Name']);
  var emailCol = ta_colRepo_(ctx, ['TeacherEmail','Email']);
  var tzCol = ta_colRepo_(ctx, ['TeacherTimezone','Timezone']);
  var subgroupCol = ta_colRepo_(ctx, ['SubGroupLabel','Subgroup','Campus']);
  var activeCol = ta_colRepo_(ctx, ['Active']);
  var out = [];
  for (var i = 0; i < ctx.objects.length; i++) {
    var v = ctx.objects[i].values;
    if (activeCol >= 0 && !ta_parseTrue_(v[activeCol])) continue;
    var id = String(idCol >= 0 ? v[idCol] : '').trim();
    var name = String(nameCol >= 0 ? v[nameCol] : '').trim();
    var email = String(emailCol >= 0 ? v[emailCol] : '').trim();
    if (!id || !name) continue;
    var rank = -1;
    if (email && email.toLowerCase() === ql) rank = 1;
    else if (id.toLowerCase() === ql) rank = 2;
    else if (name.toLowerCase() === ql) rank = 3;
    else if (name.toLowerCase().indexOf(ql) >= 0 || email.toLowerCase().indexOf(ql) >= 0) rank = 4;
    if (rank < 0) continue;
    out.push({ rank: rank, teacherId: id, fullName: name, email: email, timezone: String(tzCol>=0?v[tzCol]:'').trim() || 'America/Toronto', subGroupLabel: String(subgroupCol>=0?v[subgroupCol]:'').trim() });
  }
  out.sort(function (a,b){ return a.rank-b.rank || a.fullName.localeCompare(b.fullName); });
  return out.map(function (x){ return { teacherId:x.teacherId, fullName:x.fullName, email:x.email, timezone:x.timezone, subGroupLabel:x.subGroupLabel }; });
}

function ta_getTeacherActiveClassOptions_(teacherId, repoCtx) {
  var want = String(teacherId || '').trim().toLowerCase();
  if (!want) return [];
  var classCtx = ta_getRepo_(repoCtx, 'CLASS_OPTIONS');
  var classCol = ta_colRepo_(classCtx, ['ClassOptionID','ClassID']);
  var teacherCol = ta_colRepo_(classCtx, ['TeacherID']);
  var activeCol = ta_colRepo_(classCtx, ['Active']);

  var studentsCtx = ta_getRepo_(repoCtx, 'STUDENTS');
  var sClassOpt = ta_colRepo_(studentsCtx, ['ClassOptionID']);
  var sClassId = ta_colRepo_(studentsCtx, ['ClassID']);
  var sStatus = ta_colRepo_(studentsCtx, ['Status']);

  var logCtx = ta_getRepo_(repoCtx, 'ATTENDANCE_LOG');
  var lClass = ta_colRepo_(logCtx, ['ClassOptionID','ClassID']);
  var lSession = ta_colRepo_(logCtx, ['ClassSession']);
  var subMap = {};
  for (var i = 0; i < logCtx.objects.length; i++) {
    var lv = logCtx.objects[i].values;
    var cid = String(lClass >= 0 ? lv[lClass] : '').trim();
    var ss = String(lSession >= 0 ? lv[lSession] : '').trim();
    if (!cid || !ss) continue;
    subMap[cid] = subMap[cid] || {};
    subMap[cid][ss] = true;
  }

  var out = [];
  for (var j = 0; j < classCtx.objects.length; j++) {
    var v = classCtx.objects[j].values;
    var cid2 = String(classCol >= 0 ? v[classCol] : '').trim();
    var tid = String(teacherCol >= 0 ? v[teacherCol] : '').trim();
    if (!cid2 || !tid || tid.toLowerCase() !== want) continue;
    if (activeCol >= 0 && !ta_parseTrue_(v[activeCol])) continue;

    var enrolled = 0;
    for (var k = 0; k < studentsCtx.objects.length; k++) {
      var sv = studentsCtx.objects[k].values;
      var sc = String(sClassOpt >= 0 ? sv[sClassOpt] : '').trim();
      if (!sc && sClassId >= 0) sc = String(sv[sClassId] || '').trim();
      if (sc !== cid2) continue;
      if (!ta_activeStatus_(String(sStatus >= 0 ? sv[sStatus] : '').trim())) continue;
      enrolled++;
    }

    var m = ta_classMeta_(classCtx.headers, v, classCtx);
    out.push({
      classOptionId: m.classOptionId,
      teacherId: m.teacherId,
      campus: m.campus || m.fellowship,
      fellowship: m.fellowship,
      day: m.day,
      time: m.time,
      batch: m.batch,
      startDate: String(v[ta_colRepo_(classCtx, ['ClassStartDate','StartDate'])] || '').trim(),
      enrolledCount: enrolled,
      submittedSessions: Object.keys(subMap[cid2] || {})
    });
  }
  return out;
}

function attendanceAlreadySubmitted_(classOptionId, classSession, classDate, logCtx) {
  var ctx = logCtx || ta_getRepo_(null, 'ATTENDANCE_LOG');
  var classCol = ta_colRepo_(ctx, ['ClassOptionID','ClassID']);
  var sessionCol = ta_colRepo_(ctx, ['ClassSession']);
  var dateCol = ta_colRepo_(ctx, ['ClassDate']);
  var c = String(classOptionId || '').trim().toLowerCase();
  var s = String(classSession || '').trim().toLowerCase();
  var d = ta_date_(classDate);
  for (var i = 0; i < ctx.objects.length; i++) {
    var v = ctx.objects[i].values;
    if (String(v[classCol] || '').trim().toLowerCase() === c && String(v[sessionCol] || '').trim().toLowerCase() === s && ta_date_(v[dateCol]) === d) return true;
  }
  return false;
}

function ta_loadAttendanceRoster_(teacherId, classOptionId, classSession, repoCtx) {
  var sessions = ta_validateSessions_(classSession);
  var classId = String(classOptionId || '').trim();
  var owned = ta_classForTeacher_(classId, teacherId, repoCtx);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');

  var out = [];
  var includeClass1 = sessions.some(function (s) { return ta_classNumberFromSession_(s) === 1; });
  var includePostClass1 = sessions.some(function (s) { return ta_classNumberFromSession_(s) >= 2; });
  if (includeClass1) {
    var applicantsCtx = ta_getRepo_(repoCtx, 'APPLICANTS');
    var aId = ta_colRepo_(applicantsCtx, ['ApplicantID']);
    var aClassOpt = ta_colRepo_(applicantsCtx, ['ClassOptionID']);
    var aClassId = ta_colRepo_(applicantsCtx, ['ClassID']);
    var aName = ta_colRepo_(applicantsCtx, ['FullName','FirstName']);
    var aEmail = ta_colRepo_(applicantsCtx, ['Email']);
    var aStatus = ta_colRepo_(applicantsCtx, ['Status']);
    for (var j = 0; j < applicantsCtx.objects.length; j++) {
      var av = applicantsCtx.objects[j].values;
      var ac = String(aClassOpt >= 0 ? av[aClassOpt] : '').trim();
      if (!ac && aClassId >= 0) ac = String(av[aClassId] || '').trim();
      if (ac !== classId) continue;
      var aid = String(aId >= 0 ? av[aId] : '').trim();
      if (!aid) continue;
      out.push({
        id: aid,
        applicantId: aid,
        personType: 'Applicant',
        fullName: String(aName >= 0 ? av[aName] : '').trim(),
        email: String(aEmail >= 0 ? av[aEmail] : '').trim(),
        status: String(aStatus >= 0 ? av[aStatus] : '').trim(),
        sourceClassOptionId: classId,
        sourceSession: 'Class1',
        notes: ''
      });
    }
  }
  if (includePostClass1) {
    var studentsCtx = ta_getRepo_(repoCtx, 'STUDENTS');
    var sId = ta_colRepo_(studentsCtx, ['StudentID']);
    var sApp = ta_colRepo_(studentsCtx, ['ApplicantID']);
    var sClassOpt = ta_colRepo_(studentsCtx, ['ClassOptionID']);
    var sClassId = ta_colRepo_(studentsCtx, ['ClassID']);
    var sName = ta_colRepo_(studentsCtx, ['FullName']);
    var sEmail = ta_colRepo_(studentsCtx, ['Email']);
    var sStatus = ta_colRepo_(studentsCtx, ['Status']);
    for (var i = 0; i < studentsCtx.objects.length; i++) {
      var sv = studentsCtx.objects[i].values;
      var sc = String(sClassOpt >= 0 ? sv[sClassOpt] : '').trim();
      if (!sc && sClassId >= 0) sc = String(sv[sClassId] || '').trim();
      if (sc !== classId) continue;
      var sid = String(sId >= 0 ? sv[sId] : '').trim();
      if (!sid) continue;
      out.push({
        id: sid,
        studentId: sid,
        applicantId: String(sApp >= 0 ? sv[sApp] : '').trim(),
        personType: 'Student',
        fullName: String(sName >= 0 ? sv[sName] : '').trim(),
        email: String(sEmail >= 0 ? sv[sEmail] : '').trim(),
        status: String(sStatus >= 0 ? sv[sStatus] : '').trim(),
        sourceClassOptionId: classId,
        sourceSession: sessions.find(function (x) { return ta_classNumberFromSession_(x) >= 2; }) || sessions[0],
        notes: ''
      });
    }
  }

  var dedup = [];
  var seen = {};
  for (var k = 0; k < out.length; k++) {
    var person = out[k] || {};
    var key = ta_rosterKeyFromPerson_(person) || ('PID:' + String(person.id || '').trim().toLowerCase());
    if (!key) continue;
    var existingIndex = seen[key];
    if (existingIndex == null) {
      seen[key] = dedup.length;
      dedup.push(person);
      continue;
    }
    if (dedup[existingIndex].personType !== 'Student' && person.personType === 'Student') {
      dedup[existingIndex].personType = 'Student';
      dedup[existingIndex].id = person.id || dedup[existingIndex].id;
      dedup[existingIndex].studentId = person.studentId || dedup[existingIndex].studentId;
    }
  }

  var logCtx = ta_getRepo_(repoCtx, 'ATTENDANCE_LOG');
  var already = false;
  var summaryClasses = [];
  for (var c = 0; c < sessions.length; c++) {
    if (attendanceAlreadySubmitted_(classId, sessions[c], ta_date_(new Date()), logCtx)) {
      already = true;
      summaryClasses.push(sessions[c]);
    }
  }
  return { data: dedup, fellowships: ta_getFellowships_(repoCtx), alreadySubmitted: already, previousSubmissionSummary: already ? ('Attendance already exists for today: ' + summaryClasses.join(', ')) : '' };
}

function ta_searchAttendancePerson_(teacherId, classOptionId, query, repoCtx, classSession) {
  var classId = String(classOptionId || '').trim();
  var owned = ta_classForTeacher_(classId, teacherId, repoCtx);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');
  var sessions = ta_validateSessions_(classSession);
  var q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  var out = [];

  var includeClass1 = sessions.some(function (s) { return ta_classNumberFromSession_(s) === 1; });
  var includePostClass1 = sessions.some(function (s) { return ta_classNumberFromSession_(s) >= 2; });
  if (includeClass1) {
    var actx = ta_getRepo_(repoCtx, 'APPLICANTS');
    var aid = ta_colRepo_(actx, ['ApplicantID']);
    var aname = ta_colRepo_(actx, ['FullName','FirstName']);
    var aemail = ta_colRepo_(actx, ['Email']);
    var astatus = ta_colRepo_(actx, ['Status']);
    var aClassOpt = ta_colRepo_(actx, ['ClassOptionID']);
    var aClassId = ta_colRepo_(actx, ['ClassID']);
    for (var j = 0; j < actx.objects.length; j++) {
      var av = actx.objects[j].values;
      var an = String(aname >= 0 ? av[aname] : '').trim();
      var ae = String(aemail >= 0 ? av[aemail] : '').trim();
      if (an.toLowerCase().indexOf(q) < 0 && ae.toLowerCase().indexOf(q) < 0) continue;
      var ac = String(aClassOpt >= 0 ? av[aClassOpt] : '').trim();
      if (!ac && aClassId >= 0) ac = String(av[aClassId] || '').trim();
      out.push({ id: String(aid >= 0 ? av[aid] : '').trim(), applicantId: String(aid >= 0 ? av[aid] : '').trim(), personType:'Applicant', fullName: an, email: ae, status: String(astatus >= 0 ? av[astatus] : '').trim() || 'Pending', classOptionId: ac, sourceClassOptionId: ac, notes:'' });
    }
  }
  if (includePostClass1) {
    var sctx = ta_getRepo_(repoCtx, 'STUDENTS');
    var sid = ta_colRepo_(sctx, ['StudentID']);
    var sapp = ta_colRepo_(sctx, ['ApplicantID']);
    var sname = ta_colRepo_(sctx, ['FullName']);
    var semail = ta_colRepo_(sctx, ['Email']);
    var sstatus = ta_colRepo_(sctx, ['Status']);
    var sClassOpt = ta_colRepo_(sctx, ['ClassOptionID']);
    var sClassId = ta_colRepo_(sctx, ['ClassID']);
    for (var i = 0; i < sctx.objects.length; i++) {
      var sv = sctx.objects[i].values;
      var id = String(sid >= 0 ? sv[sid] : '').trim();
      if (!id) continue;
      var n = String(sname >= 0 ? sv[sname] : '').trim();
      var e = String(semail >= 0 ? sv[semail] : '').trim();
      if (n.toLowerCase().indexOf(q) < 0 && e.toLowerCase().indexOf(q) < 0) continue;
      var assignedClass = String(sClassOpt >= 0 ? sv[sClassOpt] : '').trim();
      if (!assignedClass && sClassId >= 0) assignedClass = String(sv[sClassId] || '').trim();
      out.push({ id: id, studentId:id, applicantId:String(sapp>=0?sv[sapp]:'').trim(), personType: 'Student', fullName: n, email: e, status: String(sstatus >= 0 ? sv[sstatus] : '').trim() || 'Active', classOptionId: assignedClass, sourceClassOptionId: assignedClass, notes: '' });
    }
  }
  return out.slice(0, 20);
}

function ta_getTeacherClassProgressGrid_(teacherId, classOptionId, repoCtx) {
  var owned = ta_classForTeacher_(classOptionId, teacherId, repoCtx);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');
  var meta = ta_classMeta_(owned.headers, owned.values, ta_getRepo_(repoCtx, 'CLASS_OPTIONS'));
  var progressCols = ['1_Class','1_Work','2_Class','2_Work','3_Class','3_Work','4A_Class','4A_Work','4B_Class','4B_Work','5_Class','5_Work','6_Class','6_Work','7_Class','EXAM'];

  var sctx = ta_getRepo_(repoCtx, 'STUDENTS');
  var sApp = ta_colRepo_(sctx, ['ApplicantID']);
  var sEmail = ta_colRepo_(sctx, ['Email']);
  var sClassOpt = ta_colRepo_(sctx, ['ClassOptionID']);
  var sClassId = ta_colRepo_(sctx, ['ClassID']);
  var sId = ta_colRepo_(sctx, ['StudentID']);
  var sName = ta_colRepo_(sctx, ['FullName']);
  var sStatus = ta_colRepo_(sctx, ['Status']);
  var byApplicant = {}, byEmail = {};
  var progressIndex = {};
  for (var pc = 0; pc < progressCols.length; pc++) progressIndex[progressCols[pc]] = ta_colRepo_(sctx, [progressCols[pc]]);

  var students = [];
  for (var i = 0; i < sctx.objects.length; i++) {
    var sv = sctx.objects[i].values;
    var st = String(sStatus >= 0 ? sv[sStatus] : '').trim();
    if (!ta_activeStatus_(st)) continue;
    var appId = String(sApp >= 0 ? sv[sApp] : '').trim().toLowerCase();
    var em = String(sEmail >= 0 ? sv[sEmail] : '').trim().toLowerCase();
    if (appId) byApplicant[appId] = sv;
    if (em) byEmail[em] = sv;

    var cid = String(sClassOpt >= 0 ? sv[sClassOpt] : '').trim();
    if (!cid && sClassId >= 0) cid = String(sv[sClassId] || '').trim();
    if (cid !== classOptionId) continue;
    var row = { personType:'Student', studentId:String(sId>=0?sv[sId]:'').trim(), fullName:String(sName>=0?sv[sName]:'').trim(), email:String(sEmail>=0?sv[sEmail]:'').trim(), status: st || 'Active' };
    for (var p = 0; p < progressCols.length; p++) {
      var col = progressIndex[progressCols[p]];
      row[progressCols[p]] = col >= 0 ? ta_parseTrue_(sv[col]) : false;
    }
    students.push(row);
  }

  var actx = ta_getRepo_(repoCtx, 'APPLICANTS');
  var aId = ta_colRepo_(actx, ['ApplicantID']);
  var aClassOpt = ta_colRepo_(actx, ['ClassOptionID']);
  var aClassId = ta_colRepo_(actx, ['ClassID']);
  var aName = ta_colRepo_(actx, ['FullName','FirstName']);
  var aEmail = ta_colRepo_(actx, ['Email']);
  var aStatus = ta_colRepo_(actx, ['Status']);
  for (var j = 0; j < actx.objects.length; j++) {
    var av = actx.objects[j].values;
    var acid = String(aClassOpt >= 0 ? av[aClassOpt] : '').trim();
    if (!acid && aClassId >= 0) acid = String(av[aClassId] || '').trim();
    if (acid !== classOptionId) continue;
    var ast = String(aStatus >= 0 ? av[aStatus] : '').trim();
    if (!ta_activeStatus_(ast)) continue;
    var aid = String(aId >= 0 ? av[aId] : '').trim().toLowerCase();
    var aem = String(aEmail >= 0 ? av[aEmail] : '').trim().toLowerCase();
    var linked = (aid && byApplicant[aid]) || (aem && byEmail[aem]) || null;
    var prow = { personType:'Applicant', studentId: linked ? String(linked[sId] || '').trim() : '', fullName:String(aName>=0?av[aName]:'').trim(), email:String(aEmail>=0?av[aEmail]:'').trim(), status: ast || 'Assigned' };
    for (var q = 0; q < progressCols.length; q++) {
      var pcol = progressIndex[progressCols[q]];
      prow[progressCols[q]] = linked && pcol >= 0 ? ta_parseTrue_(linked[pcol]) : false;
    }
    students.push(prow);
  }

  return { classOption: meta, students: students };
}

function ta_getMilestonesForSession_(classSession) {
  ta_ensureSheets_();
  var repoCtx = ta_repoContext_();
  ta_seedMilestonesIfEmpty_(repoCtx);
  var ctx = ta_getRepo_(repoCtx, 'CLASS_MILESTONES');
  var sessionCol = ta_colRepo_(ctx, ['ClassSession']);
  var activeCol = ta_colRepo_(ctx, ['Active']);
  var orderCol = ta_colRepo_(ctx, ['DisplayOrder']);
  var idCol = ta_colRepo_(ctx, ['MilestoneID']);
  var qCol = ta_colRepo_(ctx, ['Question']);
  var want = String(classSession || '').trim();
  var out = [];
  for (var i = 0; i < ctx.objects.length; i++) {
    var v = ctx.objects[i].values;
    if (String(v[sessionCol] || '').trim() !== want) continue;
    if (activeCol >= 0 && !ta_parseTrue_(v[activeCol])) continue;
    out.push({ milestoneId: String(v[idCol] || '').trim(), classSession: want, question: String(v[qCol] || '').trim(), displayOrder: Number(v[orderCol] || 0) });
  }
  out.sort(function(a,b){ return (a.displayOrder||0)-(b.displayOrder||0); });
  return out;
}

function ta_getNextStudentCounter_(studentsCtx) {
  var sidCol = ta_colRepo_(studentsCtx, ['StudentID']);
  if (sidCol < 0) return null;
  var max = 0;
  for (var i = 0; i < studentsCtx.objects.length; i++) {
    var m = String(studentsCtx.objects[i].values[sidCol] || '').trim().match(/^STD-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return max;
}

function ta_writeRowUpdatesBatched_(sheet, width, updates) {
  if (!updates || !updates.length) return;
  updates.sort(function (a, b) { return a.rowIndex - b.rowIndex; });
  var start = updates[0].rowIndex;
  var block = [updates[0].values];
  for (var i = 1; i < updates.length; i++) {
    var u = updates[i];
    var prev = updates[i - 1];
    if (u.rowIndex === prev.rowIndex + 1) {
      block.push(u.values);
    } else {
      sheet.getRange(start, 1, block.length, width).setValues(block);
      start = u.rowIndex;
      block = [u.values];
    }
  }
  sheet.getRange(start, 1, block.length, width).setValues(block);
}

function ta_collectStudentMutations_(records, classMeta, teacherName, classSession, now, studentsCtx) {
  var SH = headerIndex(studentsCtx.headers);
  var appCol = ta_colRepo_(studentsCtx, ['ApplicantID']);
  var emailCol = ta_colRepo_(studentsCtx, ['Email']);
  var sidCol = ta_colRepo_(studentsCtx, ['StudentID']);
  var updates = [];
  var appends = [];
  var byApplicant = {};
  var byEmail = {};
  var i;

  for (i = 0; i < studentsCtx.objects.length; i++) {
    var existing = studentsCtx.objects[i];
    if (appCol >= 0) {
      var a = String(existing.values[appCol] || '').trim().toLowerCase();
      if (a) byApplicant[a] = existing;
    }
    if (emailCol >= 0) {
      var e = String(existing.values[emailCol] || '').trim().toLowerCase();
      if (e) byEmail[e] = existing;
    }
  }

  var nextCounter = ta_getNextStudentCounter_(studentsCtx);
  var pCol = ta_progressCol_(classSession);
  if (!pCol) return { updates: updates, appends: appends };

  for (i = 0; i < records.length; i++) {
    var record = records[i] || {};
    if (String(record.attendanceStatus || '').trim().toLowerCase() !== 'present') continue;
    if (String(record.personType || '').trim() === 'Applicant') continue;
    var personId = String(record.personId || '').trim();
    var email = String(record.email || '').trim().toLowerCase();
    var rowObj = null;

    if (record.personType === 'Applicant' && appCol >= 0 && personId) rowObj = byApplicant[personId.toLowerCase()] || null;
    if (!rowObj && emailCol >= 0 && email) rowObj = byEmail[email] || null;

    if (rowObj) {
      var v = rowObj.values.slice();
      var recClassOptionId = String(record.sourceClassOptionId || classMeta.classOptionId || '').trim();
      if (SH[pCol] != null) v[SH[pCol]] = true;
      if (SH.Status != null) v[SH.Status] = 'Active';
      var curClassOpt = SH.ClassOptionID != null ? String(v[SH.ClassOptionID] || '').trim() : '';
      var curClassId = SH.ClassID != null ? String(v[SH.ClassID] || '').trim() : '';
      if (SH.ClassOptionID != null && !curClassOpt) v[SH.ClassOptionID] = recClassOptionId;
      if (SH.ClassID != null && !curClassId) v[SH.ClassID] = recClassOptionId;
      if (SH.BatchID != null) v[SH.BatchID] = classMeta.batch;
      if (SH.LastAttendanceAt != null) v[SH.LastAttendanceAt] = now;
      if (SH.UpdatedAt != null) v[SH.UpdatedAt] = now;
      if (record.personType === 'Applicant' && SH.ApplicantID != null && !String(v[SH.ApplicantID] || '').trim()) v[SH.ApplicantID] = personId;
      updates.push({ rowIndex: rowObj.rowIndex, values: v });
      continue;
    }

    var newRow = new Array(studentsCtx.headers.length).fill('');
    var recClassOptionId2 = String(record.sourceClassOptionId || classMeta.classOptionId || '').trim();
    if (sidCol >= 0) {
      if (nextCounter == null) newRow[sidCol] = 'STD-' + Date.now() + '-' + (i + 1);
      else {
        nextCounter += 1;
        newRow[sidCol] = 'STD-' + String(nextCounter).padStart(4, '0');
      }
    }
    if (SH.FullName != null) newRow[SH.FullName] = record.fullName || '';
    if (SH.Email != null) newRow[SH.Email] = record.email || '';
    if (SH.FellowshipCode != null) newRow[SH.FellowshipCode] = classMeta.fellowship || '';
    if (SH.TeacherName != null) newRow[SH.TeacherName] = teacherName || '';
    if (SH.ClassID != null) newRow[SH.ClassID] = recClassOptionId2 || '';
    if (SH.ClassOptionID != null) newRow[SH.ClassOptionID] = recClassOptionId2 || '';
    if (SH.BatchID != null) newRow[SH.BatchID] = classMeta.batch || '';
    if (SH.ApplicantID != null && record.personType === 'Applicant') newRow[SH.ApplicantID] = personId;
    if (SH.Status != null) newRow[SH.Status] = 'Active';
    if (SH[pCol] != null) newRow[SH[pCol]] = true;
    if (SH.LastAttendanceAt != null) newRow[SH.LastAttendanceAt] = now;
    if (SH.UpdatedAt != null) newRow[SH.UpdatedAt] = now;
    appends.push(newRow);

    var temp = { rowIndex: -1, values: newRow };
    if (appCol >= 0 && record.personType === 'Applicant' && personId) byApplicant[personId.toLowerCase()] = temp;
    if (emailCol >= 0 && email) byEmail[email] = temp;
  }
  return { updates: updates, appends: appends };
}

function ta_promoteApplicantsForClass1_(records, classMeta, teacherName, classDate, classSession, now, studentsCtx, applicantsCtx) {
  var SH = headerIndex(studentsCtx.headers);
  var AH = headerIndex(applicantsCtx.headers);
  var sAppCol = ta_colRepo_(studentsCtx, ['ApplicantID']);
  var sEmailCol = ta_colRepo_(studentsCtx, ['Email']);
  var sIdCol = ta_colRepo_(studentsCtx, ['StudentID']);
  var aIdCol = ta_colRepo_(applicantsCtx, ['ApplicantID']);
  var aEmailCol = ta_colRepo_(applicantsCtx, ['Email']);
  var updates = [];
  var appends = [];
  var errors = [];
  var byApplicant = {};
  var byEmail = {};
  var applicantsById = {};
  var i;

  for (i = 0; i < studentsCtx.objects.length; i++) {
    var srow = studentsCtx.objects[i];
    if (sAppCol >= 0) {
      var sx = String(srow.values[sAppCol] || '').trim().toLowerCase();
      if (sx) byApplicant[sx] = srow;
    }
    if (sEmailCol >= 0) {
      var se = String(srow.values[sEmailCol] || '').trim().toLowerCase();
      if (se) byEmail[se] = srow;
    }
  }

  for (i = 0; i < applicantsCtx.objects.length; i++) {
    var arow = applicantsCtx.objects[i];
    var aid = String(aIdCol >= 0 ? arow.values[aIdCol] : '').trim().toLowerCase();
    if (aid) applicantsById[aid] = arow;
  }

  var nextCounter = ta_getNextStudentCounter_(studentsCtx);
  var pCol = ta_progressCol_(classSession);

  for (i = 0; i < records.length; i++) {
    try {
      var rec = records[i] || {};
      if (String(rec.attendanceStatus || '').trim().toLowerCase() !== 'present') continue;
      if (String(rec.personType || '').trim() !== 'Applicant') continue;
      var personId = String(rec.personId || '').trim();
      if (!personId) continue;
      var appRow = applicantsById[personId.toLowerCase()];
      if (!appRow) continue;
      var appValues = appRow.values;
      var appEmail = String(aEmailCol >= 0 ? appValues[aEmailCol] : '').trim().toLowerCase();
      var existing = byApplicant[personId.toLowerCase()] || (appEmail ? byEmail[appEmail] : null) || null;

      if (existing) {
        var ev = existing.values.slice();
        var recClassOptionId = String(rec.sourceClassOptionId || classMeta.classOptionId || '').trim();
        if (SH.Status != null) ev[SH.Status] = 'Active';
        if (SH.ClassOptionID != null && !String(ev[SH.ClassOptionID] || '').trim()) ev[SH.ClassOptionID] = recClassOptionId;
        if (SH.ClassID != null && !String(ev[SH.ClassID] || '').trim()) ev[SH.ClassID] = recClassOptionId;
        if (SH.BatchID != null) ev[SH.BatchID] = classMeta.batch || '';
        if (SH.LastAttendanceAt != null) ev[SH.LastAttendanceAt] = now;
        if (SH.UpdatedAt != null) ev[SH.UpdatedAt] = now;
        if (SH.EnrollmentDate != null && !String(ev[SH.EnrollmentDate] || '').trim()) ev[SH.EnrollmentDate] = classDate;
        if (SH.ApplicantID != null && !String(ev[SH.ApplicantID] || '').trim()) ev[SH.ApplicantID] = personId;
        if (pCol && SH[pCol] != null) ev[SH[pCol]] = true;
        updates.push({ rowIndex: existing.rowIndex, values: ev });
        continue;
      }

      var newRow = new Array(studentsCtx.headers.length).fill('');
      var recClassOptionId2 = String(rec.sourceClassOptionId || classMeta.classOptionId || '').trim();
      var reserved = { StudentID:1, ApplicantID:1, ClassOptionID:1, ClassID:1, BatchID:1, Status:1, EnrollmentDate:1, LastAttendanceAt:1, UpdatedAt:1 };
      for (var h in SH) {
        if (!SH.hasOwnProperty(h)) continue;
        if (reserved[h]) continue;
        if (AH[h] != null) newRow[SH[h]] = appValues[AH[h]];
      }
      if (sIdCol >= 0) {
        if (nextCounter == null) newRow[sIdCol] = 'STD-' + Date.now() + '-' + (i + 1);
        else {
          nextCounter += 1;
          newRow[sIdCol] = 'STD-' + String(nextCounter).padStart(4, '0');
        }
      }
      if (SH.FullName != null && !String(newRow[SH.FullName] || '').trim()) newRow[SH.FullName] = String((AH.FullName != null ? appValues[AH.FullName] : appValues[ta_colRepo_(applicantsCtx, ['FirstName'])]) || '').trim();
      if (SH.Email != null && !String(newRow[SH.Email] || '').trim()) newRow[SH.Email] = String(aEmailCol >= 0 ? appValues[aEmailCol] : '').trim();
      if (SH.Phone != null && AH.Phone != null) newRow[SH.Phone] = appValues[AH.Phone];
      if (SH.ApplicantID != null) newRow[SH.ApplicantID] = personId;
      if (SH.ClassOptionID != null) newRow[SH.ClassOptionID] = recClassOptionId2 || '';
      if (SH.ClassID != null) newRow[SH.ClassID] = recClassOptionId2 || '';
      if (SH.BatchID != null) newRow[SH.BatchID] = classMeta.batch || '';
      if (SH.Status != null) newRow[SH.Status] = 'Active';
      if (SH.EnrollmentDate != null) newRow[SH.EnrollmentDate] = classDate;
      if (SH.FellowshipCode != null && AH.FellowshipCode != null) newRow[SH.FellowshipCode] = appValues[AH.FellowshipCode];
      if (SH.TeacherName != null) newRow[SH.TeacherName] = teacherName || '';
      if (pCol && SH[pCol] != null) newRow[SH[pCol]] = true;
      if (SH.LastAttendanceAt != null) newRow[SH.LastAttendanceAt] = now;
      if (SH.UpdatedAt != null) newRow[SH.UpdatedAt] = now;
      appends.push(newRow);
      if (sAppCol >= 0) byApplicant[personId.toLowerCase()] = { rowIndex: -1, values: newRow };
      if (sEmailCol >= 0 && appEmail) byEmail[appEmail] = { rowIndex: -1, values: newRow };
    } catch (err) {
      errors.push(String((err && err.message) || err || 'unknown'));
    }
  }
  return { updates: updates, appends: appends, errors: errors };
}

function ta_createOrReuseEnrolledStudent_(record, classOptionId, classSession, classDate, teacherName, now, studentsCtx, applicantsCtx) {
  var SH = headerIndex(studentsCtx.headers);
  var AH = headerIndex(applicantsCtx.headers);
  var sIdCol = ta_colRepo_(studentsCtx, ['StudentID']);
  var sAppCol = ta_colRepo_(studentsCtx, ['ApplicantID']);
  var sEmailCol = ta_colRepo_(studentsCtx, ['Email']);
  var aIdCol = ta_colRepo_(applicantsCtx, ['ApplicantID']);
  var aEmailCol = ta_colRepo_(applicantsCtx, ['Email']);
  var email = ta_normEmail_(record.email);
  var fellowshipCode = String(record.fellowshipCode || '').trim();
  var applicantId = String(record.applicantId || '').trim();
  var studentId = String(record.studentId || '').trim();
  var i;

  for (i = 0; i < studentsCtx.objects.length; i++) {
    var sv = studentsCtx.objects[i].values;
    var sid = String(sIdCol >= 0 ? sv[sIdCol] : '').trim();
    var sapp = String(sAppCol >= 0 ? sv[sAppCol] : '').trim();
    var se = ta_normEmail_(sEmailCol >= 0 ? sv[sEmailCol] : '');
    if ((studentId && sid && sid.toLowerCase() === studentId.toLowerCase()) || (applicantId && sapp && sapp.toLowerCase() === applicantId.toLowerCase()) || (email && se && se === email)) {
      return { id: sid || studentId || record.personId, personType: 'Student', fullName: String(record.fullName || '').trim(), email: String(record.email || '').trim(), sourceClassOptionId: classOptionId, classOptionId: classOptionId };
    }
  }

  var matchedApplicant = null;
  for (i = 0; i < applicantsCtx.objects.length; i++) {
    var av = applicantsCtx.objects[i].values;
    var aid = String(aIdCol >= 0 ? av[aIdCol] : '').trim();
    var ae = ta_normEmail_(aEmailCol >= 0 ? av[aEmailCol] : '');
    if ((applicantId && aid && aid.toLowerCase() === applicantId.toLowerCase()) || (email && ae && ae === email)) {
      matchedApplicant = applicantsCtx.objects[i];
      applicantId = applicantId || aid;
      break;
    }
  }

  if (!matchedApplicant) {
    var newApplicantId = applicantId || ('APP-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
    applicantId = newApplicantId;
    var newApplicantRow = new Array(applicantsCtx.headers.length).fill('');
    if (AH.ApplicantID != null) newApplicantRow[AH.ApplicantID] = newApplicantId;
    if (AH.FullName != null) newApplicantRow[AH.FullName] = String(record.fullName || '').trim();
    if (AH.Email != null) newApplicantRow[AH.Email] = String(record.email || '').trim();
    if (AH.Phone != null) newApplicantRow[AH.Phone] = String(record.phone || '').trim();
    if (AH.Status != null) newApplicantRow[AH.Status] = 'Active';
    if (AH.ClassOptionID != null) newApplicantRow[AH.ClassOptionID] = classOptionId;
    if (AH.FellowshipCode != null) newApplicantRow[AH.FellowshipCode] = fellowshipCode;
    if (AH.Source != null) newApplicantRow[AH.Source] = 'Teacher Enrolled';
    applicantsCtx.sheet.getRange(applicantsCtx.sheet.getLastRow() + 1, 1, 1, applicantsCtx.headers.length).setValues([newApplicantRow]);
    applicantsCtx.objects.push({ rowIndex: applicantsCtx.sheet.getLastRow(), values: newApplicantRow });
  }

  var nextCounter = ta_getNextStudentCounter_(studentsCtx);
  var newSid = (nextCounter == null) ? ('STD-' + Date.now()) : ('STD-' + String(nextCounter + 1).padStart(4, '0'));
  var newStudent = new Array(studentsCtx.headers.length).fill('');
  if (sIdCol >= 0) newStudent[sIdCol] = newSid;
  if (SH.FullName != null) newStudent[SH.FullName] = String(record.fullName || '').trim();
  if (SH.Email != null) newStudent[SH.Email] = String(record.email || '').trim();
  if (SH.Phone != null) newStudent[SH.Phone] = String(record.phone || '').trim();
  if (SH.ApplicantID != null) newStudent[SH.ApplicantID] = applicantId;
  if (SH.ClassOptionID != null) newStudent[SH.ClassOptionID] = classOptionId;
  if (SH.ClassID != null) newStudent[SH.ClassID] = classOptionId;
  if (SH.FellowshipCode != null) newStudent[SH.FellowshipCode] = fellowshipCode;
  if (SH.Status != null) newStudent[SH.Status] = 'Active';
  if (SH.Source != null) newStudent[SH.Source] = 'Teacher Enrolled';
  if (SH.EnrollmentDate != null) newStudent[SH.EnrollmentDate] = classDate;
  if (SH.LastAttendanceAt != null) newStudent[SH.LastAttendanceAt] = now;
  if (SH.UpdatedAt != null) newStudent[SH.UpdatedAt] = now;
  studentsCtx.sheet.getRange(studentsCtx.sheet.getLastRow() + 1, 1, 1, studentsCtx.headers.length).setValues([newStudent]);
  studentsCtx.objects.push({ rowIndex: studentsCtx.sheet.getLastRow(), values: newStudent });
  ta_maybeSyncMoodle_({ studentId: newSid, fullName: String(record.fullName || '').trim(), email: String(record.email || '').trim(), classOptionId: classOptionId });
  return { id: newSid, studentId: newSid, applicantId: applicantId, personType: 'Student', fullName: String(record.fullName || '').trim(), email: String(record.email || '').trim(), status: 'Active', classOptionId: classOptionId, sourceClassOptionId: classOptionId };
}

function ta_findAttendanceRowByTuple_(logCtx, personId, classOptionId, classSession, classDate) {
  var personCol = ta_colRepo_(logCtx, ['PersonID']);
  var classCol = ta_colRepo_(logCtx, ['ClassOptionID','ClassID']);
  var sessionCol = ta_colRepo_(logCtx, ['ClassSession']);
  var dateCol = ta_colRepo_(logCtx, ['ClassDate']);
  if (personCol < 0 || classCol < 0 || sessionCol < 0 || dateCol < 0) return null;
  var p = String(personId || '').trim().toLowerCase();
  var c = String(classOptionId || '').trim().toLowerCase();
  var s = String(classSession || '').trim().toLowerCase();
  var d = ta_date_(classDate);
  for (var i = 0; i < logCtx.objects.length; i++) {
    var v = logCtx.objects[i].values;
    if (
      String(v[personCol] || '').trim().toLowerCase() === p &&
      String(v[classCol] || '').trim().toLowerCase() === c &&
      String(v[sessionCol] || '').trim().toLowerCase() === s &&
      ta_date_(v[dateCol]) === d
    ) return logCtx.objects[i];
  }
  return null;
}

function ta_submitTeacherAttendance_(payload) {
  ta_ensureSheets_();
  var repoCtx = ta_repoContext_();
  var teacherId = String(payload.teacherId || '').trim();
  var teacherName = String(payload.teacherName || '').trim();
  var classOptionId = String(payload.classOptionId || '').trim();
  var classSession = String(payload.classSession || '').trim();
  var sessions = ta_validateSessions_(payload.classSession);
  var classDate = ta_date_(payload.classDate);
  var records = Array.isArray(payload.records) ? payload.records : [];
  var teacher = ta_teacherById_(teacherId, repoCtx);
  if (!teacher) throw new Error('Teacher not found or inactive.');
  var classId = String(payload.classOptionId || '').trim();
  if (!classId || classId.indexOf(',') >= 0) throw new Error('Select exactly one class.');
  var owned = ta_classForTeacher_(classId, teacherId, repoCtx);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');

  try {
    return ta_withScriptLock_('submitTeacherAttendance', function () {
      var lockRepoCtx = ta_repoContext_();
      var lockedLogCtx = ta_getRepo_(lockRepoCtx, 'ATTENDANCE_LOG');

      var classMeta = ta_classMeta_(owned.headers, owned.values, ta_getRepo_(repoCtx, 'CLASS_OPTIONS'));
      var now = new Date();
      var statusCol = ta_colRepo_(lockedLogCtx, ['AttendanceStatus']);
      var teacherIdCol = ta_colRepo_(lockedLogCtx, ['TeacherID']);
      var teacherNameCol = ta_colRepo_(lockedLogCtx, ['TeacherName']);
      var crossClassCol = ta_colRepo_(lockedLogCtx, ['CrossClassVisit']);
      var mutUpdates = [];
      var mutAppends = [];
      var tupleSeen = {};
      var pendingTupleToAppendIndex = {};
      for (var li = 0; li < lockedLogCtx.objects.length; li++) {
        var lv0 = lockedLogCtx.objects[li].values;
        var key0 = [
          String(lv0[ta_colRepo_(lockedLogCtx, ['PersonID'])] || '').trim().toLowerCase(),
          String(lv0[ta_colRepo_(lockedLogCtx, ['ClassOptionID','ClassID'])] || '').trim().toLowerCase(),
          String(lv0[ta_colRepo_(lockedLogCtx, ['ClassSession'])] || '').trim().toLowerCase(),
          ta_date_(lv0[ta_colRepo_(lockedLogCtx, ['ClassDate'])])
        ].join('|');
        tupleSeen[key0] = lockedLogCtx.objects[li];
      }
      var studentsCtx = ta_getRepo_(lockRepoCtx, 'STUDENTS');
      var applicantsCtx = ta_getRepo_(lockRepoCtx, 'APPLICANTS');
      var studentById = {};
      var studentIdCol = ta_colRepo_(studentsCtx, ['StudentID']);
      var studentClassOptCol = ta_colRepo_(studentsCtx, ['ClassOptionID']);
      for (var si = 0; si < studentsCtx.objects.length; si++) {
        var sid = String(studentIdCol >= 0 ? studentsCtx.objects[si].values[studentIdCol] : '').trim().toLowerCase();
        if (sid) studentById[sid] = studentsCtx.objects[si];
      }

      var preparedRecords = [];
      for (var ri = 0; ri < records.length; ri++) {
        var rec = JSON.parse(JSON.stringify(records[ri] || {}));
        var requestedSource = String(rec.sourceClassOptionId || rec.classOptionId || classId || '').trim();
        var sourceClassOptionId = requestedSource || classId;
        rec.sourceClassOptionId = sourceClassOptionId;
        if (String(rec.source || '').trim() === 'Teacher Enrolled') {
          try {
            if (!String(rec.fellowshipCode || '').trim()) throw new Error('FellowshipCode is required for teacher enrollment.');
            var enrolled = ta_createOrReuseEnrolledStudent_(rec, sourceClassOptionId, classSession, classDate, teacherName || teacher.fullName || '', now, studentsCtx, applicantsCtx);
            rec.personId = enrolled.id;
            rec.studentId = enrolled.studentId || enrolled.id;
            rec.applicantId = enrolled.applicantId || rec.applicantId;
            rec.personType = 'Student';
            rec.fullName = enrolled.fullName || rec.fullName;
            rec.email = enrolled.email || rec.email;
          } catch (enrollErr) {
            ta_logError_({
              operationType: 'submitTeacherAttendance',
              failureReason: String((enrollErr && enrollErr.message) || enrollErr || 'unknown'),
              personId: rec.personId || '',
              ApplicantID: rec.applicantId || '',
              StudentID: rec.studentId || '',
              classOptionId: classId,
              sourceClassOptionId: sourceClassOptionId,
              classSession: classSession,
              classDate: classDate,
              teacherId: teacherId
            });
            continue;
          }
        }
        preparedRecords.push(rec);
      }

      for (var rj = 0; rj < preparedRecords.length; rj++) {
        var rec = preparedRecords[rj] || {};
        var personId = String(rec.personId || '').trim();
        if (!personId) continue;
        var logClassOptionId = String(rec.sourceClassOptionId || classId || '').trim();
        for (var si2 = 0; si2 < sessions.length; si2++) {
          var sessionKey = sessions[si2];
          var tupleKey = [personId.toLowerCase(), String(logClassOptionId || '').trim().toLowerCase(), String(sessionKey || '').trim().toLowerCase(), classDate].join('|');
          var existingLog = tupleSeen[tupleKey] || null;
          var isCrossClass = false;
          if (String(rec.personType || '').trim() === 'Student') {
            var rowObj = studentById[personId.toLowerCase()] || null;
            if (rowObj && studentClassOptCol >= 0) {
              var homeClass = String(rowObj.values[studentClassOptCol] || '').trim();
              isCrossClass = !!homeClass && homeClass !== logClassOptionId;
            }
          }
          if (existingLog) {
            var uv = existingLog.values.slice();
            if (statusCol >= 0) uv[statusCol] = String(rec.attendanceStatus || '').trim();
            if (teacherIdCol >= 0) uv[teacherIdCol] = teacherId;
            if (teacherNameCol >= 0) uv[teacherNameCol] = teacherName || teacher.fullName || '';
            if (crossClassCol >= 0) uv[crossClassCol] = isCrossClass ? 'TRUE' : 'FALSE';
            mutUpdates.push({ rowIndex: existingLog.rowIndex, values: uv });
          } else if (pendingTupleToAppendIndex[tupleKey] != null) {
            var px = pendingTupleToAppendIndex[tupleKey];
            var av = mutAppends[px].slice();
            if (statusCol >= 0) av[statusCol] = String(rec.attendanceStatus || '').trim();
            if (teacherIdCol >= 0) av[teacherIdCol] = teacherId;
            if (teacherNameCol >= 0) av[teacherNameCol] = teacherName || teacher.fullName || '';
            if (crossClassCol >= 0) av[crossClassCol] = isCrossClass ? 'TRUE' : 'FALSE';
            mutAppends[px] = av;
          } else {
            var row = lockedLogCtx.headers.map(function (h) {
              var map = {
                AttendanceID: ta_uuid_(), SubmittedAt: now, TeacherID: teacherId, TeacherName: teacherName || teacher.fullName || '',
                ClassOptionID: logClassOptionId, ClassSession: sessionKey, ClassDate: classDate,
                PersonID: String((rec && rec.personId) || '').trim(), PersonType: String((rec && rec.personType) || '').trim(),
                FullName: String((rec && rec.fullName) || '').trim(), Email: String((rec && rec.email) || '').trim(),
                AttendanceStatus: String((rec && rec.attendanceStatus) || '').trim(), FellowshipCode: classMeta.fellowship || '', BatchID: classMeta.batch || '',
                CrossClassVisit: isCrossClass ? 'TRUE' : 'FALSE'
              };
              return map[h] != null ? map[h] : '';
            });
            mutAppends.push(row);
            pendingTupleToAppendIndex[tupleKey] = mutAppends.length - 1;
          }
        }
      }

      ta_writeRowUpdatesBatched_(lockedLogCtx.sheet, lockedLogCtx.headers.length, mutUpdates);
      if (mutAppends.length) lockedLogCtx.sheet.getRange(lockedLogCtx.sheet.getLastRow() + 1, 1, mutAppends.length, lockedLogCtx.headers.length).setValues(mutAppends);

      var mutSession = sessions[0];
      var mut = ta_collectStudentMutations_(preparedRecords, classMeta, teacherName || teacher.fullName || '', mutSession, now, studentsCtx);
      ta_writeRowUpdatesBatched_(studentsCtx.sheet, studentsCtx.headers.length, mut.updates);
      if (mut.appends.length) {
        studentsCtx.sheet.getRange(studentsCtx.sheet.getLastRow() + 1, 1, mut.appends.length, studentsCtx.headers.length).setValues(mut.appends);
      }
      if (sessions.indexOf('Class1') >= 0) {
        var promoSession = sessions.indexOf('Class1') >= 0 ? 'Class1' : sessions[0];
        var promotions = ta_promoteApplicantsForClass1_(preparedRecords, classMeta, teacherName || teacher.fullName || '', classDate, promoSession, now, studentsCtx, applicantsCtx);
        ta_writeRowUpdatesBatched_(studentsCtx.sheet, studentsCtx.headers.length, promotions.updates);
        if (promotions.appends.length) {
          studentsCtx.sheet.getRange(studentsCtx.sheet.getLastRow() + 1, 1, promotions.appends.length, studentsCtx.headers.length).setValues(promotions.appends);
        }
        if (promotions.errors.length) {
          ta_logError_({ operationType: 'submitTeacherAttendance', promotionErrors: promotions.errors.slice(0, 20), executionTimestamp: ta_nowIso_() });
        }
      }
      return { attendanceId: ta_uuid_(), classOptionId: classId, classSession: sessions.join(','), classDate: classDate, submittedCount: preparedRecords.length };
    });
  } catch (err) {
    ta_logError_({
      teacherId: teacherId,
      classOptionId: classId,
      session: classSession,
      operationType: 'submitTeacherAttendance',
      executionTimestamp: ta_nowIso_(),
      failureReason: String((err && err.message) || err || 'unknown')
    });
    throw err;
  }
}

function ta_submitSessionOutcomes_(payload) {
  ta_ensureSheets_();
  var repoCtx = ta_repoContext_();
  var teacherId = String(payload.teacherId || '').trim();
  var teacherName = String(payload.teacherName || '').trim();
  var classOptionId = String(payload.classOptionId || '').trim();
  var classSession = String(payload.classSession || '').trim();
  var classDate = ta_date_(payload.classDate);
  var submitted = !!payload.submitted;
  var entries = Array.isArray(payload.entries) ? payload.entries : [];

  var teacher = ta_teacherById_(teacherId, repoCtx);
  if (!teacher) throw new Error('Teacher not found or inactive.');
  var owned = ta_classForTeacher_(classOptionId, teacherId, repoCtx);
  if (!owned || owned.mismatch || owned.inactive) throw new Error('You can only access your assigned classes.');

  try {
    return ta_withScriptLock_('submitSessionOutcomes', function () {
      var outCtx = ta_getRepo_(ta_repoContext_(), 'CLASS_OUTCOMES');
      var now = new Date();
      var rows = entries.map(function (e) {
        return outCtx.headers.map(function (h) {
          var m = {
            OutcomeID: ta_uuid_(), StudentID: String((e && e.studentId) || '').trim(), PersonType: String((e && e.personType) || '').trim(),
            FullName: String((e && e.fullName) || '').trim(), Email: String((e && e.email) || '').trim(),
            TeacherID: teacherId, TeacherName: teacherName || teacher.fullName || '', ClassOptionID: classOptionId,
            ClassSession: classSession, ClassDate: classDate, MilestoneID: String((e && e.milestoneId) || '').trim(),
            Question: String((e && e.question) || '').trim(), OutcomeResult: String((e && e.outcomeResult) || '').trim(),
            Submitted: submitted ? 'TRUE' : 'FALSE', SubmittedAt: now, AdminFollowUpNeeded: submitted ? 'FALSE' : 'TRUE', Notes: String((e && e.notes) || '').trim()
          };
          return m[h] != null ? m[h] : '';
        });
      });
      if (rows.length) outCtx.sheet.getRange(outCtx.sheet.getLastRow() + 1, 1, rows.length, outCtx.headers.length).setValues(rows);
      return { saved: rows.length, submitted: submitted };
    });
  } catch (err) {
    ta_logError_({
      teacherId: teacherId,
      classOptionId: classOptionId,
      session: classSession,
      operationType: 'submitSessionOutcomes',
      executionTimestamp: ta_nowIso_(),
      failureReason: String((err && err.message) || err || 'unknown')
    });
    throw err;
  }
}
