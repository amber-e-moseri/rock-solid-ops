function attLog_migrateHeaders_() {
  const required = [
    "AttendanceID","StudentID","GroupID","SubgroupID","BatchID",
    "ClassID","TeacherName",
    "ClassNumber","ClassDate","Present","MadeUp","MakeupDate",
    "SubmittedByTeacher","SubmissionDate","MissingSubmissionFlag",
    "Class1NoShowFlag","ConsecutiveMissCount","RepeatAbsenteeFlag",
    "ResponseID","LoggedAt"
  ];

  const sheet = getSheet("ATTENDANCE_LOG");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const missing = required.filter(h => !headers.includes(h));

  if (missing.length === 0) return;

  sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);

  logSync_("ATTENDANCE_LOG MIGRATION", {
    addedColumns: missing
  });
}


function attLog_writeBatch_(rows) {
  if (!rows || rows.length === 0) return;

  const sheet = getSheet("ATTENDANCE_LOG");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const H = headerIndex(headers);

  const output = rows.map(r => {
    const row = new Array(headers.length).fill("");

    row[H["AttendanceID"]] = Utilities.getUuid();
    row[H["StudentID"]] = r.StudentID;
    if ("ClassID" in H) row[H["ClassID"]] = r.ClassID || "";
    if ("TeacherName" in H) row[H["TeacherName"]] = r.TeacherName || "";
    row[H["Present"]] = r.Present;
    row[H["ClassNumber"]] = r.Week;
    row[H["SubmissionDate"]] = new Date();
    row[H["SubmittedByTeacher"]] = true;
    row[H["ResponseID"]] = r.ResponseID || "";
    row[H["LoggedAt"]] = new Date();

    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, headers.length)
    .setValues(output);
}


function parseStudentIDsFromCheckboxSafe_(input) {
  if (!input) return [];

  const arr = Array.isArray(input) ? input : [input];

  return arr.map(v => {
    if (!v) return "";
    // assume format "Name (ID)"
    const match = v.match(/\((.*?)\)/);
    return match ? match[1] : v;
  }).filter(Boolean);
}
