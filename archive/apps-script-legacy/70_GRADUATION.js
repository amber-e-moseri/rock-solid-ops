function grad_countTrue_(arr) { return arr.filter(Boolean).length; }

function grad_runGateCheck(batchID) {
  const stud = getSheet('STUDENTS').getDataRange().getValues();
  const att = getSheet('ATTENDANCE_LOG').getDataRange().getValues();
  const moodle = getSheet('MOODLE_SYNC').getDataRange().getValues();
  const reviewSh = getSheet('GRADUATION_REVIEW');
  const review = reviewSh.getDataRange().getValues();

  const SH = headerIndex(stud[0]);
  const AH = headerIndex(att[0]);
  const MH = headerIndex(moodle[0]);
  const RH = headerIndex(review[0]);

  const manualGate4 = new Map(review.slice(1).map(r => [`${r[RH.StudentID]}||${r[RH.BatchID]}`, r[RH.Gate4_CellIntegrated]]));
  const moodleByStudent = new Map(moodle.slice(1).map(r => [String(r[MH.StudentID] || '').trim(), r]));

  // STUDENTS attendance columns are legacy summary fields only.
  // Gate 1 must read ATTENDANCE_LOG as the source of truth.
  const attendanceByStudent = new Map();
  att.slice(1).forEach(r => {
    const sid = String(r[AH.StudentID] || '').trim();
    if (!sid) return;
    const set = attendanceByStudent.get(sid) || new Map();
    set.set(String(r[AH.ClassNumber] || ''), !!r[AH.Present] || !!r[AH.MadeUp]);
    attendanceByStudent.set(sid, set);
  });

  const existingRows = new Map(review.slice(1).map((r, idx) => [`${r[RH.StudentID]}||${r[RH.BatchID]}`, idx + 2]));

  let appended = 0;
  let updated = 0;
  for (let i = 1; i < stud.length; i++) {
    const sid = String(stud[i][SH.StudentID] || '').trim();
    const studentBatch = String(stud[i][SH.BatchID] || '').trim();
    const status = String(stud[i][SH.Status] || '').trim();

    if (!sid || studentBatch !== String(batchID || '').trim() || !['Active', 'At Risk'].includes(status)) continue;

    const weeks = attendanceByStudent.get(sid) || new Map();
    const gate1 = ['1', '2', '3', '4', '5', '6', '7'].every(w => weeks.get(w));

    const mood = moodleByStudent.get(sid);
    const gate2 = !!mood && Number(mood[MH.AssignmentsCompleted] || 0) >= Number(mood[MH.AssignmentsTotal] || Infinity);
    const gate3 = !!mood && (String(mood[MH.ExamPassed] || '').toLowerCase() === 'true' || mood[MH.ExamPassed] === true);

    const gate4 = String(stud[i][SH.EligiblePoolStatus] || '').trim() === 'Graduated' || !!manualGate4.get(`${sid}||${studentBatch}`);
    const allGatesMet = gate1 && gate2 && gate3 && gate4;
    const gradStatus = allGatesMet ? 'Ready' : (grad_countTrue_([gate1, gate2, gate3, gate4]) === 3 ? 'Close' : 'Not Ready');

    const row = [sid, studentBatch, stud[i][SH.SubgroupID] || '', gate1, gate2, gate3, gate4, allGatesMet, gradStatus, '', new Date(), ''];
    const existing = existingRows.get(`${sid}||${studentBatch}`);
    if (existing) {
      reviewSh.getRange(existing, 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      reviewSh.appendRow(row);
      appended++;
    }
  }

  logSync_('GRAD_GATE', `updated=${updated}, appended=${appended} for ${batchID}`);
  if (typeof student_refreshProgressColumns_ === 'function') student_refreshProgressColumns_();
}

function grad_buildMakeupQueue_(batchID, graduationDate) {
  const review = getSheet('GRADUATION_REVIEW').getDataRange().getValues();
  const att = getSheet('ATTENDANCE_LOG').getDataRange().getValues();
  const queueSh = getSheet('MAKEUP_QUEUE');

  const RH = headerIndex(review[0]);
  const AH = headerIndex(att[0]);
  const rows = [];

  review.slice(1).forEach(r => {
    if (String(r[RH.BatchID] || '').trim() !== String(batchID || '').trim() || r[RH.Gate1_Attendance] === true) return;

    const sid = String(r[RH.StudentID] || '').trim();
    const presentWeeks = new Set(att.slice(1)
      .filter(a => String(a[AH.StudentID] || '').trim() === sid && (!!a[AH.Present] || !!a[AH.MadeUp]))
      .map(a => String(a[AH.ClassNumber] || '')));

    ['1', '2', '3', '4', '5', '6', '7'].forEach(w => {
      if (!presentWeeks.has(w)) {
        rows.push([
          sid,
          r[RH.SubgroupID] || '',
          batchID,
          w,
          'Standard',
          new Date(),
          new Date(new Date(graduationDate).getTime() - 7 * 86400000),
          false,
          '',
          '',
          ''
        ]);
      }
    });
  });

  if (rows.length) queueSh.getRange(queueSh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

function grad_runEscalationAtTMinus7_(batchID, graduationDate) {
  const q = getSheet('MAKEUP_QUEUE').getDataRange().getValues();
  const H = headerIndex(q[0]);
  const unresolved = q.slice(1).filter(r => String(r[H.BatchID] || '').trim() === String(batchID || '').trim() && !r[H.MakeupCompleted]);
  logSync_('MAKEUP_ESCALATE', `${unresolved.length} unresolved makeups at T-7 for ${batchID}`);
  return unresolved.length;
}

function grad_runGateCheck_fromMenu() {
  const batchID = Browser.inputBox('Run graduation gate check', 'Enter BatchID', Browser.Buttons.OK_CANCEL);
  if (batchID && batchID !== 'cancel') grad_runGateCheck(batchID);
}

function grad_buildMakeupQueue_fromMenu() {
  const batchID = Browser.inputBox('Build make-up queue', 'Enter BatchID', Browser.Buttons.OK_CANCEL);
  const gradDate = Browser.inputBox('Build make-up queue', 'Enter graduation date (YYYY-MM-DD)', Browser.Buttons.OK_CANCEL);
  if (batchID && gradDate && batchID !== 'cancel' && gradDate !== 'cancel') grad_buildMakeupQueue_(batchID, new Date(gradDate));
}
