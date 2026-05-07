/***************************************
 * 01_DateUtils.gs
 ***************************************/

function formatDateInSystemTZ(date, format) {
  if (!(date instanceof Date)) throw new Error('formatDateInSystemTZ: date must be a Date object');
  return Utilities.formatDate(date, getConfig('SYSTEM_TIMEZONE') || 'America/Toronto', format);
}

function formatTime(timeValue) {
  if (timeValue === null || timeValue === undefined || timeValue === '') return '';

  if (timeValue instanceof Date && !isNaN(timeValue.getTime())) {
    return Utilities.formatDate(timeValue, getConfig('SYSTEM_TIMEZONE') || 'America/Toronto', 'HH:mm');
  }

  if (typeof timeValue === 'number' && isFinite(timeValue)) {
    const totalMinutes = Math.round(timeValue * 24 * 60);
    const hh = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  const s = String(timeValue || '').trim();
  if (!s) return '';

  let match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (match) {
    let hh = parseInt(match[1], 10);
    const mm = parseInt(match[2] || '0', 10);
    const meridiem = match[3].toUpperCase();
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return '';
    if (meridiem === 'PM' && hh < 12) hh += 12;
    if (meridiem === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return '';
}
