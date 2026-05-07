/***************************************
 * 01_LogUtils.gs
 ***************************************/

function logInfo(phase, message, extra) {
  const line = `[${phase}] ${message}` + (extra != null ? ' ' + JSON.stringify(extra) : '');
  Logger.log(line);
  if (typeof logSync_ === 'function') {
    try { logSync_(phase, message, extra); } catch (e) { }
  }
}

function logSync_(phase, message, extra) {
  try {
    const sh = syncLog_ensure_('SYNC_LOG', ['Timestamp', 'Phase', 'Message', 'Details', 'RunBy']);
    sh.appendRow([
      new Date(),
      String(phase || ''),
      String(message || ''),
      extra != null ? JSON.stringify(extra) : '',
      syncLog_whoAmI_()
    ]);
  } catch (e) {
    Logger.log('[logSync_ failed] ' + e + ' | ' + phase + ': ' + message);
  }
}

function logAudit_(action, entityType, entityId, before, after, notes) {
  try {
    const sh = syncLog_ensure_('AUDIT_LOG', ['Timestamp', 'Action', 'EntityType', 'EntityID', 'Before', 'After', 'Notes', 'By']);
    sh.appendRow([
      new Date(),
      String(action || ''),
      String(entityType || ''),
      String(entityId || ''),
      before != null ? JSON.stringify(before) : '',
      after != null ? JSON.stringify(after) : '',
      String(notes || ''),
      syncLog_whoAmI_()
    ]);
  } catch (e) {
    Logger.log('[logAudit_ failed] ' + e);
  }
}

function syncLog_ensure_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4a5568').setFontColor('#ffffff');
  }
  return sh;
}

function syncLog_whoAmI_() {
  try {
    return Session.getActiveUser().getEmail() || 'trigger';
  } catch (e) {
    return 'trigger';
  }
}
