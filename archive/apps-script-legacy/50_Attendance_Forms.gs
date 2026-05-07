/***************************************
 * 50_Attendance_Forms.gs
 *
 * Generates unique attendance forms per subgroup/class.
 * One form per GroupID + SubgroupID + ClassID.
 *
 * Uses Active = TRUE from CLASS_OPTIONS for attendance.
 * Forms show students from STUDENTS where GroupID, SubgroupID, ClassID match.
 *
 * On submit, updates ATTENDANCE_LOG in the group's spreadsheet.
 ***************************************/

/* =========================
 * HELPERS
 * ========================= */

function getGroupSpreadsheet_(groupID) {
  const key = `GROUP_SHEET_ID_${groupID}`;
  const sheetId = String(getConfig(key) || '').trim();
  if (!sheetId) throw new Error(`${key} is empty in CONFIG.`);
  return SpreadsheetApp.openById(sheetId);
}

function getGroupSheet_(groupID, sheetName) {
  const ss = getGroupSpreadsheet_(groupID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`${sheetName} sheet not found in group ${groupID} spreadsheet.`);
  return sheet;
}

function getActiveClassesForAttendance_(groupID) {
  const sheet = getGroupSheet_(groupID, SHEET_CLASS_OPTIONS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  const classes = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!isClassActive_(row, H)) continue;
    if (!isValidClassRow_(row, H)) continue;

    const subgroupID = String(row[H.SubgroupID] || '').trim();
    if (!subgroupID) throw new Error(`CLASS_OPTIONS row ${i + 1} missing SubgroupID for group ${groupID}.`);

    classes.push({
      groupID: groupID,
      subgroupID: subgroupID,
      classID: String(row[H.ClassID] || '').trim(),
      teacherID: String(row[H.TeacherID] || '').trim(),
      teacherName: String(row[H.TeacherName] || '').trim(),
      day: normalizeWeekday(row[H.Day]),
      time: formatTime(row[H.Time])
    });
  }
  return classes;
}

function getStudentsForSubgroupClass_(groupID, subgroupID, classID) {
  const sheet = getGroupSheet_(groupID, SHEET_STUDENTS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  const students = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sGroupID = String(row[H.GroupID] || '').trim();
    const sSubgroupID = String(row[H.SubgroupID] || '').trim();
    const sClassID = String(row[H.ClassID] || '').trim();
    const studentID = String(row[H.StudentID] || '').trim();
    const fullName = String(row[H.FullName] || row[H.Name] || '').trim();

    if (sGroupID === groupID && sSubgroupID === subgroupID && sClassID === classID && studentID && fullName) {
      students.push({
        studentID: studentID,
        fullName: fullName,
        batchID: String(row[H.BatchID] || '').trim()
      });
    }
  }
  return students;
}

function getAttendanceFormRegistry_() {
  const sheet = getSheet(SHEET_ATTENDANCE_FORMS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return new Map();

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  const registry = new Map();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = `${row[H.GroupID]}-${row[H.SubgroupID]}-${row[H.ClassID]}`;
    registry.set(key, {
      attendanceFormID: String(row[H.AttendanceFormID] || '').trim(),
      groupID: String(row[H.GroupID] || '').trim(),
      subgroupID: String(row[H.SubgroupID] || '').trim(),
      classID: String(row[H.ClassID] || '').trim(),
      teacherID: String(row[H.TeacherID] || '').trim(),
      teacherName: String(row[H.TeacherName] || '').trim(),
      formID: String(row[H.FormID] || '').trim(),
      formEditUrl: String(row[H.FormEditUrl] || '').trim(),
      formPublishedUrl: String(row[H.FormPublishedUrl] || '').trim(),
      active: isTrue(row[H.Active]),
      lastSynced: row[H.LastSynced] instanceof Date ? row[H.LastSynced] : null
    });
  }
  return registry;
}

function getOrCreateSubgroupAttendanceForm_(groupID, classRow) {
  const registry = getAttendanceFormRegistry_();
  const key = `${groupID}-${classRow.subgroupID}-${classRow.classID}`;

  if (registry.has(key)) {
    const entry = registry.get(key);
    if (entry.active) {
      return { form: FormApp.openById(entry.formID), entry: entry, created: false };
    } else {
      // Reactivate if needed
      entry.active = true;
      updateRegistryEntry_(entry);
      return { form: FormApp.openById(entry.formID), entry: entry, created: false };
    }
  }

  // Create new form
  const title = `${ATTENDANCE_FORM_TITLE_PREFIX} - ${groupID} - ${classRow.subgroupID} - ${classRow.teacherName}`;
  const description = ATTENDANCE_FORM_DESCRIPTION_TEMPLATE
    .replace('{GroupID}', groupID)
    .replace('{SubgroupID}', classRow.subgroupID)
    .replace('{ClassID}', classRow.classID)
    .replace('{TeacherName}', classRow.teacherName)
    .replace('{Day}', classRow.day)
    .replace('{Time}', classRow.time);

  const form = FormApp.create(title).setDescription(description);

  // Add questions
  ATTENDANCE_QUESTIONS.forEach(q => {
    if (q.type === 'DATE') {
      form.addDateItem().setTitle(q.title).setRequired(q.required);
    } else if (q.type === 'CHOICE') {
      form.addMultipleChoiceItem().setTitle(q.title).setRequired(q.required).setChoiceValues(q.options);
    } else if (q.type === 'CHECKBOX') {
      // Will be updated with students
      form.addCheckboxItem().setTitle(q.title).setRequired(q.required);
    }
  });

  const formID = form.getId();
  const editUrl = form.getEditUrl();
  const publishedUrl = form.getPublishedUrl();

  const entry = {
    attendanceFormID: Utilities.getUuid(),
    groupID: groupID,
    subgroupID: classRow.subgroupID,
    classID: classRow.classID,
    teacherID: classRow.teacherID,
    teacherName: classRow.teacherName,
    formID: formID,
    formEditUrl: editUrl,
    formPublishedUrl: publishedUrl,
    active: true,
    lastSynced: new Date()
  };

  addRegistryEntry_(entry);

  return { form: form, entry: entry, created: true };
}

function syncSubgroupAttendanceFormStudents_(form, students, classRow) {
  const items = form.getItems();
  const checkboxItem = items.find(item => item.getTitle() === 'Students Present');
  if (!checkboxItem) return;

  const options = students.length
    ? students.map(s => `${s.fullName} [${s.studentID}]`)
    : ['No students enrolled yet'];

  checkboxItem.asCheckboxItem().setChoiceValues(options);
}

function installAttendanceFormTriggers_() {
  const registry = getAttendanceFormRegistry_();
  registry.forEach(entry => {
    if (!entry.active) return;
    const form = FormApp.openById(entry.formID);
    // Install trigger if not exists
    const triggers = ScriptApp.getUserTriggers(form);
    const hasTrigger = triggers.some(t => t.getHandlerFunction() === 'onAttendanceFormSubmit');
    if (!hasTrigger) {
      ScriptApp.newTrigger('onAttendanceFormSubmit').forForm(form).onFormSubmit().create();
    }
  });
}

function onAttendanceFormSubmit(e) {
  const form = e.source;
  const formID = form.getId();
  const registry = getAttendanceFormRegistry_();
  const entry = Array.from(registry.values()).find(e => e.formID === formID);
  if (!entry) return;

  const response = e.response;
  const itemResponses = response.getItemResponses();
  const responseData = {};

  itemResponses.forEach(ir => {
    const title = ir.getItem().getTitle();
    responseData[title] = ir.getResponse();
  });

  writeSubgroupAttendanceToLog_(entry.groupID, entry.subgroupID, entry.classID, responseData);
}

function writeSubgroupAttendanceToLog_(groupID, subgroupID, classID, responseData) {
  const attendanceDate = responseData['Attendance Date'];
  const classWeek = responseData['Class Week'];
  const presentResponses = Array.isArray(responseData['Students Present']) ? responseData['Students Present'] : [];

  const presentStudentIDs = presentResponses.map(r => {
    const match = r.match(/\[(.+)\]/);
    return match ? match[1] : null;
  }).filter(Boolean);

  const students = getStudentsForSubgroupClass_(groupID, subgroupID, classID);
  const sheet = getGroupSheet_(groupID, SHEET_ATTENDANCE_LOG);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  students.forEach(student => {
    const present = presentStudentIDs.includes(student.studentID);
    const row = new Array(headers.length).fill('');
    row[H.AttendanceID] = Utilities.getUuid();
    row[H.StudentID] = student.studentID;
    row[H.GroupID] = groupID;
    row[H.SubgroupID] = subgroupID;
    row[H.BatchID] = student.batchID;
    row[H.ClassID] = classID;
    row[H.ClassWeek] = classWeek;
    row[H.Present] = present;
    row[H.AttendanceDate] = attendanceDate;
    row[H.SubmittedAt] = new Date();

    sheet.appendRow(row);
  });
}

/* =========================
 * REGISTRY HELPERS
 * ========================= */

function ensureAttendanceFormsSheet_() {
  const sheet = ensureSheet(SHEET_ATTENDANCE_FORMS, ATTENDANCE_FORMS_HEADERS);
  return sheet;
}

function addRegistryEntry_(entry) {
  const sheet = ensureAttendanceFormsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const H = headerIndexLoose(headers);
  const row = new Array(headers.length).fill('');

  row[H.AttendanceFormID] = entry.attendanceFormID;
  row[H.GroupID] = entry.groupID;
  row[H.SubgroupID] = entry.subgroupID;
  row[H.ClassID] = entry.classID;
  row[H.TeacherID] = entry.teacherID;
  row[H.TeacherName] = entry.teacherName;
  row[H.FormID] = entry.formID;
  row[H.FormEditUrl] = entry.formEditUrl;
  row[H.FormPublishedUrl] = entry.formPublishedUrl;
  row[H.Active] = entry.active;
  row[H.LastSynced] = entry.lastSynced;

  sheet.appendRow(row);
}

function updateRegistryEntry_(entry) {
  const sheet = ensureAttendanceFormsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][H.AttendanceFormID]) === entry.attendanceFormID) {
      data[i][H.Active] = entry.active;
      data[i][H.LastSynced] = entry.lastSynced;
      sheet.getRange(2, 1, data.length - 1, headers.length).setValues(data.slice(1));
      break;
    }
  }
}

/* =========================
 * MAIN FUNCTIONS
 * ========================= */

function RUN_ME_generateSubgroupAttendanceForms() {
  const groups = ['CE', 'CS', 'WS'];
  groups.forEach(groupID => {
    const classes = getActiveClassesForAttendance_(groupID);
    classes.forEach(classRow => {
      const { form, entry, created } = getOrCreateSubgroupAttendanceForm_(groupID, classRow);
      const students = getStudentsForSubgroupClass_(groupID, classRow.subgroupID, classRow.classID);
      syncSubgroupAttendanceFormStudents_(form, students, classRow);
      Logger.log(`${created ? 'Created' : 'Updated'} form for ${groupID}-${classRow.subgroupID}-${classRow.classID}`);
    });
  });
  Logger.log('Subgroup attendance forms generated.');
}

function RUN_ME_syncSubgroupAttendanceForms() {
  const registry = getAttendanceFormRegistry_();
  registry.forEach(entry => {
    if (!entry.active) return;
    const students = getStudentsForSubgroupClass_(entry.groupID, entry.subgroupID, entry.classID);
    const form = FormApp.openById(entry.formID);
    syncSubgroupAttendanceFormStudents_(form, students, entry);
    entry.lastSynced = new Date();
    updateRegistryEntry_(entry);
  });
  Logger.log('Subgroup attendance forms synced.');
}

function RUN_ME_installAttendanceFormTriggers() {
  installAttendanceFormTriggers_();
  Logger.log('Attendance form triggers installed.');
}