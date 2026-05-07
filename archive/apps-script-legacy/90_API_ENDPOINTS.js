
function api_unauthorized_() {
  return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
}
function api_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function api_requireToken_(e) {
  const token = (e && e.parameter && e.parameter.token) || '';
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
  if (!expected) return true;
  return token === expected;
}
function api_requireTokenValue_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
  if (!expected) return true;
  return String(token || '') === expected;
}
function api_students_(groupID, subgroupID) {
  const data = getSheet('STUDENTS').getDataRange().getValues();
  const H = headerIndex(data[0]);
  return data.slice(1).filter(r => (!groupID || String(r[H['GroupID']]||'') === String(groupID)) && (!subgroupID || String(r[H['SubgroupID']]||'') === String(subgroupID))).map(r => ({
    StudentID:r[H['StudentID']], FullName:r[H['FullName']], GroupID:r[H['GroupID']], SubgroupID:r[H['SubgroupID']], NeedsAttentionFlag:r[H['NeedsAttentionFlag']], NeedsAttentionReason:r[H['NeedsAttentionReason']], Status:r[H['Status']], BatchID:r[H['BatchID']]
  }));
}
function api_flags_(groupID) {
  const ft = getSheet('FT_PIPELINE').getDataRange().getValues();
  const pool = getSheet('ELIGIBLE_POOL').getDataRange().getValues();
  const FH = headerIndex(ft[0]), PH = headerIndex(pool[0]);
  return {
    ftPipeline: ft.slice(1).filter(r => !!r[FH['Week3FlagFired']] || !!r[FH['Week6FlagFired']]).map(r => ({StudentID:r[FH['StudentID']], Email:r[FH['Email']], Week3FlagFired:r[FH['Week3FlagFired']], Week6FlagFired:r[FH['Week6FlagFired']]})),
    eligiblePool: pool.slice(1).filter(r => !!r[PH['EscalationFlag']] && (!groupID || String(r[PH['GroupID']]||'') === String(groupID))).map(r => ({StudentID:r[PH['StudentID']], Email:r[PH['Email']], EscalationFlag:r[PH['EscalationFlag']]}))
  };
}
function api_graduation_(batchID) {
  const data = getSheet('GRADUATION_REVIEW').getDataRange().getValues();
  const H = headerIndex(data[0]);
  return data.slice(1).filter(r => !batchID || String(r[H['BatchID']]||'') === String(batchID)).map(r => ({
    StudentID:r[H['StudentID']], BatchID:r[H['BatchID']], Gate1_Attendance:r[H['Gate1_Attendance']], Gate2_Assignments:r[H['Gate2_Assignments']], Gate3_ExamPassed:r[H['Gate3_ExamPassed']], Gate4_CellIntegrated:r[H['Gate4_CellIntegrated']], AllGatesMet:r[H['AllGatesMet']], GraduationStatus:r[H['GraduationStatus']]
  }));
}
function api_dashboard_(groupID) {
  buildAdminDashboard();
  return { ok:true, groupID:groupID || '', rebuiltAt:new Date() };
}
function doGetApi_(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  // ── PUBLIC READ ACTIONS — no token required ──────────────────
  // These are called directly from the teacher availability
  // scheduler HTML page which runs in the browser without a token.

  if (action === 'teacher_campuses' || action === 'getCampuses') {
    return api_json_({ ok: true, data: teacherAvail_getCampuses_() });
  }
  if (action === 'getTeachers') {
    return api_json_({ ok: true, data: teacherAvail_getTeachers_() });
  }
  if (action === 'debugCampuses') {
    return api_json_({ ok: true, data: debugCampuses_() });
  }
  if (action === 'debugTeachers') {
    return api_json_({ ok: true, data: debugTeachers_() });
  }
  if (action === 'teacher_availability' || action === 'loadAvailability') {
    const rows = teacherAvail_loadAvailability_({
      teacherEmail: (e && e.parameter && e.parameter.teacherEmail) || '',
      teacherName:  (e && e.parameter && e.parameter.teacherName)  || '',
      teacherTimezone: (e && e.parameter && e.parameter.teacherTimezone) || '',
      month:    (e && e.parameter && e.parameter.month)  || '',
      year:     (e && e.parameter && e.parameter.year)   || '',
      teacherID:(e && e.parameter && e.parameter.teacherID) || ''
    });
    return api_json_({ ok: true, data: rows });
  }
  if (action === 'getCampusSchedule') {
    return api_json_(getCampusSchedule(
      (e && e.parameter && e.parameter.campusCode) || '',
      (e && e.parameter && e.parameter.month)      || '',
      Number((e && e.parameter && e.parameter.year) || 0)
    ));
  }
  if (action === 'getGroupSchedule') {
    return api_json_(getGroupSchedule(
      (e && e.parameter && e.parameter.groupID)    || '',
      (e && e.parameter && e.parameter.subgroupID) || '',
      (e && e.parameter && e.parameter.month)      || '',
      Number((e && e.parameter && e.parameter.year) || 0)
    ));
  }
  if (action === 'getScheduledClasses') {
    return api_json_(getScheduledClasses({
      campusCode:  (e && e.parameter && e.parameter.campusCode)  || '',
      groupID:     (e && e.parameter && e.parameter.groupID)     || '',
      subgroupID:  (e && e.parameter && e.parameter.subgroupID)  || '',
      teacherID:   (e && e.parameter && e.parameter.teacherID)   || '',
      month:       (e && e.parameter && e.parameter.month)       || '',
      year:        (e && e.parameter && e.parameter.year)        || '',
      activeOnly:  (e && e.parameter && e.parameter.activeOnly)  || 'true'
    }));
  }
  if (action === 'getSchedulesForCampuses') {
    return api_json_({
      ok: true,
      data: getSchedulesForCampuses(
        (e && e.parameter && e.parameter.campusCodes) || '',
        (e && e.parameter && e.parameter.month) || '',
        Number((e && e.parameter && e.parameter.year) || 0)
      )
    });
  }
  if (action === 'getScheduledClassConflicts') {
    try {
      return api_json_({
        ok: true,
        data: getScheduledClassConflicts_((e && e.parameter && e.parameter.campusCodes) || '')
      });
    } catch (err) {
      return api_json_({ ok: false, error: String((err && err.message) || err || 'conflict load failed') });
    }
  }
  if (action === 'getAvailabilityForReview' || action === 'loadTeacherAvailabilityForReview') {
    return api_json_(loadTeacherAvailabilityForReview({
      month: (e && e.parameter && e.parameter.month) || '',
      year: (e && e.parameter && e.parameter.year) || '',
      teacher: (e && e.parameter && e.parameter.teacher) || '',
      campusCode: (e && e.parameter && e.parameter.campusCode) || '',
      status: (e && e.parameter && e.parameter.status) || '',
      groupId: (e && e.parameter && e.parameter.groupId) || ''
    }));
  }
  if (action === 'lookupTeacherForAttendance') {
    try {
      return api_json_(ta_respond_(true, ta_lookupTeacherForAttendance_((e && e.parameter && e.parameter.query) || ''), ''));
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'lookup failed')));
    }
  }
  if (action === 'getTeacherActiveClassOptions') {
    try {
      return api_json_(ta_respond_(true, ta_getTeacherActiveClassOptions_((e && e.parameter && e.parameter.teacherId) || ''), ''));
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'class options load failed')));
    }
  }
  if (action === 'loadAttendanceRoster') {
    try {
      var rosterData = ta_loadAttendanceRoster_(
        (e && e.parameter && e.parameter.teacherId) || '',
        (e && e.parameter && e.parameter.classOptionId) || '',
        (e && e.parameter && e.parameter.classSession) || ''
      );
      return api_json_({ ok: true, data: { roster: rosterData.data || [], alreadySubmitted: !!rosterData.alreadySubmitted, previousSubmissionSummary: rosterData.previousSubmissionSummary || null } });
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'roster load failed')));
    }
  }
  if (action === 'searchAttendancePerson') {
    try {
      return api_json_(ta_respond_(true, ta_searchAttendancePerson_(
        (e && e.parameter && e.parameter.teacherId) || '',
        (e && e.parameter && e.parameter.classOptionId) || '',
        (e && e.parameter && e.parameter.query) || ''
      ), ''));
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'search failed')));
    }
  }
  if (action === 'getTeacherClassProgressGrid') {
    try {
      return api_json_(ta_respond_(true, ta_getTeacherClassProgressGrid_(
        (e && e.parameter && e.parameter.teacherId) || '',
        (e && e.parameter && e.parameter.classOptionId) || ''
      ), ''));
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'progress grid load failed')));
    }
  }
  if (action === 'getMilestonesForSession') {
    try {
      return api_json_(ta_respond_(true, ta_getMilestonesForSession_((e && e.parameter && e.parameter.classSession) || ''), ''));
    } catch (err) {
      return api_json_(ta_respond_(false, null, String((err && err.message) || err || 'milestone load failed')));
    }
  }

  // ── PROTECTED ACTIONS — token required ────────────────────────
  if (!api_requireToken_(e)) return api_unauthorized_();

  if (action === 'students') {
    return api_json_({ ok: true, data: api_students_(e.parameter.groupID, e.parameter.subgroupID) });
  }
  if (action === 'dashboard') {
    return api_json_({ ok: true, data: api_dashboard_(e.parameter.groupID) });
  }
  if (action === 'flags') {
    return api_json_({ ok: true, data: api_flags_(e.parameter.groupID) });
  }
  if (action === 'graduation') {
    return api_json_({ ok: true, data: api_graduation_(e.parameter.batchID) });
  }
  if (action === 'setupSchedulerSheets') {
    return api_json_(setupSchedulerSheets());
  }
  if (action === 'getClassOptions') {
    return api_json_({
      ok: true,
      data: getClassOptions_({
        fellowshipCode: (e && e.parameter && e.parameter.fellowshipCode) || (e && e.parameter && e.parameter.campusCode) || ''
      })
    });
  }
  if (action === 'syncApprovedAvailabilityToClassOptions') {
    return api_json_(syncApprovedAvailabilityToClassOptions(
      (e && e.parameter && e.parameter.batchStartSunday) || ''
    ));
  }
  if (action === 'repairApprovedAvailabilityMissingClassOptions') {
    return api_json_(repairApprovedAvailabilityMissingClassOptions(
      (e && e.parameter && e.parameter.batchStartSunday) || ''
    ));
  }

  return api_json_({ ok: false, error: 'Unknown action' });
}

function doPostApi_(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (!(action === 'teacher_availability_submit' || action === 'submitAvailability' || action === 'submitTeacherAvailability' ||
    action === 'updateAvailabilityStatus' || action === 'resetTeacherAvailabilityStatus' ||
    action === 'bulkApproveTeacherAvailability' || action === 'bulkApproveCampusAvailability' ||
    action === 'cloneTeacherAvailabilityCampus' || action === 'deactivatePreviousMonthClassOptions' ||
    action === 'submitTeacherAttendance' || action === 'syncApprovedAvailabilityToClassOptions' ||
    action === 'repairApprovedAvailabilityMissingClassOptions' || action === 'submitSessionOutcomes')) {
    return api_json_({ ok: false, error: 'Unknown action' });
  }

  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return api_json_({ ok: false, error: 'Invalid JSON body' });
  }

  try {
    const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
    const token = (body && body.token) || (e && e.parameter && e.parameter.token) || '';
    // Keep scheduler/admin review actions public by default; enforce token for other actions when configured.
    const publicPostActions = {
      submitTeacherAvailability: true,
      submitAvailability: true,
      teacher_availability_submit: true,
      updateAvailabilityStatus: true,
      resetTeacherAvailabilityStatus: true,
      bulkApproveTeacherAvailability: true,
      bulkApproveCampusAvailability: true,
      cloneTeacherAvailabilityCampus: true,
      deactivatePreviousMonthClassOptions: true,
      submitTeacherAttendance: true,
      syncApprovedAvailabilityToClassOptions: true,
      repairApprovedAvailabilityMissingClassOptions: true,
      submitSessionOutcomes: true
    };
    if (expected && !publicPostActions[action] && !api_requireTokenValue_(token)) return api_unauthorized_();

    if (action === 'submitTeacherAvailability') {
      const resultDirect = submitTeacherAvailability_(body || {});
      return api_json_({ ok: true, data: resultDirect });
    }
    if (action === 'submitAvailability' || action === 'teacher_availability_submit') {
      // Backward-compatible: accept old payload array and map into scheduler v2 request.
      const payload = Array.isArray(body) ? body : (Array.isArray(body.payload) ? body.payload : []);
      if (!payload.length) return api_json_({ ok: false, error: 'Empty payload' });
      const first = payload[0] || {};
      const slots = payload.map(function (r) {
        return {
          campusCode: String(r.campusCode || r.fellowshipCode || '').trim(),
          teacherDay: String(r.teacherDay || r.day || '').trim(),
          teacherTime: String(r.teacherTime || r.time || '').trim()
        };
      }).filter(function (s) { return s.campusCode && s.teacherDay && s.teacherTime; });
      const resultCompat = submitTeacherAvailability_({
        teacherName: String(first.teacherName || '').trim(),
        teacherEmail: String(first.teacherEmail || '').trim(),
        teacherTimezone: String(first.teacherTimezone || 'America/Toronto').trim(),
        month: String(first.month || '').trim(),
        year: Number(first.year || 0),
        slots: slots
      });
      return api_json_({ ok: true, data: resultCompat });
    }
    if (action === 'updateAvailabilityStatus') {
      const resultStatus = updateTeacherAvailabilityStatus(
        String(body.recordId || ''),
        String(body.status || ''),
        String(body.notes || ''),
        String(body.reviewedBy || ''),
        String(body.batchStartSunday || '')
      );
      return api_json_(resultStatus);
    }
    if (action === 'resetTeacherAvailabilityStatus') {
      return api_json_(resetTeacherAvailabilityStatus(String(body.recordId || '')));
    }
    if (action === 'bulkApproveTeacherAvailability') {
      return api_json_(bulkApproveTeacherAvailability(
        String(body.teacherId || ''),
        String(body.month || ''),
        Number(body.year || 0),
        String(body.reviewedBy || ''),
        String(body.batchStartSunday || '')
      ));
    }
    if (action === 'bulkApproveCampusAvailability') {
      return api_json_(bulkApproveCampusAvailability(
        String(body.campusCode || ''),
        String(body.month || ''),
        Number(body.year || 0),
        String(body.reviewedBy || ''),
        String(body.batchStartSunday || '')
      ));
    }
    if (action === 'cloneTeacherAvailabilityCampus') {
      return api_json_(cloneTeacherAvailabilityCampus(
        String(body.recordId || ''),
        String(body.campusCode || '')
      ));
    }
    if (action === 'deactivatePreviousMonthClassOptions') {
      return api_json_(deactivatePreviousMonthClassOptions(
        String(body.currentMonth || ''),
        Number(body.currentYear || 0)
      ));
    }
    if (action === 'syncApprovedAvailabilityToClassOptions') {
      return api_json_(syncApprovedAvailabilityToClassOptions(
        (e && e.parameter && e.parameter.batchStartSunday) || String(body.batchStartSunday || '')
      ));
    }
    if (action === 'repairApprovedAvailabilityMissingClassOptions') {
      return api_json_(repairApprovedAvailabilityMissingClassOptions(
        (e && e.parameter && e.parameter.batchStartSunday) || String(body.batchStartSunday || '')
      ));
    }
    if (action === 'submitTeacherAttendance') {
      return api_json_(ta_respond_(true, ta_submitTeacherAttendance_(body || {}), ''));
    }
    if (action === 'submitSessionOutcomes') {
      return api_json_(ta_respond_(true, ta_submitSessionOutcomes_(body || {}), ''));
    }
    return api_json_({ ok: false, error: 'Unhandled action' });
  } catch (err) {
    return api_json_({ ok: false, error: String((err && err.message) || err || 'Submit failed') });
  }
}
