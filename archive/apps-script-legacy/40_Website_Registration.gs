/***************************************
 * 40_Website_Registration.gs
 *
 * Website registration receiver for the
 * Typeform-style frontend.
 ***************************************/

const APPLICANTS_HEADERS_WEBSITE = [
  'Timestamp',
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Fellowship Code',
  'Class Choice',
  'Class Day',
  'Class Time',
  'Class Start Date',
  'Teacher',
  'Class ID',
  'Born Again',
  'Speaks In Tongues',
  'Water Baptized',
  'Submitted At',
  'SubgroupID',
  'Source'
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim().toLowerCase();
    if (action) return doGetApi_(e);

    const resource = String((e && e.parameter && e.parameter.resource) || '').trim().toLowerCase();

    if (resource === 'fellowships') {
      return ContentService
        .createTextOutput(buildFellowshipsCsv_())
        .setMimeType(ContentService.MimeType.CSV);
    }

    if (resource === 'class_options') {
      return ContentService
        .createTextOutput(buildClassOptionsCsv_())
        .setMimeType(ContentService.MimeType.CSV);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'Website registration endpoint is live.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim().toLowerCase();
    if (action) {
      return doPostApi_(e);
    }

    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    const payload = {
      firstName: body.firstName || '',
      lastName: body.lastName || '',
      email: body.email || '',
      phone: body.phone || '',
      fellowshipName: body.fellowshipName || '',
      fellowshipCode: body.fellowshipCode || '',
      subgroup: body.subgroup || '',
      classChoice: body.classChoice || '',
      classLabel: body.classLabel || '',
      classDay: body.classDay || '',
      classTime: body.classTime || '',
      classStartDate: body.classStartDate || '',
      teacherName: body.teacherName || '',
      classId: body.classId || '',
      timezone: body.timezone || '',
      bornAgain: body.bornAgain || '',
      speaksInTongues: body.speaksInTongues || '',
      waterBaptized: body.waterBaptized || '',
      submittedAt: body.submittedAt || new Date().toISOString()
    };

    // Keep submission durable first: write to APPLICANTS before any external API.
    saveWebsiteRegistration_(payload);

    let mailchimpResult = { ok: false, reason: 'skipped' };
    try {
      mailchimpResult = subscribeToMailchimp_(payload);
    } catch (mailErr) {
      // Never break form submission for Mailchimp issues.
      logInfo('MAILCHIMP_SUBSCRIBE', 'Mailchimp call failed after sheet write', {
        error: String(mailErr && mailErr.message ? mailErr.message : mailErr)
      });
      mailchimpResult = { ok: false, reason: 'exception' };
    }

    let moodleResult = { ok: false, reason: 'skipped' };
    try {
      moodleResult = subscribeToMoodle_(payload);
    } catch (moodleErr) {
      // Never break form submission for Moodle issues.
      logInfo('MOODLE', 'Moodle call failed after sheet write', {
        error: String(moodleErr && moodleErr.message ? moodleErr.message : moodleErr)
      });
      moodleResult = { ok: false, reason: 'exception' };
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        mailchimpOk: !!mailchimpResult.ok,
        mailchimpReason: mailchimpResult.reason || '',
        moodleOk: !!moodleResult.ok,
        moodleReason: moodleResult.reason || ''
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function subscribeToMailchimp_(payload) {
  const cfg = getMailchimpConfig_();
  const enabled = !!cfg.enabled;
  if (!enabled) {
    logInfo('MAILCHIMP_SUBSCRIBE', 'Skipped (MAILCHIMP_ENABLED is not truthy)', {
      enabledRaw: String(cfg.enabledRaw || '')
    });
    return { ok: false, reason: `disabled:${String(cfg.enabledRaw || '').toLowerCase() || 'empty'}` };
  }

  const apiKey = String(cfg.apiKey || '').trim();
  const audienceId = String(cfg.audienceId || '').trim();
  const server = String(cfg.serverPrefix || '').trim().toLowerCase();
  const status = String(cfg.status || 'subscribed').trim().toLowerCase();
  if (!apiKey || !audienceId || !server) {
    logInfo('MAILCHIMP_SUBSCRIBE', 'Skipped (missing MAILCHIMP script properties)', {
      hasApiKey: !!apiKey,
      hasAudienceId: !!audienceId,
      hasServerPrefix: !!server
    });
    return { ok: false, reason: 'missing_config' };
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'missing_email' };
  const subscriberHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email)
    .map(function (b) {
      const v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    })
    .join('');
  const url = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`;
  const data = {
    email_address: email,
    status: status || 'subscribed',
    status_if_new: status || 'subscribed',
    merge_fields: {
      FNAME: String(payload.firstName || ''),
      LNAME: String(payload.lastName || ''),
      PHONE: String(payload.phone || ''),
      CAMPUS: String(payload.fellowshipName || ''),
      CAMPUSCODE: String(payload.fellowshipCode || ''),
      SUBGROUP: String(payload.subgroup || ''),
      CLASS_DAY: String(payload.classDay || ''),
      CLASS_TIME: String(payload.classTime || ''),
      CLASS_DATE: String(payload.classStartDate || ''),
      TEACHER: String(payload.teacherName || ''),
      CLASS_ID: String(payload.classId || ''),
      CLASSLABEL: String(payload.classLabel || payload.classChoice || ''),
      TIMEZONE: String(payload.timezone || ''),
      SOURCE: 'Foundation School Registration Form'
    },
    tags: [
      payload.fellowshipCode,
      payload.classChoice
    ].filter(Boolean)
  };

  logInfo('MAILCHIMP_SUBSCRIBE', 'Merge fields payload prepared', {
    email: email,
    mergeFields: data.merge_fields
  });

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + apiKey
      },
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const result = JSON.parse(response.getContentText() || '{}');
    if (code >= 200 && code < 300) {
      logInfo('MAILCHIMP_SUBSCRIBE', 'Success', { code: code, email: email, status: data.status_if_new });
      return { ok: true, reason: 'ok' };
    }
    if (result.status === 'subscribed' || !!result.id) {
      logInfo('MAILCHIMP_SUBSCRIBE', 'Success (member already existed or returned id)', { code: code, email: email });
      return { ok: true, reason: 'ok' };
    }
    logInfo('MAILCHIMP_SUBSCRIBE', 'Failed', {
      code: code,
      email: email,
      title: String(result.title || ''),
      detail: String(result.detail || '')
    });
    return { ok: false, reason: `http_${code}` };
  } catch (err) {
    logInfo('MAILCHIMP_SUBSCRIBE', 'Fetch exception', {
      email: email,
      error: String(err && err.message ? err.message : err)
    });
    return { ok: false, reason: 'fetch_error' };
  }
}

// ─────────────────────────────────────────────
//  MOODLE INTEGRATION
// ─────────────────────────────────────────────

/**
 * Fellowship code -> Moodle Course ID map.
 * Replace placeholder values or override with Script Property:
 * MOODLE_COURSE_MAP_JSON='{"CESGA":"123","CSGA":"456"}'
 */
const MOODLE_COURSE_MAP = {
  CESGA: 'REPLACE_WITH_COURSE_ID',
  CESGB: 'REPLACE_WITH_COURSE_ID',
  CSGA: 'REPLACE_WITH_COURSE_ID',
  CSGB: 'REPLACE_WITH_COURSE_ID',
  WSGA: 'REPLACE_WITH_COURSE_ID',
  WSGB: 'REPLACE_WITH_COURSE_ID'
};

function getMoodleConfig_() {
  const props = PropertiesService.getScriptProperties();
  const enabledRaw = String(props.getProperty('MOODLE_ENABLED') || '').trim();
  const mapJson = String(props.getProperty('MOODLE_COURSE_MAP_JSON') || '').trim();
  let courseMap = getMoodleCourseMapFromSheet_() || {};
  if (!Object.keys(courseMap).length && mapJson) {
    try {
      const parsed = JSON.parse(mapJson);
      if (parsed && typeof parsed === 'object') courseMap = parsed;
    } catch (err) {
      logInfo('MOODLE', 'Invalid MOODLE_COURSE_MAP_JSON; using default map', {
        error: String(err && err.message ? err.message : err)
      });
    }
  }
  if (!Object.keys(courseMap).length) {
    courseMap = MOODLE_COURSE_MAP || {};
  }
  return {
    enabled: parseTrue_(enabledRaw),
    enabledRaw: enabledRaw,
    url: String(props.getProperty('MOODLE_URL') || '').trim().replace(/\/$/, ''),
    token: String(props.getProperty('MOODLE_TOKEN') || '').trim(),
    courseMap: courseMap
  };
}

function subscribeToMoodle_(payload) {
  const cfg = getMoodleConfig_();

  if (!cfg.enabled) {
    logInfo('MOODLE', 'Skipped (MOODLE_ENABLED is not truthy)', { enabledRaw: cfg.enabledRaw });
    return { ok: false, reason: 'disabled' };
  }

  if (!cfg.url || !cfg.token) {
    logInfo('MOODLE', 'Skipped (missing MOODLE_URL or MOODLE_TOKEN)', {
      hasUrl: !!cfg.url,
      hasToken: !!cfg.token
    });
    return { ok: false, reason: 'missing_config' };
  }

  const fellowshipCode = String(payload.fellowshipCode || '').trim().toUpperCase();
  const courseId = cfg.courseMap ? cfg.courseMap[fellowshipCode] : '';
  if (!courseId || String(courseId).indexOf('REPLACE_') === 0) {
    logInfo('MOODLE', 'Skipped (fellowship code not in MOODLE_COURSE_MAP)', { fellowshipCode: fellowshipCode });
    return { ok: false, reason: 'no_course_mapped' };
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'missing_email' };

  const userResult = moodleEnsureUser_(cfg, payload, email);
  if (!userResult.ok) return userResult;

  return moodleEnrolUser_(cfg, userResult.userId, courseId, email, fellowshipCode);
}

function moodleEnsureUser_(cfg, payload, email) {
  const apiUrl = cfg.url + '/webservice/rest/server.php';
  const searchParams = {
    wstoken: cfg.token,
    wsfunction: 'core_user_get_users',
    moodlewsrestformat: 'json',
    'criteria[0][key]': 'email',
    'criteria[0][value]': email
  };

  try {
    const searchResp = UrlFetchApp.fetch(apiUrl + '?' + objectToQueryString_(searchParams), {
      method: 'get',
      muteHttpExceptions: true
    });
    const searchData = JSON.parse(searchResp.getContentText() || '{}');
    if (searchData.users && searchData.users.length > 0 && searchData.users[0].id) {
      const existingId = searchData.users[0].id;
      logInfo('MOODLE', 'User already exists', { email: email, userId: existingId });
      return { ok: true, userId: existingId };
    }
  } catch (err) {
    logInfo('MOODLE', 'User lookup failed, attempting create', { email: email, error: String(err && err.message ? err.message : err) });
  }

  const username = email.replace(/[^a-z0-9._\-]/gi, '').toLowerCase() || ('user_' + Date.now());
  const createBody = objectToQueryString_({
    wstoken: cfg.token,
    wsfunction: 'core_user_create_users',
    moodlewsrestformat: 'json',
    'users[0][username]': username,
    'users[0][email]': email,
    'users[0][firstname]': payload.firstName || '',
    'users[0][lastname]': payload.lastName || '',
    'users[0][createpassword]': '1',
    'users[0][auth]': 'manual',
    'users[0][timezone]': '99',
    'users[0][mailformat]': '1',
    'users[0][description]': 'Auto-created via Foundation registration form'
  });

  try {
    const createResp = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: createBody,
      muteHttpExceptions: true
    });
    const code = createResp.getResponseCode();
    const createData = JSON.parse(createResp.getContentText() || '{}');

    if (Array.isArray(createData) && createData[0] && createData[0].id) {
      const newId = createData[0].id;
      logInfo('MOODLE', 'User created', { email: email, userId: newId, username: username });
      return { ok: true, userId: newId };
    }

    logInfo('MOODLE', 'User create failed', {
      code: code,
      email: email,
      exception: String(createData.exception || ''),
      message: String(createData.message || '')
    });
    return { ok: false, reason: 'user_create_failed' };
  } catch (err) {
    logInfo('MOODLE', 'User create fetch exception', { email: email, error: String(err && err.message ? err.message : err) });
    return { ok: false, reason: 'fetch_error' };
  }
}

function moodleEnrolUser_(cfg, userId, courseId, email, fellowshipCode) {
  const url = cfg.url + '/webservice/rest/server.php';
  const body = objectToQueryString_({
    wstoken: cfg.token,
    wsfunction: 'enrol_manual_enrol_users',
    moodlewsrestformat: 'json',
    'enrolments[0][roleid]': '5',
    'enrolments[0][userid]': String(userId),
    'enrolments[0][courseid]': String(courseId)
  });

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: body,
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText() || '';

    if (code >= 200 && code < 300 && (text === 'null' || text === '' || text === '[]')) {
      logInfo('MOODLE', 'Enrolment success', { email: email, userId: userId, courseId: courseId, fellowshipCode: fellowshipCode });
      return { ok: true, reason: 'ok' };
    }

    const result = JSON.parse(text || '{}');
    logInfo('MOODLE', 'Enrolment failed', {
      code: code,
      email: email,
      exception: String(result.exception || ''),
      message: String(result.message || '')
    });
    return { ok: false, reason: `enrol_http_${code}` };
  } catch (err) {
    logInfo('MOODLE', 'Enrolment fetch exception', {
      email: email,
      userId: userId,
      courseId: courseId,
      error: String(err && err.message ? err.message : err)
    });
    return { ok: false, reason: 'fetch_error' };
  }
}

function objectToQueryString_(obj) {
  return Object.keys(obj)
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); })
    .join('&');
}

function getMailchimpConfig_() {
  const props = PropertiesService.getScriptProperties();
  const enabledRaw = String(props.getProperty('MAILCHIMP_ENABLED') || '').trim();
  const apiKey = String(props.getProperty('MAILCHIMP_API_KEY') || '').trim();
  let serverPrefix = String(props.getProperty('MAILCHIMP_SERVER_PREFIX') || '').trim();
  if (!serverPrefix && apiKey.indexOf('-') > -1) {
    serverPrefix = String(apiKey.split('-').pop() || '').trim();
  }
  return {
    enabled: parseTrue_(enabledRaw),
    enabledRaw: enabledRaw,
    apiKey: apiKey,
    audienceId: props.getProperty('MAILCHIMP_AUDIENCE_ID'),
    serverPrefix: serverPrefix,
    status: props.getProperty('MAILCHIMP_STATUS') || 'subscribed'
  };
}

function parseTrue_(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function buildFellowshipsCsv_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_FELLOWSHIP_MAP_);
  if (!sheet) throw new Error('FELLOWSHIP_MAP sheet not found.');

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return 'label,value\n';

  const headers = rows[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);
  const labelIdx = H.campusname != null
    ? H.campusname
    : (H.campus_name != null
      ? H.campus_name
      : (H.campus != null
        ? H.campus
        : (H.label != null
          ? H.label
          : (H.fellowshipname != null
            ? H.fellowshipname
            : (H.fellowship != null ? H.fellowship : null)))));
  const valueIdx = H.value != null ? H.value : (H.fellowshipcode != null ? H.fellowshipcode : (H.code != null ? H.code : null));
  if (labelIdx == null || valueIdx == null) throw new Error('FELLOWSHIP_MAP needs label/value style columns.');

  const out = ['fellowship_code,campus_name'];
  for (let i = 1; i < rows.length; i++) {
    const code = csvEscape_(rows[i][valueIdx]);
    const name = csvEscape_(rows[i][labelIdx]);
    if (!String(code).trim() || !String(name).trim()) continue;
    out.push(`${code},${name}`);
  }
  return out.join('\n');
}

function buildClassOptionsCsv_() {
  const options = getClassOptions_({});
  const out = ['fellowship_code,class_id,teacher_id,teacher_name,day,time,active,class_start_date,teacher_email'];
  for (let i = 0; i < options.length; i++) {
    const x = options[i] || {};
    out.push([
      csvEscape_(x.fellowshipCode || ''),
      csvEscape_(x.classId || ''),
      csvEscape_(x.teacherId || ''),
      csvEscape_(x.teacherName || ''),
      csvEscape_(x.day || ''),
      csvEscape_(x.time || ''),
      csvEscape_(x.active || ''),
      csvEscape_(x.classStartDate || ''),
      csvEscape_(x.teacherEmail || '')
    ].join(','));
  }
  return out.join('\n');
}

function getClassOptions_(filters) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLASS_OPTIONS);
  if (!sheet) throw new Error('CLASS_OPTIONS sheet not found.');

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(function (h) { return String(h || '').trim(); });
  const H = headerIndexLoose(headers);
  const fellowshipCodeIdx = H.fellowshipcode != null ? H.fellowshipcode : null;
  const classIdIdx = H.classid != null ? H.classid : null;
  const teacherIdIdx = H.teacherid != null ? H.teacherid : null;
  const dayIdx = H.day != null ? H.day : null;
  const timeIdx = H.time != null ? H.time : null;
  const activeIdx = H.active != null ? H.active : null;
  const classStartDateIdx = H.classstartdate != null ? H.classstartdate : null;
  const batchIdIdx = H.batch != null ? H.batch : (H.batchid != null ? H.batchid : null);

  if (fellowshipCodeIdx == null || classIdIdx == null || dayIdx == null || timeIdx == null) {
    throw new Error('CLASS_OPTIONS must include FellowshipCode, ClassID, Day, and Time columns for registration.');
  }

  const req = filters || {};
  const filterCode = String(req.fellowshipCode || req.campusCode || '').trim().toLowerCase();
  const teacherSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TEACHERS');
  const teacherRows = teacherSheet ? teacherSheet.getDataRange().getValues() : [];
  const teacherById = {};
  if (teacherRows.length > 1) {
    const TH = headerIndexLoose(teacherRows[0].map(function (h) { return String(h || '').trim(); }));
    const tId = TH.teacherid != null ? TH.teacherid : null;
    const tName = TH.teachername != null ? TH.teachername : null;
    const tEmail = TH.teacheremail != null ? TH.teacheremail : null;
    if (tId != null) {
      for (let ti = 1; ti < teacherRows.length; ti++) {
        const tr = teacherRows[ti];
        const id = String(tr[tId] || '').trim();
        if (!id) continue;
        teacherById[id] = {
          teacherName: tName != null ? String(tr[tName] || '').trim() : '',
          teacherEmail: tEmail != null ? String(tr[tEmail] || '').trim() : ''
        };
      }
    }
  }
  const stats = { read: rows.length - 1, included: 0, skipped: 0, reasons: {} };
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fellowshipCode = String(r[fellowshipCodeIdx] || '').trim();
    const classId = String(r[classIdIdx] || '').trim();
    const teacherId = teacherIdIdx != null ? String(r[teacherIdIdx] || '').trim() : '';
    const teacherMeta = teacherById[teacherId] || {};
    const teacherName = String(teacherMeta.teacherName || '').trim();
    const day = String(r[dayIdx] || '').trim();
    const rawTime = r[timeIdx];
    const time = rawTime instanceof Date
      ? Utilities.formatDate(rawTime, Session.getScriptTimeZone(), 'h:mm a')
      : String(rawTime || '').trim();
    const rawActive = activeIdx != null ? String(r[activeIdx] || '').trim() : '';
    const activeNorm = rawActive.toLowerCase();
    const rawDate = classStartDateIdx != null ? r[classStartDateIdx] : '';
    const classStartDate = rawDate instanceof Date
      ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(rawDate || '').trim();
    const batchId = batchIdIdx != null ? String(r[batchIdIdx] || '').trim() : '';

    if (!fellowshipCode) { stats.skipped++; stats.reasons.missingFellowshipCode = (stats.reasons.missingFellowshipCode || 0) + 1; continue; }
    if (!classId) { stats.skipped++; stats.reasons.missingClassId = (stats.reasons.missingClassId || 0) + 1; continue; }
    if (!day) { stats.skipped++; stats.reasons.missingDay = (stats.reasons.missingDay || 0) + 1; continue; }
    if (!time) { stats.skipped++; stats.reasons.missingTime = (stats.reasons.missingTime || 0) + 1; continue; }
    if (!(rawActive === '' || activeNorm === 'true' || activeNorm === 'yes' || activeNorm === '1')) {
      stats.skipped++; stats.reasons.inactive = (stats.reasons.inactive || 0) + 1; continue;
    }
    if (filterCode && fellowshipCode.toLowerCase() !== filterCode) {
      stats.skipped++; stats.reasons.fellowshipFilteredOut = (stats.reasons.fellowshipFilteredOut || 0) + 1; continue;
    }

    out.push({
      fellowshipCode: fellowshipCode,
      classId: classId,
      teacherId: teacherId,
      teacherName: teacherName,
      day: day,
      time: time,
      active: rawActive,
      classStartDate: classStartDate,
      batchId: batchId,
      teacherEmail: String(teacherMeta.teacherEmail || '').trim(),
      label: day + ' at ' + time + ' with ' + (teacherName || 'TBD')
    });
    stats.included++;
  }

  logInfo('CLASS_OPTIONS_REGISTRATION', 'Loaded class options for registration.', {
    sheetName: SHEET_CLASS_OPTIONS,
    headers: headers,
    rowsRead: stats.read,
    included: stats.included,
    skipped: stats.skipped,
    skipReasons: stats.reasons,
    sample: out.slice(0, 3)
  });

  return out;
}

function csvEscape_(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function saveWebsiteRegistration_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_APPLICANTS);

  if (!sheet) throw new Error('APPLICANTS sheet not found.');

  ensureApplicantsHeaders_(sheet);
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), APPLICANTS_HEADERS_WEBSITE.length)).getValues()[0]
    .map(function (h) { return String(h || '').trim(); });
  const subgroupId = lookupSubgroupIdByFellowshipCode_(data.fellowshipCode);
  const row = buildApplicantsWebsiteRow_(headers, data, subgroupId);
  sheet.appendRow(row);

  logInfo('WEBSITE_REGISTRATION', 'Saved APPLICANTS row from website intake', {
    fellowshipCode: String(data.fellowshipCode || ''),
    subgroupId: String(subgroupId || '')
  });
}

function ensureApplicantsHeaders_(sheet) {
  const hasRows = sheet.getLastRow() > 0 && sheet.getLastColumn() > 0;
  if (!hasRows) {
    sheet.getRange(1, 1, 1, APPLICANTS_HEADERS_WEBSITE.length).setValues([APPLICANTS_HEADERS_WEBSITE]);
    return;
  }

  const lastCol = sheet.getLastColumn();
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v || '').trim(); });
  const existingSet = {};
  for (let i = 0; i < existing.length; i++) {
    if (existing[i]) existingSet[existing[i]] = true;
  }

  const missing = APPLICANTS_HEADERS_WEBSITE.filter(function (h) { return !existingSet[h]; });
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    logInfo('WEBSITE_REGISTRATION', 'Added missing APPLICANTS headers for website intake', { headers: missing });
  }
}

function buildApplicantsWebsiteRow_(headers, data, subgroupId) {
  const row = new Array(headers.length).fill('');
  const H = headerIndexLoose(headers);

  function set(key, value) {
    const norm = String(key || '').replace(/\s+/g, '').toLowerCase();
    if (H[norm] == null) return;
    row[H[norm]] = value;
  }

  set('Timestamp', new Date());
  set('First Name', data.firstName || '');
  set('Last Name', data.lastName || '');
  set('Email', data.email || '');
  set('Phone', data.phone || '');
  set('Fellowship Code', data.fellowshipCode || '');
  set('Class Choice', data.classLabel || data.classChoice || '');
  set('Class Day', data.classDay || '');
  set('Class Time', data.classTime || '');
  set('Class Start Date', data.classStartDate || '');
  set('Teacher', data.teacherName || '');
  set('Class ID', data.classId || '');
  set('Born Again', data.bornAgain || '');
  set('Speaks In Tongues', data.speaksInTongues || '');
  set('Water Baptized', data.waterBaptized || '');
  set('Submitted At', data.submittedAt || new Date().toISOString());
  set('Source', 'Website');
  set('SubgroupID', subgroupId || '');

  return row;
}

function lookupSubgroupIdByFellowshipCode_(fellowshipCode) {
  const code = String(fellowshipCode || '').trim().toLowerCase();
  if (!code) return '';

  const mapSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_FELLOWSHIP_MAP_);
  if (!mapSheet || mapSheet.getLastRow() < 2) return '';

  const rows = mapSheet.getDataRange().getValues();
  const headers = rows[0].map(function (h) { return String(h || '').trim(); });
  const H = headerIndexLoose(headers);

  const codeIdx = H.fellowshipcode != null
    ? H.fellowshipcode
    : (H.code != null ? H.code : (H.value != null ? H.value : null));
  const subgroupIdx = H.subgroupid != null
    ? H.subgroupid
    : (H.subgroup_id != null ? H.subgroup_id : null);
  if (codeIdx == null || subgroupIdx == null) return '';

  for (let i = 1; i < rows.length; i++) {
    const rowCode = String(rows[i][codeIdx] || '').trim().toLowerCase();
    if (!rowCode) continue;
    if (rowCode === code) return String(rows[i][subgroupIdx] || '').trim();
  }
  return '';
}
