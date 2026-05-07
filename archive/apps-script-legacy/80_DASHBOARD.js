function buildAdminDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('DASHBOARD');
  if (!sh) sh = ss.insertSheet('DASHBOARD');

  const previousFilter = String(sh.getRange('B3').getValue() || '').trim();
  sh.clear();

  const now = new Date();
  sh.getRange('A1').setValue('Title');
  sh.getRange('B1').setValue('Foundation School Admin Dashboard');
  sh.getRange('A2').setValue('Last Refreshed');
  sh.getRange('B2').setValue(now);
  sh.getRange('A3').setValue('Filter GroupID');
  sh.getRange('B3').setValue(previousFilter);
  sh.getRange('A4').setValue('Instructions');
  sh.getRange('B4').setValue('Use menu to refresh dashboard');
  sh.getRange('A1:B1').setFontWeight('bold').setBackground('#2B6CB0').setFontColor('#ffffff');

  const groupFilter = String(sh.getRange('B3').getValue() || '').trim();

  const slots = getSheet('CLASS_SLOTS').getDataRange().getValues();
  const students = getSheet('STUDENTS').getDataRange().getValues();
  const att = getSheet('ATTENDANCE_LOG').getDataRange().getValues();
  const pool = getSheet('ELIGIBLE_POOL').getDataRange().getValues();
  const grad = getSheet('GRADUATION_REVIEW').getDataRange().getValues();

  const slotH = headerIndex(slots[0]);
  const stuH = headerIndex(students[0]);
  const attH = headerIndex(att[0]);
  const poolH = headerIndex(pool[0]);
  const gradH = headerIndex(grad[0]);

  const studentById = new Map();
  const studentGroupById = new Map();
  students.slice(1).forEach(r => {
    const sid = String(r[stuH.StudentID] || '').trim();
    if (!sid) return;
    const gid = String(r[stuH.GroupID] || '').trim();
    studentGroupById.set(sid, gid);
    studentById.set(sid, {
      groupID: gid,
      classID: String((('ClassAssigned' in stuH) ? r[stuH.ClassAssigned] : '') || (('ClassID' in stuH) ? r[stuH.ClassID] : '') || '').trim(),
      fullName: String(r[stuH.FullName] || '').trim()
    });
  });

  let row = 7;
  function section(title, headers, rows) {
    sh.getRange(row, 1).setValue(title).setFontWeight('bold');
    row++;
    sh.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    row++;
    if (rows.length) sh.getRange(row, 1, rows.length, headers.length).setValues(rows);
    row += Math.max(rows.length, 1) + 2;
  }

  const classStatus = slots.slice(1)
    .filter(r => !groupFilter || String(r[slotH.GroupID] || '').trim() === groupFilter)
    .map(r => [
      r[slotH.ClassSlotID], r[slotH.TeacherName], r[slotH.SubgroupID],
      r[slotH.BatchID], r[slotH.Status], r[slotH.CurrentEnrolment], r[slotH.MaxCapacity], ''
    ]);
  section('SECTION 1 - Class Status', ['ClassSlotID', 'Teacher', 'Subgroup', 'BatchID', 'Status', 'CurrentEnrolment', 'MaxCapacity', 'Week'], classStatus);

  const byClass = {};
  students.slice(1).forEach(r => {
    if (groupFilter && String(r[stuH.GroupID] || '').trim() !== groupFilter) return;
    const cid = String((('ClassAssigned' in stuH) ? r[stuH.ClassAssigned] : '') || (('ClassID' in stuH) ? r[stuH.ClassID] : '') || '').trim();
    if (!cid) return;

    byClass[cid] = byClass[cid] || { teacher: (('TeacherName' in stuH) ? r[stuH.TeacherName] : ''), Enrolled: 0, Active: 0, 'At Risk': 0, Withdrawn: 0, Graduated: 0 };
    byClass[cid].Enrolled++;
    const s = String(r[stuH.Status] || '').trim();
    if (byClass[cid][s] != null) byClass[cid][s]++;
  });

  section(
    'SECTION 2 - Enrollment by Class',
    ['ClassSlotID', 'Teacher', 'Enrolled', 'Active', 'AtRisk', 'Withdrawn', 'Graduated'],
    Object.keys(byClass).map(cid => [cid, byClass[cid].teacher, byClass[cid].Enrolled, byClass[cid].Active, byClass[cid]['At Risk'], byClass[cid].Withdrawn, byClass[cid].Graduated])
  );

  // STUDENTS attendance columns are legacy summary fields only.
  // Attendance metrics below are derived from ATTENDANCE_LOG only.
  const attByClass = {};
  let latestAttendanceAt = null;
  att.slice(1).forEach(r => {
    const sid = String(r[attH.StudentID] || '').trim();
    if (!sid) return;

    const studentMeta = studentById.get(sid);
    if (groupFilter && (!studentMeta || studentMeta.groupID !== groupFilter)) return;

    const classID = String((('ClassID' in attH) ? r[attH.ClassID] : '') || (studentMeta ? studentMeta.classID : '') || 'UNMAPPED').trim();
    const wk = String(r[attH.ClassNumber] || '').trim();
    const present = !!r[attH.Present] || !!r[attH.MadeUp];

    attByClass[classID] = attByClass[classID] || { teacher: String(('TeacherName' in attH ? r[attH.TeacherName] : '') || ''), weeks: {}, missingSubmissions: 0 };
    attByClass[classID].weeks[wk] = (attByClass[classID].weeks[wk] || 0) + (present ? 1 : 0);

    const ts = ('SubmissionDate' in attH ? r[attH.SubmissionDate] : ('LoggedAt' in attH ? r[attH.LoggedAt] : null));
    if (ts instanceof Date && !isNaN(ts.getTime()) && (!latestAttendanceAt || ts.getTime() > latestAttendanceAt.getTime())) latestAttendanceAt = ts;
  });

  section(
    'SECTION 3 - Attendance by Class and Week',
    ['ClassSlotID', 'Teacher', 'Wk1', 'Wk2', 'Wk3', 'Wk4A', 'Wk4B', 'Wk5', 'Wk6', 'Wk7', 'MissingSubmissions'],
    Object.keys(attByClass).map(cid => [
      cid,
      attByClass[cid].teacher || '',
      attByClass[cid].weeks['1'] || 0,
      attByClass[cid].weeks['2'] || 0,
      attByClass[cid].weeks['3'] || 0,
      attByClass[cid].weeks['4A'] || 0,
      attByClass[cid].weeks['4B'] || 0,
      attByClass[cid].weeks['5'] || 0,
      attByClass[cid].weeks['6'] || 0,
      attByClass[cid].weeks['7'] || 0,
      attByClass[cid].missingSubmissions || 0
    ])
  );

  const needs = students.slice(1)
    .filter(r => (!groupFilter || String(r[stuH.GroupID] || '').trim() === groupFilter) && ('NeedsAttentionFlag' in stuH) && r[stuH.NeedsAttentionFlag])
    .map(r => [r[stuH.StudentID], r[stuH.FullName], (('ClassAssigned' in stuH) ? r[stuH.ClassAssigned] : ''), (('NeedsAttentionReason' in stuH) ? r[stuH.NeedsAttentionReason] : ''), (('Owner' in stuH) ? r[stuH.Owner] : ''), '']);
  section('SECTION 4 - Needs Attention', ['StudentID', 'FullName', 'Class', 'NeedsAttentionReason', 'Owner', 'DateFlagged'], needs);

  const poolRows = pool.slice(1).filter(r => !groupFilter || String(r[poolH.GroupID] || '').trim() === groupFilter);
  const summaryVals = [
    poolRows.filter(r => String(r[poolH.EligiblePoolStatus] || '').trim() === 'Not Started').length,
    poolRows.filter(r => String(r[poolH.EligiblePoolStatus] || '').trim() === 'Registered').length,
    poolRows.filter(r => String(r[poolH.EligiblePoolStatus] || '').trim() === 'In Progress').length,
    poolRows.filter(r => String(r[poolH.EligiblePoolStatus] || '').trim() === 'Graduated').length,
    poolRows.filter(r => !!r[poolH.EscalationFlag]).length
  ];
  section('SECTION 5 - Eligible Pool Summary', ['Not Started', 'Registered', 'In Progress', 'Graduated', 'Escalated'], [summaryVals]);

  const gradRows = grad.slice(1)
    .filter(r => {
      const sid = String(r[gradH.StudentID] || '').trim();
      const gid = studentGroupById.get(sid) || '';
      return !groupFilter || gid === groupFilter;
    })
    .map(r => [r[gradH.StudentID], '', r[gradH.Gate1_Attendance], r[gradH.Gate2_Assignments], r[gradH.Gate3_ExamPassed], r[gradH.Gate4_CellIntegrated], r[gradH.GraduationStatus], r[gradH.AllGatesMet]]);
  section('SECTION 6 - Graduation Readiness', ['StudentID', 'FullName', 'Gate1', 'Gate2', 'Gate3', 'Gate4', 'Status', 'AllGatesMet'], gradRows);

  const stale = !latestAttendanceAt || (now.getTime() - latestAttendanceAt.getTime()) > (24 * 60 * 60 * 1000);
  sh.getRange('A5').setValue('Warning');
  sh.getRange('B5').setValue(stale ? 'Dashboard may be stale. Refresh.' : '');
  if (stale) sh.getRange('B5').setFontColor('#B91C1C').setFontWeight('bold');

  if (typeof ensureFsControlPanel_ === 'function') ensureFsControlPanel_();
  logSync_('DASHBOARD_REFRESH', `Refreshed dashboard. groupFilter=${groupFilter || 'ALL'}`, {
    latestAttendanceAt: latestAttendanceAt ? latestAttendanceAt.toISOString() : null,
    stale: stale
  });

  return true;
}
