/***************************************
 * 20_PHASE2_PROCESSOR.gs
 ***************************************/

function phase2_ensureErrorSubmissionsSheet_() {
  const sh = ensureSheet(SHEET_ERROR_SUBMISSIONS, [
    'Timestamp',
    'FullName',
    'Email',
    'Phone',
    'FellowshipCode',
    'RawCampusDetected',
    'ClassChoiceRaw',
    'SourceResponseId',
    'ErrorReason',
    'AllResponseValues',
    'LoggedAt',
    'Status'
  ]);

  const required = [
    'RawFormDump',
    'TriedKeys',
    'ResolutionNotes',
    'ErrorStage',
    'RawEmail',
    'RawClassLabel'
  ];

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    missing.forEach(col => logSync_('SCHEMA_COLUMN_ADDED', `ERROR_SUBMISSIONS.${col}`));
  }
  return sh;
}

function phase2_logErrorSubmission_(o) {
  const sh = phase2_ensureErrorSubmissionsSheet_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const H = headerIndexLoose(headers);
  const row = new Array(headers.length).fill('');

  function set(name, val) {
    const key = String(name || '').replace(/\s+/g, '').toLowerCase();
    if (!(key in H)) return;
    row[H[key]] = val;
  }

  set('Timestamp', o.timestamp || '');
  set('FullName', o.fullName || '');
  set('Email', o.email || '');
  set('Phone', o.phone || '');
  set('FellowshipCode', o.fellowshipCode || '');
  set('RawCampusDetected', o.rawCampusDetected || '');
  set('ClassChoiceRaw', o.classChoiceRaw || '');
  set('SourceResponseId', o.responseId || '');
  set('ErrorReason', o.errorReason || '');
  set('AllResponseValues', o.allValues || '');
  set('RawFormDump', o.rawFormDump || '');
  set('TriedKeys', o.triedKeys || '');
  set('ResolutionNotes', o.resolutionNotes || '');
  set('ErrorStage', o.errorStage || '');
  set('RawEmail', o.rawEmail || o.email || '');
  set('RawClassLabel', o.rawClassLabel || o.classChoiceRaw || '');
  set('LoggedAt', new Date());
  set('Status', 'Needs Resubmission');

  sh.appendRow(row);
}

function isClassActive_(row, H) {
  return ('Active' in H) && isTrue(row[H.Active]);
}

function isEnrollmentOpen_(row, H) {
  return ('EnrollmentOpen' in H) && isTrue(row[H.EnrollmentOpen]);
}

function isValidClassRow_(row, H) {
  const classID = String(row[H.ClassID] || '').trim();
  const fc = String(row[H.FellowshipCode] || '').trim();
  const day = String(row[H.Day] || '').trim();
  const time = row[H.Time];
  const teacher = String(row[H.TeacherID] || row[H.TeacherName] || '').trim();
  return classID && fc && day && time && teacher;
}

function phase2_buildClassLookupByLabel_() {
  const sh = getSheet(SHEET_CLASS_OPTIONS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return new Map();

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  function col(name) {
    const key = String(name).replace(/\s+/g, '').toLowerCase();
    if (!(key in H)) throw new Error(`CLASS_OPTIONS missing column: "${name}". Found: ${headers.join(' | ')}`);
    return H[key];
  }

  const hasLabelSuffix = 'labelsuffix' in H;
  const map = new Map();

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const enrollmentOpen = ('enrollmentopen' in H) ? isTrue(r[col('EnrollmentOpen')]) : true;
    if (!enrollmentOpen) continue;
    if (!isValidClassRow_(r, H)) continue;

    const fcList = parseCodesCsv(r[col('FellowshipCode')]);
    const classID = String(r[col('ClassID')] || '').trim();
    if (!classID || !fcList.length) continue;

    const teacherID = String(r[col('TeacherID')] || '').trim();
    const teacherName = String(r[col('TeacherName')] || '').trim();
    const day = normalizeWeekday(r[col('Day')]);
    const time = r[col('Time')];
    const labelSuffix = hasLabelSuffix ? r[col('LabelSuffix')] : '';

    const namePart = teacherName || teacherID || 'Teacher';
    const whenPart = `${day} ${formatTime(time)}`.trim();
    const suffix = labelSuffix ? ` ${String(labelSuffix).trim()}` : '';

    const labelNoId = `${namePart} - ${whenPart}`.trim() + suffix;
    const labelWithId = `${labelNoId} [${classID}]`;

    const normNoId = normalizeLabel(normalizeWeekdayInsideLabel(labelNoId));
    const normWithId = normalizeLabel(normalizeWeekdayInsideLabel(labelWithId));

    const baseMeta = {
      fc: '',
      classID,
      teacherID,
      teacherName,
      day,
      time,
      labelNoId,
      labelWithId
    };

    fcList.forEach(fc => {
      const fcCode = normalizeCode(fc);
      const key1 = `${fcCode}||${normNoId}`;
      const key2 = `${fcCode}||${normWithId}`;

      if (map.has(key1)) {
        throw new Error(`Duplicate label for ${fcCode}: "${labelNoId}". LabelSuffix/ClassID disambiguation is required.`);
      }
      if (map.has(key2)) {
        throw new Error(`Duplicate label for ${fcCode}: "${labelWithId}". ClassID must be unique.`);
      }

      const meta = Object.assign({}, baseMeta, { fc: fcCode });
      map.set(key1, meta);
      map.set(key2, meta);
    });
  }

  return map;
}

function phase2_processNewFormResponsesToApplicants() {
  const source = String(getConfig('REGISTRATION_SOURCE') || 'WEBSITE').trim().toUpperCase();
  if (source !== 'GOOGLE_FORM') {
    const msg = `Skipped phase2_processNewFormResponsesToApplicants because REGISTRATION_SOURCE=${source}.`;
    logSync_('PHASE2_SKIPPED', msg);
    uiAlert_(msg + '\n\nSet REGISTRATION_SOURCE to GOOGLE_FORM only if you intentionally use Google Form intake.');
    return;
  }

  const RUN_DEADLINE_MS = 5.5 * 60 * 1000;
  const runStart = Date.now();

  const form = openFormSafe(getConfig('FORM_ID_OR_URL'));
  const applicants = getSheet(SHEET_APPLICANTS);
  const responses = form.getResponses();

  if (!responses.length) {
    uiAlert_('No form responses found yet.');
    return;
  }

  const labelLookup = phase2_buildClassLookupByLabel_();
  const validFcSet = new Set();
  labelLookup.forEach(v => validFcSet.add(normalizeCode(v.fc)));

  const lastProcessed = getScriptProperty(PROP_LAST_RESPONSE_ID, '');
  let startIndex = 0;
  if (lastProcessed) {
    const found = responses.findIndex(r => r.getId() === lastProcessed);
    startIndex = found >= 0 ? found + 1 : 0;
  }

  const headers = applicants.getRange(1, 1, 1, applicants.getLastColumn()).getValues()[0];
  const A = headerIndexLoose(headers);

  const processedIds = new Set();
  if ('sourceresponseid' in A && applicants.getLastRow() > 1) {
    const existing = applicants.getRange(2, A.sourceresponseid + 1, applicants.getLastRow() - 1, 1).getValues();
    existing.forEach(r => {
      const id = String(r[0] || '').trim();
      if (id) processedIds.add(id);
    });
  }

  const out = [];
  let errorCount = 0;

  for (let i = startIndex; i < responses.length; i++) {
    if (Date.now() - runStart > RUN_DEADLINE_MS) {
      logSync_('TIMEOUT_GUARD', `Stopped early after ${i - startIndex} items to stay within GAS limit`);
      break;
    }

    const r = responses[i];
    const respId = r.getId();

    try {
      if (processedIds.has(respId)) {
        Logger.log(`[PHASE2] Skipping duplicate SourceResponseId already in APPLICANTS: ${respId}`);
        continue;
      }

      const ts = r.getTimestamp();
      const values = [];
      const ansByTitle = {};
      r.getItemResponses().forEach(ir => {
        const title = String(ir.getItem().getTitle() || '').trim();
        const val = ir.getResponse();
        ansByTitle[title] = val;
        values.push(val);
      });

      let fc = '';
      let rawCampus = '';
      const campusAns = ansByTitle[CAMPUS_QUESTION_TITLE];
      if (typeof campusAns === 'string') {
        const code = normalizeCode(extractBracketCode(campusAns));
        if (code && validFcSet.has(code)) {
          fc = code;
          rawCampus = campusAns;
        }
      }

      if (!fc) {
        values.forEach(v => {
          if (typeof v !== 'string') return;
          const code = normalizeCode(extractBracketCode(v));
          if (code && validFcSet.has(code)) {
            fc = code;
            rawCampus = v;
          }
        });
      }

      let chosen = '';
      let classRow = null;
      const debugTried = [];
      if (fc) {
        for (const entry of Object.entries(ansByTitle)) {
          const title = entry[0];
          const v = entry[1];
          if (title === CAMPUS_QUESTION_TITLE || typeof v !== 'string') continue;
          if (!isProbablyClassChoice(v)) continue;
          const norm = normalizeLabel(normalizeWeekdayInsideLabel(v));
          const key = `${fc}||${norm}`;
          debugTried.push(`${title} => ${key}`);
          if (labelLookup.has(key)) {
            chosen = v;
            classRow = labelLookup.get(key);
            break;
          }
        }
      }

      const fullName = buildFullName(ansByTitle, values);
      const email = String(ansByTitle[EMAIL_Q_TITLE] || '').trim();
      const phone = phase2_normalizePhone_(ansByTitle[PHONE_Q_TITLE] || ansByTitle['Phone'] || ansByTitle['Phone Number'] || '');

      if (!isValidEmail(email)) {
        phase2_logErrorSubmission_({
          timestamp: ts,
          fullName,
          email,
          phone,
          fellowshipCode: fc || '',
          rawCampusDetected: rawCampus || '',
          classChoiceRaw: chosen || '',
          responseId: respId,
          errorReason: `Invalid email address: ${email}`,
          allValues: values.map(v => String(v)).join(' || '),
          rawFormDump: JSON.stringify(ansByTitle),
          triedKeys: debugTried.join(' | '),
          rawEmail: String(ansByTitle[EMAIL_Q_TITLE] || ''),
          rawClassLabel: chosen || '',
          errorStage: 'EMAIL_VALIDATION'
        });
        errorCount++;
        continue;
      }

      const problems = [];
      if (!fc) problems.push('FellowshipCode missing (campus option must end with [CODE] and match ACTIVE CLASS_OPTIONS codes).');
      if (!classRow) problems.push(`Class choice missing (no response matched any valid label for ${fc || 'unknown'}).`);

      if (problems.length) {
        phase2_logErrorSubmission_({
          timestamp: ts,
          fullName,
          email,
          phone,
          fellowshipCode: fc || '',
          rawCampusDetected: rawCampus || '',
          classChoiceRaw: chosen || '',
          responseId: respId,
          errorReason: problems.join(' | '),
          allValues: values.map(v => String(v)).join(' || ') + '\n\nTRIED KEYS:\n' + debugTried.join('\n'),
          rawFormDump: JSON.stringify(ansByTitle),
          triedKeys: debugTried.join(' | '),
          rawEmail: String(ansByTitle[EMAIL_Q_TITLE] || ''),
          rawClassLabel: chosen || '',
          errorStage: 'CLASS_MATCH'
        });
        errorCount++;
        continue;
      }

      const row = new Array(headers.length).fill('');
      function set(name, val) {
        const key = String(name || '').replace(/\s+/g, '').toLowerCase();
        if (!(key in A)) return;
        row[A[key]] = val;
      }

      const status = assertValidStatus_('Active', 'APPLICANTS row pending write');

      set('Timestamp', ts);
      set('FullName', fullName);
      set('Email', email);
      set('Phone', phone);
      set('FellowshipCode', fc);
      set('ClassID', classRow.classID);
      set('ClassLabel', classRow.labelWithId || classRow.labelNoId || chosen);
      set('TeacherName', classRow.teacherName || '');
      set('Day', classRow.day || '');
      set('Time', formatTime(classRow.time));
      set('SourceResponseId', respId);
      set('ProcessedAt', new Date());
      set('Status', status);

      out.push(row);
      processedIds.add(respId);
    } catch (err) {
      phase2_logErrorSubmission_({
        timestamp: new Date(),
        fullName: '',
        email: '',
        phone: '',
        fellowshipCode: '',
        rawCampusDetected: '',
        classChoiceRaw: '',
        responseId: respId,
        errorReason: String(err && err.message ? err.message : err),
        allValues: '',
        rawFormDump: '',
        triedKeys: '',
        rawEmail: '',
        rawClassLabel: '',
        errorStage: 'UNHANDLED_EXCEPTION'
      });
      errorCount++;
      continue;
    } finally {
      setScriptProperty(PROP_LAST_RESPONSE_ID, respId);
    }
  }

  if (out.length) {
    applicants.getRange(applicants.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
  }

  if (out.length && typeof pool_markRegistered_ === 'function') {
    const fullHeaders = applicants.getRange(1, 1, 1, applicants.getLastColumn()).getValues()[0];
    const AH = headerIndexLoose(fullHeaders);
    out.forEach(row => {
      const email = row[AH['email']];
      if (email) pool_markRegistered_(String(email).trim(), '');
    });
  }

  logSync_('PHASE2_PROCESS', `Processed responses: added=${out.length}, errors=${errorCount}`);
  uiAlert_(`Phase 2 processed\nAdded: ${out.length}\nErrors quarantined: ${errorCount}`);
}

function phase2_normalizePhone_(raw) {
  return String(raw == null ? '' : raw).trim();
}

function phase2_resetLastProcessedResponseId() {
  deleteScriptProperty(PROP_LAST_RESPONSE_ID);
  uiAlert_('Reset done. Next run will reprocess from the beginning.');
}

function phase2_resetLastProcessedCursor() {
  setScriptProperty(PROP_LAST_RESPONSE_ID, '');
  Logger.log('Reset last processed cursor. Next run will reprocess ALL responses.');
}
