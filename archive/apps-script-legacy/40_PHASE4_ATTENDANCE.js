function onFormSubmit_Attendance(e) {
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const ans = {};
  headers.forEach((h, i) => {
    ans[h] = e.values[i];
  });

  const classID = ans['ClassID'] || ans['Class'];
  const teacherName = ans['TeacherName'] || '';
  const rawWeek = ans['Week'];
  const week = Array.isArray(rawWeek) ? rawWeek[0] : rawWeek;

  const presentRaw = ans['Present Students'];
  const presentArr = Array.isArray(presentRaw) ? presentRaw : (presentRaw ? [presentRaw] : []);
  const presentIDs = parseStudentIDsFromCheckboxSafe_(presentArr);

  const studentsSheet = getSheet('STUDENTS');
  const studentsData = studentsSheet.getDataRange().getValues();
  const H = headerIndex(studentsData[0]);

  const rowsToWrite = [];
  for (let i = 1; i < studentsData.length; i++) {
    const row = studentsData[i];
    if (row[H.ClassAssigned] !== classID) continue;

    const studentID = row[H.StudentID];
    const present = presentIDs.includes(studentID);
    rowsToWrite.push({
      StudentID: studentID,
      ClassID: classID,
      TeacherName: teacherName,
      Week: week,
      Present: present,
      ResponseID: e.response ? e.response.getId() : ''
    });
  }

  // STUDENTS attendance columns are legacy summary fields only.
  // ATTENDANCE_LOG is the source of truth for attendance state.
  attLog_writeBatch_(rowsToWrite);

  attFlag_checkClass1NoShow_(classID, teacherName, week, new Set(presentIDs.map(v => String(v || '').toLowerCase())));
  attFlag_checkRepeatAbsentee_(classID);
}

function syncStudentsFromApplicants() {
  if (typeof schema_ensureColumns_ === 'function') {
    schema_ensureColumns_('STUDENTS', ['Phone', 'RegistrationDate', 'ClassAssigned', 'BatchID', 'GroupID', 'SubgroupID']);
  }

  const applicantsSh = getSheet('APPLICANTS');
  const studentsSh = getSheet('STUDENTS');
  const applicants = applicantsSh.getDataRange().getValues();
  const students = studentsSh.getDataRange().getValues();
  if (applicants.length < 2 || students.length < 1) return 0;

  const AH = headerIndex(applicants[0]);
  const SH = headerIndex(students[0]);

  const emailToRow = new Map();
  for (let i = 1; i < students.length; i++) {
    const email = String(students[i][SH.Email] || '').trim().toLowerCase();
    if (email) emailToRow.set(email, i);
  }

  let inserted = 0;
  let updated = 0;
  const changedRows = new Set();
  const newRows = [];

  for (let i = 1; i < applicants.length; i++) {
    const a = applicants[i];
    const status = String(a[AH.Status] || '').trim();
    if (status) assertValidStatus_(status, 'APPLICANTS row ' + (i + 1));
    if (status && status.toLowerCase() === 'withdrawn') continue;

    const email = String(a[AH.Email] || '').trim().toLowerCase();
    if (!email) continue;

    const registrationDate = phase4_parseDate_(a[AH.RegistrationDate] || a[AH.Timestamp]);
    const applicantPhone = String(a[AH.Phone] == null ? '' : a[AH.Phone]).trim();

    const existingRowIndex = emailToRow.get(email);
    if (existingRowIndex != null) {
      const row = students[existingRowIndex];
      const studentPhone = String(row[SH.Phone] == null ? '' : row[SH.Phone]).trim();
      const studentReg = phase4_parseDate_(row[SH.RegistrationDate]);

      if (!studentPhone && applicantPhone) {
        row[SH.Phone] = applicantPhone;
        changedRows.add(existingRowIndex);
      } else if (studentPhone && applicantPhone && studentPhone !== applicantPhone) {
        if (registrationDate && (!studentReg || registrationDate.getTime() >= studentReg.getTime())) {
          row[SH.Phone] = applicantPhone;
          if ('RegistrationDate' in SH) row[SH.RegistrationDate] = registrationDate;
          changedRows.add(existingRowIndex);
        }
      }

      if ('RegistrationDate' in SH && registrationDate && !row[SH.RegistrationDate]) {
        row[SH.RegistrationDate] = registrationDate;
        changedRows.add(existingRowIndex);
      }
      if ('ClassAssigned' in SH && !row[SH.ClassAssigned] && 'ClassID' in AH) {
        row[SH.ClassAssigned] = a[AH.ClassID];
        changedRows.add(existingRowIndex);
      }
      if ('SubgroupID' in SH && !row[SH.SubgroupID] && 'SubgroupID' in AH) {
        row[SH.SubgroupID] = a[AH.SubgroupID];
        changedRows.add(existingRowIndex);
      }
      if ('FullName' in SH && !row[SH.FullName] && 'FullName' in AH) {
        row[SH.FullName] = a[AH.FullName];
        changedRows.add(existingRowIndex);
      }
      if ('Status' in SH && !row[SH.Status]) {
        row[SH.Status] = assertValidStatus_('Active', 'STUDENTS row ' + (existingRowIndex + 1));
        changedRows.add(existingRowIndex);
      }
      continue;
    }

    const newRow = new Array(students[0].length).fill('');
    if ('StudentID' in SH) newRow[SH.StudentID] = Utilities.getUuid();
    if ('FullName' in SH && 'FullName' in AH) newRow[SH.FullName] = a[AH.FullName];
    if ('Email' in SH) newRow[SH.Email] = email;
    if ('Phone' in SH) newRow[SH.Phone] = applicantPhone;
    if ('RegistrationDate' in SH) newRow[SH.RegistrationDate] = registrationDate || '';
    if ('ClassAssigned' in SH && 'ClassID' in AH) newRow[SH.ClassAssigned] = a[AH.ClassID];
    if ('SubgroupID' in SH && 'SubgroupID' in AH) newRow[SH.SubgroupID] = a[AH.SubgroupID];
    if ('Status' in SH) newRow[SH.Status] = assertValidStatus_('Active', 'STUDENTS new row');
    newRows.push(newRow);
    inserted++;
  }

  changedRows.forEach(idx => {
    studentsSh.getRange(idx + 1, 1, 1, students[0].length).setValues([students[idx]]);
    updated++;
  });

  if (newRows.length) {
    studentsSh.getRange(studentsSh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  logSync_('SYNC_STUDENTS_FROM_APPLICANTS', `updated=${updated}, inserted=${inserted}`);
  return updated + inserted;
}

function phase4_parseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function syncAttendanceForm() {
  logSync_('PHASE4', 'syncAttendanceForm called - not yet implemented');
  uiAlert_('syncAttendanceForm: not yet implemented.');
}

function installAttendanceTrigger() {
  logSync_('PHASE4', 'installAttendanceTrigger called - not yet implemented');
  uiAlert_('installAttendanceTrigger: not yet implemented.');
}

function fs4_applyCheckboxesToAttendanceCols() {
  logSync_('PHASE4', 'fs4_applyCheckboxesToAttendanceCols called - not yet implemented');
  uiAlert_('fs4_applyCheckboxesToAttendanceCols: not yet implemented.');
}

function fs4_debugRoster() {
  logSync_('PHASE4', 'fs4_debugRoster called - not yet implemented');
  uiAlert_('fs4_debugRoster: not yet implemented.');
}
