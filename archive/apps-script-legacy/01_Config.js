/***************************************
 * 01_Config.gs
 ***************************************/

const CONFIG_DEFAULTS_ = [
  ['FORM_ID_OR_URL', '', 'Leave blank to use script default; fill to override'],
  ['SYSTEM_SPREADSHEET_ID', '', 'Leave blank to use script default; fill to override'],
  ['SYSTEM_TIMEZONE', 'America/Toronto', 'Timezone for all date formatting'],
  ['SYSTEM_SHEET_EMAIL_TEMPLATES', 'EMAIL_TEMPLATES', 'Sheet name in system workbook'],
  ['REGISTRATION_SOURCE', 'WEBSITE', 'WEBSITE or GOOGLE_FORM. WEBSITE disables legacy Phase2 form ingestion.'],

  ['CAMPUS_QUESTION_TITLE', 'Which campus are you from?', 'Form question title for campus/fellowship'],
  ['FULLNAME_Q_TITLE', 'Full Name', 'Form question for full name'],
  ['FIRSTNAME_Q_TITLE', 'First Name', 'Form question for first name'],
  ['LASTNAME_Q_TITLE', 'Last Name', 'Form question for last name'],
  ['EMAIL_Q_TITLE', 'Email', 'Form question for email'],
  ['PHONE_Q_TITLE', 'Phone Number', 'Form question for phone'],

  ['INCLUDE_CLASS_ID_IN_LABEL', 'FALSE', 'TRUE = show [ClassID] in form labels'],
  ['SORT_CHOICES', 'TRUE', 'TRUE = sort class choices alphabetically'],
  ['EMPTY_CHOICE_LABEL', '(No active classes yet)', 'Shown when a section has no active classes'],

  ['SENDER_NAME', 'Foundation School Team', 'Display name on outbound emails'],
  ['REPLY_TO', 'info@lwcanada.org', 'Reply-to address on outbound emails'],
  ['SEND_AS', '', 'Send-as alias (must be configured in Gmail first)'],

  ['ROSTER_SEND_MODE', 'DAILY', 'DAILY or WEEKLY - when to send teacher rosters'],
  ['ROSTER_SEND_HOUR', '7', 'Hour (0-23) to send teacher roster emails'],
  ['ROSTER_SEND_WEEKDAY', '1', 'Day for WEEKLY roster (0=Sun, 1=Mon ... 6=Sat)'],

];

const CONST_FALLBACKS_ = {
  FORM_ID_OR_URL: FORM_ID_OR_URL,
  SYSTEM_SPREADSHEET_ID: SYSTEM_SPREADSHEET_ID,
  SYSTEM_TIMEZONE: SYSTEM_TIMEZONE,
  SYSTEM_SHEET_EMAIL_TEMPLATES: SYSTEM_SHEET_EMAIL_TEMPLATES,
  REGISTRATION_SOURCE: 'WEBSITE',

  CAMPUS_QUESTION_TITLE: CAMPUS_QUESTION_TITLE,
  FULLNAME_Q_TITLE: FULLNAME_Q_TITLE,
  FIRSTNAME_Q_TITLE: FIRSTNAME_Q_TITLE,
  LASTNAME_Q_TITLE: LASTNAME_Q_TITLE,
  EMAIL_Q_TITLE: EMAIL_Q_TITLE,
  PHONE_Q_TITLE: PHONE_Q_TITLE,

  INCLUDE_CLASS_ID_IN_LABEL: INCLUDE_CLASS_ID_IN_LABEL,
  SORT_CHOICES: SORT_CHOICES,
  EMPTY_CHOICE_LABEL: EMPTY_CHOICE_LABEL,

  SENDER_NAME: SENDER_NAME,
  REPLY_TO: REPLY_TO,
  SEND_AS: SEND_AS,

  ROSTER_SEND_MODE: ROSTER_SEND_MODE,
  ROSTER_SEND_HOUR: ROSTER_SEND_HOUR,
  ROSTER_SEND_WEEKDAY: ROSTER_SEND_WEEKDAY
};

let _cfgCache_ = null;

function setupConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('CONFIG');

  if (!sh) {
    sh = ss.insertSheet('CONFIG');
    sh.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'Description', 'Last Updated']]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#4a5568').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    logSync_('CONFIG_SETUP', 'Created CONFIG sheet');
  }

  const rows = sh.getDataRange().getValues();
  const existing = new Set();
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    if (key) existing.add(key);
  }

  const missing = CONFIG_DEFAULTS_.filter(([key]) => !existing.has(key));
  if (missing.length) {
    const addRows = missing.map(([k, v, desc]) => [k, v, desc, new Date()]);
    sh.getRange(sh.getLastRow() + 1, 1, addRows.length, 4).setValues(addRows);
    logSync_('CONFIG_SETUP', `Added ${addRows.length} CONFIG default rows`);
  }

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.getRange(2, 2, lastRow - 1, 1).setNumberFormat('@');

  sh.setColumnWidth(1, 240);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 420);
  sh.setColumnWidth(4, 160);

  ensureConfigGuidance_();
  cfg_clearCache_();

  uiAlert_('CONFIG sheet ready.');
}

function ensureConfigGuidance_() {
  const guidance = 'Leave blank to use script default. If filled, this overrides the default. Use ID only unless full URL is supported.';
  const sh = ensureSheet('CONFIG', ['Key', 'Value', 'Description', 'Last Updated']);

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  let notesCol = headers.indexOf('Notes') + 1;
  if (!notesCol) {
    notesCol = sh.getLastColumn() + 1;
    sh.getRange(1, notesCol).setValue('Notes');
    logSync_('CONFIG_GUIDANCE', 'Added CONFIG.Notes column');
  }

  const lastRow = sh.getLastRow();
  const data = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues() : [];
  const rowByKey = {};
  for (let i = 0; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (key) rowByKey[key] = i + 2;
  }

  const touched = [];
  ['FORM_ID_OR_URL', 'SYSTEM_SPREADSHEET_ID'].forEach(key => {
    let rowIndex = rowByKey[key];
    if (!rowIndex) {
      rowIndex = sh.getLastRow() + 1;
      const row = new Array(sh.getLastColumn()).fill('');
      row[0] = key;
      row[2] = 'Critical config key';
      row[3] = new Date();
      row[notesCol - 1] = guidance;
      sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      touched.push(`${key} (added)`);
    } else {
      sh.getRange(rowIndex, notesCol).setValue(guidance);
      touched.push(`${key} (noted)`);
    }
  });

  if (touched.length) logSync_('CONFIG_GUIDANCE', `Updated CONFIG notes for ${touched.join(', ')}`);
}

function validateConfigSheet() {
  const required = ['FORM_ID_OR_URL', 'SYSTEM_SPREADSHEET_ID', 'SYSTEM_TIMEZONE'];
  const missing = required.filter(k => !getConfig(k));
  if (missing.length) {
    uiAlert_('Config validation FAILED\n\nMissing or empty:\n' + missing.join('\n'));
    return false;
  }
  uiAlert_('Config validation passed.');
  return true;
}

function getConfig(key) {
  if (!_cfgCache_) _cfgCache_ = cfg_loadSheet_();
  if (key in _cfgCache_ && _cfgCache_[key] !== '') return _cfgCache_[key];
  if (key in CONST_FALLBACKS_) {
    const v = CONST_FALLBACKS_[key];
    return (v === null || v === undefined) ? '' : String(v);
  }
  return '';
}

function cfg_clearCache_() {
  _cfgCache_ = null;
}

function cfg_loadSheet_() {
  const out = {};
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    if (!sh) return out;
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const k = String(rows[i][0] || '').trim();
      const v = String(rows[i][1] || '').trim();
      if (k) out[k] = v;
    }
  } catch (e) {
    Logger.log('cfg_loadSheet_ error: ' + e);
  }
  return out;
}

function config_validateClassOptions_() {
  const sh = getSheet('CLASS_OPTIONS');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const H = headerIndex(data[0]);
  const issues = [];
  for (let i = 1; i < data.length; i++) {
    const classID = String(data[i][H['ClassID']] || '').trim();
    if (!classID || classID.startsWith('#') || /\s/.test(classID)) {
      issues.push(`CLASS_OPTIONS row ${i + 1} invalid ClassID: ${classID}`);
    }
  }
  issues.forEach(msg => logSync_('CLASS_OPTIONS_VALIDATE', msg));
  return issues;
}
