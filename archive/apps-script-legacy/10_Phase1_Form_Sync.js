/***************************************
 * 10_Phase1_Form_Sync.gs
 *
 * Multi-form version
 *
 * Builds separate forms for CE / CS / WS
 * using:
 * - FORM_ID_CE
 * - FORM_ID_CS
 * - FORM_ID_WS
 *
 * Required sheets:
 * - FELLOWSHIP_MAP
 * - FORM_SECTIONS
 * - CLASS_OPTIONS
 *
 * Required FELLOWSHIP_MAP columns:
 * - FellowshipCode
 * - CampusName
 * - GroupID   (or Group)
 *
 * Entry point:
 *   RUN_ME_buildAllGroupForms()
 ***************************************/

const PAGE1_FIELDS_ = [
  { title: 'First Name',                    type: 'TEXT',   required: true, options: [] },
  { title: 'Last Name',                     type: 'TEXT',   required: true, options: [] },
  { title: 'Phone Number',                  type: 'TEXT',   required: true, options: [] },
  { title: 'Email',                         type: 'TEXT',   required: true, options: [] },
  { title: 'Are you born again?',           type: 'CHOICE', required: true, options: ['Yes', 'No', "I'm don't know"] },
  { title: 'Do you speak in tongues?',      type: 'CHOICE', required: true, options: ['Yes', 'No', "I'm not sure"] },
  { title: 'Have you been water baptized?', type: 'CHOICE', required: true, options: ['Yes', 'No'] }
];

/* =========================
 * UI / basic helpers
 * ========================= */

function uiAlert_(msg) {
  try {
    SpreadsheetApp.getUi().alert(String(msg));
  } catch (e) {
    Logger.log(String(msg));
  }
}

function phase1_normalizeFellowshipCode_(v) {
  return normalizeCode(extractBracketCode(v) || v);
}

function phase1_normalizeGroupID_(v) {
  return String(v || '').trim().toUpperCase();
}

function phase1_getGroupFormId_(groupID) {
  const key = `FORM_ID_${groupID}`;
  const raw = String(getConfig(key) || '').trim();
  if (!raw) throw new Error(`${key} is empty in CONFIG.`);
  return raw;
}

function phase1_getGroupForm_(groupID) {
  return openFormSafe(phase1_getGroupFormId_(groupID));
}

function phase1_getGroupFormPairs_() {
  const pairs = [];

  GROUPS.forEach(groupID => {
    const raw = String(getConfig(`FORM_ID_${groupID}`) || '').trim();
    if (!raw) {
      Logger.log(`Skipping ${groupID}: missing FORM_ID_${groupID}`);
      return;
    }

    pairs.push({
      groupID,
      form: openFormSafe(raw)
    });
  });

  if (!pairs.length) {
    throw new Error('No group forms found. Set FORM_ID_CE, FORM_ID_CS, FORM_ID_WS in CONFIG.');
  }

  return pairs;
}

function phase1_findFirstPageBreakIndex_(items) {
  const idx = items.findIndex(i => i.getType() === FormApp.ItemType.PAGE_BREAK);
  return idx === -1 ? items.length : idx;
}

function phase1_deleteItemsByPredicate_(form, predicateFn) {
  const items = form.getItems();
  for (let i = items.length - 1; i >= 0; i--) {
    if (!predicateFn(items[i], i, items)) continue;
    try {
      form.deleteItem(i);
    } catch (e) {
      Logger.log(`Could not delete item ${i}: ${e.message}`);
    }
  }
}

function phase1_buildLabelFromRow_(meta) {
  const namePart = meta.teacherName || meta.teacherID || 'Teacher';
  const whenPart = `${meta.day} ${formatTime(meta.time)}`.trim();
  const suffix   = meta.labelSuffix ? ` ${String(meta.labelSuffix).trim()}` : '';
  const base     = `${namePart} - ${whenPart}`.trim() + suffix;

  if (isTrue(getConfig('INCLUDE_CLASS_ID_IN_LABEL') || INCLUDE_CLASS_ID_IN_LABEL)) {
    return `${base} [${meta.classID}]`;
  }
  return base;
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

/* =========================
 * FELLOWSHIP MAP
 * ========================= */

function phase1_getFellowshipMapRows_() {
  const sh = getSheet(SHEET_FELLOWSHIP_MAP_);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(headers);

  function pick(names, required) {
    for (let i = 0; i < names.length; i++) {
      const key = String(names[i]).replace(/\s+/g, '').toLowerCase();
      if (key in H) return H[key];
    }
    if (required) {
      throw new Error(`${SHEET_FELLOWSHIP_MAP_} missing required column. Need one of: ${names.join(', ')}`);
    }
    return -1;
  }

  const codeCol   = pick(['FellowshipCode', 'Code'], true);
  const campusCol = pick(['CampusName', 'Campus', 'Name', 'FellowshipName'], true);
  const groupCol  = pick(['GroupID', 'Group'], true);
  const activeCol = pick(['Active'], false);

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const code = phase1_normalizeFellowshipCode_(row[codeCol]);
    const campusName = String(row[campusCol] || '').trim();
    const groupID = phase1_normalizeGroupID_(row[groupCol]);
    const active = activeCol === -1 ? true : isTrue(row[activeCol]);

    if (!code || !campusName || !groupID || !active) continue;

    rows.push({
      code,
      campusName,
      groupID
    });
  }

  return rows;
}

function phase1_getFellowshipMapRowsByGroup_(groupID) {
  const gid = phase1_normalizeGroupID_(groupID);
  return phase1_getFellowshipMapRows_().filter(r => r.groupID === gid);
}

function phase1_getCampusByCodeForGroup_(groupID) {
  const map = new Map();
  phase1_getFellowshipMapRowsByGroup_(groupID).forEach(r => {
    if (!map.has(r.code)) map.set(r.code, r.campusName);
  });
  return map;
}

function phase1_getAllowedCodeSetForGroup_(groupID) {
  return new Set(phase1_getFellowshipMapRowsByGroup_(groupID).map(r => r.code));
}

function getGroupSpreadsheet_(groupID) {
  const key = `GROUP_SHEET_ID_${groupID}`;
  const sheetId = String(getConfig(key) || '').trim();
  if (!sheetId) throw new Error(`${key} is empty in CONFIG.`);
  return SpreadsheetApp.openById(sheetId);
}

function phase1_deleteClassSections_(form, groupID) {
  const rows = phase1_getSectionRowsForGroup_(groupID);
  const sectionTitles = new Set(rows.map(r => r.sectionTitle.toLowerCase()));

  const items = form.getItems();
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const title = String(item.getTitle() || '').trim().toLowerCase();

    if (item.getType() === FormApp.ItemType.PAGE_BREAK && sectionTitles.has(title)) {
      form.deleteItem(i);
    } else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE && title === PHASE1_SECTION_QUESTION_TITLE_.toLowerCase()) {
      form.deleteItem(i);
    }
  }
}

/* =========================
 * FORM_SECTIONS
 * rebuilt per all groups for visibility/debug
 * ========================= */

function phase1_rebuildFormSections_() {
  const sh = getSheet(SHEET_FORM_SECTIONS);
  const rows = phase1_getFellowshipMapRows_();
  const out = [['SectionTitle', 'QuestionTitle', 'FellowshipCodes', 'GroupID']];

  rows.forEach(r => {
    out.push([
      `${r.campusName} Class Schedule`,
      PHASE1_SECTION_QUESTION_TITLE_,
      r.code,
      r.groupID
    ]);
  });

  sh.clearContents();
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  Logger.log(`FORM_SECTIONS rebuilt: ${out.length - 1} rows`);
}

function phase1_getSectionRowsForGroup_(groupID) {
  const byFc = phase1_buildClassMapByFellowshipForGroup_(groupID);
  return phase1_getFellowshipMapRowsByGroup_(groupID)
    .filter(r => byFc.has(r.code) && byFc.get(r.code).length > 0)
    .map(r => ({
      sectionTitle: `${r.campusName} Class Schedule`,
      questionTitle: PHASE1_SECTION_QUESTION_TITLE_,
      codes: [r.code],
      campusName: r.campusName,
      groupID: r.groupID
    }));
}

/* =========================
 * CLEANUP
 * ========================= */

function phase1_cleanupTopLevelNoise_(form) {
  phase1_deleteItemsByPredicate_(form, item => {
    const title = String(item.getTitle() || '').trim();
    const type = item.getType();
    const lowerTitle = title.toLowerCase();

    const isUntitledQuestion =
      !title || title === 'Untitled Question' || title === 'Untitled form';

    const isRoutingQuestion =
      (type === FormApp.ItemType.MULTIPLE_CHOICE || type === FormApp.ItemType.LIST) &&
      title === PHASE1_ENTRY_QUESTION_TITLE_;

    const isBadPageBreak =
      type === FormApp.ItemType.PAGE_BREAK &&
      (
        !title ||
        lowerTitle.includes('untitled') ||
        lowerTitle === 'submit' ||
        lowerTitle === 'click submit to finish'
      );

    return isUntitledQuestion || isRoutingQuestion || isBadPageBreak;
  });
}

function phase1_removeAllSubmitPages_(form) {
  const items = form.getItems();
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.getType() !== FormApp.ItemType.PAGE_BREAK) continue;

    const title = String(item.getTitle() || '').trim().toLowerCase();
    if (title === 'submit' || title === 'click submit to finish') {
      form.deleteItem(i);
    }
  }
}

/* =========================
 * PAGE BREAKS
 * ========================= */

function phase1_createPageBreaksForGroup_(form, groupID) {
  const startMs = Date.now();
  const rows = phase1_getSectionRowsForGroup_(groupID);

  const existing = new Set(
    form.getItems()
      .filter(i => i.getType() === FormApp.ItemType.PAGE_BREAK)
      .map(i => String(i.getTitle() || '').trim())
  );

  let created = 0;
  rows.forEach(row => {
    if (Date.now() - startMs > 120000) {
      throw new Error(`Stopped in phase1_createPageBreaksForGroup_(${groupID}): taking too long.`);
    }

    if (!row.sectionTitle || existing.has(row.sectionTitle)) return;

    form.addPageBreakItem().setTitle(row.sectionTitle);
    existing.add(row.sectionTitle);
    created++;
  });

  return created;
}

/* =========================
 * SECTION QUESTIONS
 * ========================= */

function phase1_findChoiceQuestionInSection_(items, secIdx, qTitle) {
  for (let i = secIdx + 1; i < items.length; i++) {
    if (items[i].getType() === FormApp.ItemType.PAGE_BREAK) break;

    const t = items[i].getType();
    const title = String(items[i].getTitle() || '').trim();

    if (
      (t === FormApp.ItemType.MULTIPLE_CHOICE || t === FormApp.ItemType.LIST) &&
      title === qTitle
    ) {
      return { item: items[i], index: i };
    }
  }
  return null;
}

function phase1_buildClassMapByFellowshipForGroup_(groupID) {
  const allowedCodes = phase1_getAllowedCodeSetForGroup_(groupID);
  const groupSs = getGroupSpreadsheet_(groupID);
  const optSheet = groupSs.getSheetByName('CLASS_OPTIONS');
  if (!optSheet) throw new Error(`CLASS_OPTIONS sheet not found in group ${groupID} spreadsheet.`);
  const optData = optSheet.getDataRange().getValues();
  if (optData.length < 2) throw new Error(`CLASS_OPTIONS in group ${groupID} has no data rows.`);

  const optHeaders = optData[0].map(h => String(h || '').trim());
  const H = headerIndexLoose(optHeaders);

  function col(name) {
    const key = String(name).replace(/\s+/g, '').toLowerCase();
    if (!(key in H)) throw new Error(`CLASS_OPTIONS in group ${groupID} missing column: "${name}". Found: ${optHeaders.join(' | ')}`);
    return H[key];
  }

  const hasLabelSuffix = ('labelsuffix' in H);
  const hasFellowshipCodes = ('fellowshipcodes' in H);

  const byFc = new Map();

  for (let i = 1; i < optData.length; i++) {
    const row = optData[i];
    if (!isEnrollmentOpen_(row, H)) continue;
    if (!isValidClassRow_(row, H)) continue;

    const fcList = parseCodesCsv(
      row[col(hasFellowshipCodes ? 'FellowshipCodes' : 'FellowshipCode')]
    )
      .map(fc => phase1_normalizeFellowshipCode_(fc))
      .filter(fc => fc && allowedCodes.has(fc));

    if (!fcList.length) continue;

    const meta = {
      classID: String(row[col('ClassID')] || '').trim(),
      teacherID: String(row[col('TeacherID')] || '').trim(),
      teacherName: String(row[col('TeacherName')] || '').trim(),
      day: normalizeWeekday(row[col('Day')]),
      time: row[col('Time')],
      labelSuffix: hasLabelSuffix ? row[col('LabelSuffix')] : ''
    };

    fcList.forEach(fc => {
      if (!byFc.has(fc)) byFc.set(fc, []);
      byFc.get(fc).push(meta);
    });
  }

  return byFc;
}

function phase1_syncClassChoicesForGroup_(form, groupID) {
  const startMs = Date.now();
  const rows = phase1_getSectionRowsForGroup_(groupID);
  const byFc = phase1_buildClassMapByFellowshipForGroup_(groupID);

  let created = 0;
  let updated = 0;
  let warnings = 0;

  rows.forEach(row => {
    if (Date.now() - startMs > 180000) {
      throw new Error(`Stopped in phase1_syncClassChoicesForGroup_(${groupID}): taking too long.`);
    }

    const sectionTitle = row.sectionTitle;
    const qTitle = row.questionTitle;
    const codes = row.codes || [];

    const seen = new Set();
    const choices = [];

    codes.forEach(fc => {
      (byFc.get(fc) || []).forEach(x => {
        const key = x.classID || `${fc}|${x.teacherName}|${x.day}|${x.time}`;
        if (seen.has(key)) return;
        seen.add(key);
        choices.push(phase1_buildLabelFromRow_(x));
      });
    });

    if (isTrue(getConfig('SORT_CHOICES') || SORT_CHOICES)) {
      choices.sort((a, b) => String(a).localeCompare(String(b)));
    }

    const finalChoices = choices.length
      ? choices.slice()
      : [getConfig('EMPTY_CHOICE_LABEL') || EMPTY_CHOICE_LABEL];

    if (!finalChoices.includes(PHASE1_NONE_OPTION_)) {
      finalChoices.push(PHASE1_NONE_OPTION_);
    }

    if (!choices.length) {
      warnings++;
      return; // Skip creating question if no valid choices
    }

    let items = form.getItems();
    const secIdx = items.findIndex(i =>
      i.getType() === FormApp.ItemType.PAGE_BREAK &&
      String(i.getTitle() || '').trim().toLowerCase() === sectionTitle.toLowerCase()
    );
    if (secIdx === -1) return;

    const existing = phase1_findChoiceQuestionInSection_(items, secIdx, qTitle);

    if (existing) {
      if (existing.item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
        existing.item.asMultipleChoiceItem()
          .setChoiceValues(finalChoices)
          .setRequired(false);
      } else {
        // Force to MULTIPLE_CHOICE by deleting and recreating
        form.deleteItem(existing.index);
        existing = null;
      }
    }

    if (!existing) {
      form.addMultipleChoiceItem()
        .setTitle(qTitle)
        .setChoiceValues(finalChoices)
        .setRequired(false);

      items = form.getItems();
      const newIdx = items.length - 1;
      const targetIdx = secIdx + 1;
      if (newIdx !== targetIdx) form.moveItem(newIdx, targetIdx);
      created++;
    }

    updated++;

    // Set page break to submit to prevent continuation
    const pbItem = items[secIdx].asPageBreakItem();
    pbItem.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  });

  return { created, updated, warnings };
}

/* =========================
 * PAGE 1
 * ========================= */

function phase1_ensurePageOneFields_(form) {
  let items = form.getItems();
  let firstPBIdx = phase1_findFirstPageBreakIndex_(items);

  const existingTitles = new Set();
  for (let i = 0; i < firstPBIdx; i++) {
    existingTitles.add(String(items[i].getTitle() || '').trim());
  }

  let created = 0;

  PAGE1_FIELDS_.forEach(field => {
    if (existingTitles.has(field.title)) return;

    if (field.type === 'TEXT') {
      form.addTextItem().setTitle(field.title).setRequired(field.required);
    } else {
      form.addMultipleChoiceItem()
        .setTitle(field.title)
        .setRequired(field.required)
        .setChoiceValues(field.options);
    }

    items = form.getItems();
    firstPBIdx = phase1_findFirstPageBreakIndex_(items);
    const newIdx = items.length - 1;
    if (newIdx !== firstPBIdx) form.moveItem(newIdx, firstPBIdx);
    created++;
  });

  PAGE1_FIELDS_.forEach((field, targetIdx) => {
    const nowItems = form.getItems();
    const firstBreak = phase1_findFirstPageBreakIndex_(nowItems);
    const idx = nowItems.findIndex((item, i) =>
      i < firstBreak && String(item.getTitle() || '').trim() === field.title
    );
    if (idx !== -1 && idx !== targetIdx) {
      form.moveItem(idx, targetIdx);
    }
  });

  return created;
}

/* =========================
 * ROUTING
 * ========================= */

function phase1_rebuildRoutingForGroup_(form, groupID) {
  const rows = phase1_getSectionRowsForGroup_(groupID);
  const campusByCode = phase1_getCampusByCodeForGroup_(groupID);

  const pbByTitle = new Map();
  form.getItems().forEach(item => {
    if (item.getType() === FormApp.ItemType.PAGE_BREAK) {
      pbByTitle.set(String(item.getTitle() || '').trim(), item.asPageBreakItem());
    }
  });

  const rawChoices = [];
  rows.forEach(row => {
    const targetPB = [...pbByTitle.entries()]
      .find(([title]) => title.trim().toLowerCase() === row.sectionTitle.trim().toLowerCase())?.[1];

    if (!targetPB) return;

    row.codes.forEach(code => {
      rawChoices.push({
        code,
        campusName: campusByCode.get(code) || code,
        target: targetPB
      });
    });
  });

  const seenCodes = new Set();
  const seenLabels = new Set();
  const deduped = rawChoices.filter(x => {
    if (seenCodes.has(x.code) || seenLabels.has(x.campusName)) return false;
    seenCodes.add(x.code);
    seenLabels.add(x.campusName);
    return true;
  });

  if (!deduped.length) return 0;

  phase1_deleteItemsByPredicate_(form, item => {
    const t = item.getType();
    const title = String(item.getTitle() || '').trim();
    return (
      (t === FormApp.ItemType.MULTIPLE_CHOICE || t === FormApp.ItemType.LIST) &&
      title === PHASE1_ENTRY_QUESTION_TITLE_
    );
  });

  const routingItem = form.addMultipleChoiceItem()
    .setTitle(PHASE1_ENTRY_QUESTION_TITLE_)
    .setRequired(true);

  routingItem.setChoices(
    deduped.map(x => routingItem.createChoice(x.campusName, x.target))
  );

  const items = form.getItems();
  const newIdx = items.length - 1;
  const targetIdx = PAGE1_FIELDS_.length;
  if (newIdx !== targetIdx) form.moveItem(newIdx, targetIdx);

  form.setProgressBar(false);
  form.setShuffleQuestions(false);

  return deduped.length;
}

function phase1_setSectionQuestionNavigationToSubmit_(form) {
  form.getItems().forEach(item => {
    const type = item.getType();
    const title = String(item.getTitle() || '').trim();

    if (
      type !== FormApp.ItemType.MULTIPLE_CHOICE ||
      title !== PHASE1_SECTION_QUESTION_TITLE_
    ) return;

    const mc = item.asMultipleChoiceItem();

    mc.setChoices(
      mc.getChoices().map(choice =>
        mc.createChoice(choice.getValue(), FormApp.PageNavigationType.SUBMIT)
      )
    );
  });
}

/* =========================
 * MAIN
 * ========================= */

function phase1_buildSingleGroupForm_(groupID) {
  const gid = phase1_normalizeGroupID_(groupID);
  if (!GROUPS.includes(gid)) throw new Error(`Unsupported groupID: ${groupID}`);

  const form = phase1_getGroupForm_(gid);

  Logger.log(`===== BUILDING ${gid} =====`);

  phase1_cleanupTopLevelNoise_(form);
  phase1_removeAllSubmitPages_(form);
  phase1_deleteClassSections_(form, gid); // Hard clean old sections/questions

  const pageBreaksCreated = phase1_createPageBreaksForGroup_(form, gid);
  const sync = phase1_syncClassChoicesForGroup_(form, gid);
  const page1Created = phase1_ensurePageOneFields_(form);
  const routingCount = phase1_rebuildRoutingForGroup_(form, gid);
  phase1_setSectionQuestionNavigationToSubmit_(form);

  return {
    groupID: gid,
    pageBreaksCreated,
    classQuestionsCreated: sync.created,
    classQuestionsUpdated: sync.updated,
    warnings: sync.warnings,
    page1Created,
    routingCount
  };
}

function RUN_ME_buildAllGroupForms() {
  throw new Error('DISABLED: Google Form registration/application flow disabled. External website flow is now the source of truth.');
}

function RUN_ME_buildGroupCE() {
  throw new Error('DISABLED: Google Form registration/application flow disabled. External website flow is now the source of truth.');
}

function RUN_ME_buildGroupCS() {
  throw new Error('DISABLED: Google Form registration/application flow disabled. External website flow is now the source of truth.');
}

function RUN_ME_buildGroupWS() {
  throw new Error('DISABLED: Google Form registration/application flow disabled. External website flow is now the source of truth.');
}

function RUN_ME_forceCleanAndBuildAllGroupForms() {
  throw new Error('DISABLED: Google Form registration/application flow disabled. External website flow is now the source of truth.');
}

/* =========================
 * DEBUG
 * ========================= */

function debugGroupForms() {
  GROUPS.forEach(groupID => {
    const formRef = String(getConfig(`FORM_ID_${groupID}`) || '').trim();
    Logger.log(`${groupID}: ${formRef || 'MISSING'}`);

    if (!formRef) return;

    try {
      const form = openFormSafe(formRef);
      Logger.log(`OK ${groupID}: ${form.getTitle()}`);
    } catch (e) {
      Logger.log(`FAIL ${groupID}: ${e.message}`);
    }
  });
}

function debugGroupFellowships() {
  GROUPS.forEach(groupID => {
    const rows = phase1_getFellowshipMapRowsByGroup_(groupID);
    Logger.log(`${groupID}: ${rows.length} fellowships`);
    rows.forEach(r => Logger.log(`  ${r.code} => ${r.campusName}`));
  });
}

function debugRoutingForGroup(groupID) {
  const gid = phase1_normalizeGroupID_(groupID);
  const form = phase1_getGroupForm_(gid);
  const rows = phase1_getSectionRowsForGroup_(gid);
  const campusByCode = phase1_getCampusByCodeForGroup_(gid);

  Logger.log(`Group ${gid}`);
  Logger.log(`Campus map size: ${campusByCode.size}`);

  const pbTitles = form.getItems()
    .filter(i => i.getType() === FormApp.ItemType.PAGE_BREAK)
    .map(i => String(i.getTitle() || '').trim());

  Logger.log(`Page breaks (${pbTitles.length}): ${pbTitles.join(' | ')}`);

  rows.forEach(row => {
    Logger.log(`${row.sectionTitle} => ${row.codes.join(', ')}`);
  });
}
