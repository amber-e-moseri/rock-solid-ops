/***************************************
 * 01_StringUtils.gs
 ***************************************/

const VALID_STUDENT_STATUSES = new Set(['Active', 'At Risk', 'Withdrawn', 'Graduated', 'Pending']);

function assertValidStatus_(value, context) {
  const s = String(value || '').trim();
  if (!VALID_STUDENT_STATUSES.has(s)) {
    throw new Error(`Invalid Status "${s}" in ${context}. Must be one of: ${[...VALID_STUDENT_STATUSES].join(', ')}`);
  }
  return s;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function normalizeWeekday(day) {
  if (!isTrue(getConfig('WEEKDAY_NORMALIZE') || WEEKDAY_NORMALIZE)) return String(day || '').trim();
  const d = String(day || '').trim().toLowerCase();
  const map = {
    mon: 'Monday', monday: 'Monday',
    tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
    wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday',
    thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
    fri: 'Friday', friday: 'Friday',
    sat: 'Saturday', saturday: 'Saturday',
    sun: 'Sunday', sunday: 'Sunday'
  };
  return map[d] || String(day || '').trim();
}

function normalizeWeekdayInsideLabel(label) {
  return String(label || '')
    .replace(/\bMon\b/gi, 'Monday')
    .replace(/\bTue(s)?\b/gi, 'Tuesday')
    .replace(/\bWed(s)?\b/gi, 'Wednesday')
    .replace(/\bThu(rs)?\b/gi, 'Thursday')
    .replace(/\bFri\b/gi, 'Friday')
    .replace(/\bSat\b/gi, 'Saturday')
    .replace(/\bSun\b/gi, 'Sunday');
}

function normalizeLabel(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2012\u2013\u2014\u2015-]+/g, ' - ')
    .replace(/\s* - \s*/g, ' - ')
    .replace(/\b(\d{1,2}):(\d{2}):\d{2}\b/g, (m, hh, mm) => `${String(parseInt(hh, 10)).padStart(2, '0')}:${mm}`)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\[\]:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBracketCode(text) {
  if (!text) return '';
  const match = String(text).match(/\[([^\]]+)\]\s*$/);
  return match ? match[1].trim() : '';
}

function parseCodesCsv(csv) {
  return String(csv || '')
    .split(/[,;|]/g)
    .map(s => s.trim())
    .map(s => extractBracketCode(s) || s)
    .map(s => normalizeCode(s))
    .filter(Boolean);
}

function isProbablyClassChoice(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /\[[^\]]+\]\s*$/.test(s) || /-|�/.test(s) || /(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(s);
}

function buildFullName(ansByTitle, values) {
  const first = String(
    ansByTitle['Student First Name'] ||
    ansByTitle[FIRSTNAME_Q_TITLE] ||
    ansByTitle['First name'] ||
    ansByTitle['Firstname'] ||
    ansByTitle['FirstName'] ||
    ''
  ).trim();

  const last = String(
    ansByTitle['Student Last Name'] ||
    ansByTitle[LASTNAME_Q_TITLE] ||
    ansByTitle['Last name'] ||
    ansByTitle['Lastname'] ||
    ansByTitle['LastName'] ||
    ansByTitle['Surname'] ||
    ''
  ).trim();

  if (first || last) return [first, last].filter(Boolean).join(' ').trim();

  const fallback = String(ansByTitle[FULLNAME_Q_TITLE] || '').trim();
  if (fallback) return fallback;

  const candidates = [];
  (values || []).forEach(v => {
    if (typeof v !== 'string') return;
    const s = v.trim();
    if (!s) return;
    if (s.includes('@')) return;
    if (/^\+?\d[\d\s()-]{6,}$/.test(s)) return;
    candidates.push(s);
  });
  if (candidates.length >= 2) return `${candidates[0]} ${candidates[1]}`.trim();
  return candidates[0] || '';
}

function buildFullNameWarning(ansByTitle) {
  const first = String(
    ansByTitle['Student First Name'] ||
    ansByTitle[FIRSTNAME_Q_TITLE] ||
    ansByTitle['First name'] ||
    ansByTitle['Firstname'] ||
    ansByTitle['FirstName'] ||
    ''
  ).trim();
  const last = String(
    ansByTitle['Student Last Name'] ||
    ansByTitle[LASTNAME_Q_TITLE] ||
    ansByTitle['Last name'] ||
    ansByTitle['Lastname'] ||
    ansByTitle['LastName'] ||
    ansByTitle['Surname'] ||
    ''
  ).trim();
  return first && !last ? 'Last name missing' : '';
}

function isTruthy(value) {
  if (value === true) return true;
  const s = String(value == null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function isTrue(value) {
  return isTruthy(value);
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}
