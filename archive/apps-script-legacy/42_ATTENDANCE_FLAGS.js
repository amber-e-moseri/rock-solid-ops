function attFlag_checkClass1NoShow_(classID, teacherName, week, presentIDs) {
  if (String(week) !== '1') return 0;
  const rosterByClass = typeof getActiveRosterFromStudentsByClass_ === 'function' ? getActiveRosterFromStudentsByClass_() : new Map();
  const roster = rosterByClass.get(classID) || [];
  const missing = roster.filter(s => !presentIDs.has(String(s.studentID || '').toLowerCase()));
  const sh = getSheet('STUDENTS');
  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0]);
  let count = 0;

  missing.forEach(student => {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][H.StudentID] || '').trim() === String(student.studentID || '').trim()) {
        if ('NeedsAttentionFlag' in H) data[i][H.NeedsAttentionFlag] = true;
        if ('NeedsAttentionReason' in H) data[i][H.NeedsAttentionReason] = 'Class 1 no-show';
        count++;
        break;
      }
    }
  });

  if (count) sh.getRange(2, 1, data.length - 1, data[0].length).setValues(data.slice(1));
  logSync_('CLASS1_NOSHOW', `${count} flag(s) fired for ${classID}`);
  return count;
}

function attFlag_checkRepeatAbsentee_(classID) {
  const sh = getSheet('ATTENDANCE_LOG');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;

  const H = headerIndex(data[0]);
  const byStudent = new Map();
  for (let i = 1; i < data.length; i++) {
    const sid = String(data[i][H.StudentID] || '').trim();
    if (!sid) continue;
    const classDate = data[i][H.ClassDate] instanceof Date ? data[i][H.ClassDate] : new Date(0);
    const arr = byStudent.get(sid) || [];
    arr.push({ row: i + 1, present: !!data[i][H.Present], classDate: classDate });
    byStudent.set(sid, arr);
  }

  let flagged = 0;
  byStudent.forEach(arr => {
    arr.sort((a, b) => a.classDate - b.classDate);
    const last3 = arr.slice(-3);
    const missed = last3.filter(x => !x.present).length;
    const last2 = arr.slice(-2);
    const twoConsecutive = last2.length === 2 && last2.every(x => !x.present);
    if (twoConsecutive || missed >= 2) {
      const target = last3[last3.length - 1];
      if ('RepeatAbsenteeFlag' in H) sh.getRange(target.row, H.RepeatAbsenteeFlag + 1).setValue(true);
      if ('ConsecutiveMissCount' in H) sh.getRange(target.row, H.ConsecutiveMissCount + 1).setValue(missed);
      flagged++;
    }
  });

  logSync_('REPEAT_ABSENTEE', `${flagged} flag(s) fired for ${classID}`);
  return flagged;
}

function attFlag_checkMissingSubmission_(classID, classDate) {
  const sh = getSheet('ATTENDANCE_LOG');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return false;

  const H = headerIndex(data[0]);
  const tz = getConfig('SYSTEM_TIMEZONE') || 'America/Toronto';
  const sameDay = d => Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd');
  const found = data.slice(1).some(r => String(r[H.ClassDate] || '') && sameDay(r[H.ClassDate]) === sameDay(classDate));

  if (!found) logSync_('MISSING_SUBMISSION', `No attendance found for ${classID} on ${sameDay(classDate)}`);
  return !found;
}
