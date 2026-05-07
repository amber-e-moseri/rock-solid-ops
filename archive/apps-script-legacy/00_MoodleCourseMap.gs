function getMoodleCourseMapFromSheet_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('MOODLE_COURSES');
    if (!sh) return {};

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return {};

    const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(function (h) { return String(h || '').trim(); });
    const H = headerIndexLoose(headers);

    const subgroupIdx = (H.subgroupid != null) ? H.subgroupid : (H.subgroup_id != null ? H.subgroup_id : null);
    const courseIdIdx = (H.courseid != null) ? H.courseid : (H.course_id != null ? H.course_id : null);
    const activeIdx = (H.active != null) ? H.active : null;

    if (subgroupIdx == null || courseIdIdx == null) return {};

    const out = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row.length) continue;

      const subgroupID = String(row[subgroupIdx] || '').trim().toUpperCase();
      const courseID = String(row[courseIdIdx] || '').trim();
      const activeRaw = activeIdx != null ? String(row[activeIdx] || '').trim().toLowerCase() : 'true';
      const isActive = activeRaw === 'true' || activeRaw === 'yes';

      if (!subgroupID || !courseID || !isActive) continue;
      out[subgroupID] = courseID;
    }
    return out;
  } catch (err) {
    return {};
  }
}

function setupMoodleCoursesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = ['SubgroupID', 'CourseID', 'Active'];
  let sh = ss.getSheetByName('MOODLE_COURSES');

  if (!sh) {
    sh = ss.insertSheet('MOODLE_COURSES');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
    const set = {};
    existing.forEach(function (h) { if (h) set[h] = true; });
    const missing = headers.filter(function (h) { return !set[h]; });
    if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }

  const subgroupSet = {};
  const subgroupList = [];
  try {
    const fm = ss.getSheetByName('FELLOWSHIP_MAP');
    if (fm && fm.getLastRow() >= 2) {
      const values = fm.getDataRange().getValues();
      const H = headerIndexLoose(values[0].map(function (h) { return String(h || '').trim(); }));
      const subgroupIdx = H.subgroupid != null ? H.subgroupid : (H.subgroup_id != null ? H.subgroup_id : null);
      if (subgroupIdx != null) {
        for (let i = 1; i < values.length; i++) {
          const subgroup = String(values[i][subgroupIdx] || '').trim().toUpperCase();
          if (!subgroup || subgroupSet[subgroup]) continue;
          subgroupSet[subgroup] = true;
          subgroupList.push(subgroup);
        }
      }
    }
  } catch (err) {}

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const data = lastRow >= 2 ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [headers];
  const Hm = headerIndexLoose(data[0].map(function (h) { return String(h || '').trim(); }));
  const subCol = Hm.subgroupid != null ? Hm.subgroupid : (Hm.subgroup_id != null ? Hm.subgroup_id : null);
  const courseCol = Hm.courseid != null ? Hm.courseid : (Hm.course_id != null ? Hm.course_id : null);
  const activeCol = Hm.active != null ? Hm.active : null;

  const existing = {};
  if (subCol != null && data.length >= 2) {
    for (let r = 1; r < data.length; r++) {
      const key = String(data[r][subCol] || '').trim().toUpperCase();
      if (key) existing[key] = true;
    }
  }

  if (subCol != null && courseCol != null && activeCol != null) {
    const rows = [];
    subgroupList.forEach(function (subgroup) {
      if (existing[subgroup]) return;
      const row = new Array(sh.getLastColumn()).fill('');
      row[subCol] = subgroup;
      row[courseCol] = '';
      row[activeCol] = 'TRUE';
      rows.push(row);
    });
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
  }

  if (sh.getLastColumn() > 0) {
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, sh.getLastColumn());
  }
  return { ok: true, seeded: subgroupList.length };
}

function promptUpdateMoodleCourseIDs() {
  const ui = SpreadsheetApp.getUi();
  setupMoodleCoursesSheet();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MOODLE_COURSES');
  if (!sh || sh.getLastRow() < 2) {
    ui.alert('No subgroup rows found in MOODLE_COURSES.');
    return { ok: false, reason: 'no_rows' };
  }

  const data = sh.getDataRange().getValues();
  const H = headerIndexLoose(data[0].map(function (h) { return String(h || '').trim(); }));
  const subgroupIdx = H.subgroupid != null ? H.subgroupid : (H.subgroup_id != null ? H.subgroup_id : null);
  const courseIdx = H.courseid != null ? H.courseid : (H.course_id != null ? H.course_id : null);
  const activeIdx = H.active != null ? H.active : null;
  if (subgroupIdx == null || courseIdx == null) {
    ui.alert('MOODLE_COURSES is missing required headers (SubgroupID, CourseID).');
    return { ok: false, reason: 'missing_headers' };
  }

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const subgroup = String(data[i][subgroupIdx] || '').trim().toUpperCase();
    if (!subgroup) continue;
    const activeRaw = activeIdx != null ? String(data[i][activeIdx] || '').trim().toLowerCase() : 'true';
    const isActive = activeRaw === 'true' || activeRaw === 'yes' || activeRaw === '1' || activeRaw === '';
    if (!isActive) continue;

    const current = String(data[i][courseIdx] || '').trim();
    const res = ui.prompt(
      `Moodle Course ID — ${subgroup}`,
      `Enter the Moodle Course ID for ${subgroup} this month.\nCurrent value: ${current || '(blank)'}\n\nLeave blank to keep current.`,
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() !== ui.Button.OK) continue;

    const input = String(res.getResponseText() || '').trim();
    if (!input) continue;
    if (!/^\d+$/.test(input)) {
      ui.alert(`Invalid Course ID for ${subgroup}. Use numeric values only.`);
      continue;
    }

    sh.getRange(i + 1, courseIdx + 1).setValue(input);
    updated++;
  }

  ui.alert(`Moodle course mapping update complete. Rows updated: ${updated}`);
  return { ok: true, updated: updated };
}

function clearMoodleCourseIDs() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MOODLE_COURSES');
  if (!sh || sh.getLastRow() < 2) {
    ui.alert('MOODLE_COURSES is empty or missing.');
    return { ok: false, reason: 'missing_sheet_or_rows' };
  }

  const confirm = ui.alert(
    'Clear all Moodle Course IDs',
    'This will clear all CourseID values in MOODLE_COURSES. Subgroup rows and Active flags will remain.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return { ok: false, reason: 'cancelled' };

  const data = sh.getDataRange().getValues();
  const H = headerIndexLoose(data[0].map(function (h) { return String(h || '').trim(); }));
  const courseIdx = H.courseid != null ? H.courseid : (H.course_id != null ? H.course_id : null);
  if (courseIdx == null) {
    ui.alert('MOODLE_COURSES missing CourseID header.');
    return { ok: false, reason: 'missing_courseid' };
  }

  if (sh.getLastRow() >= 2) {
    sh.getRange(2, courseIdx + 1, sh.getLastRow() - 1, 1).clearContent();
  }
  ui.alert('All CourseID values cleared.');
  return { ok: true };
}

function testMoodleConnection() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getMoodleConfig_();
  if (!cfg.enabled) {
    ui.alert('Moodle is disabled (MOODLE_ENABLED is not truthy).');
    return { ok: false, reason: 'disabled' };
  }
  if (!cfg.url || !cfg.token) {
    ui.alert('Missing MOODLE_URL or MOODLE_TOKEN.');
    return { ok: false, reason: 'missing_config' };
  }

  try {
    const url = cfg.url + '/webservice/rest/server.php?' + objectToQueryString_({
      wstoken: cfg.token,
      wsfunction: 'core_webservice_get_site_info',
      moodlewsrestformat: 'json'
    });
    const resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const code = resp.getResponseCode();
    const text = resp.getContentText() || '';
    const data = JSON.parse(text || '{}');
    if (code >= 200 && code < 300 && !data.exception) {
      ui.alert('Moodle connection OK.');
      return { ok: true, siteName: String(data.sitename || '') };
    }
    ui.alert('Moodle connection failed.\n' + String(data.message || data.error || ('HTTP ' + code)));
    return { ok: false, reason: String(data.message || data.error || ('http_' + code)) };
  } catch (err) {
    ui.alert('Moodle connection test error: ' + String((err && err.message) || err));
    return { ok: false, reason: 'exception' };
  }
}
