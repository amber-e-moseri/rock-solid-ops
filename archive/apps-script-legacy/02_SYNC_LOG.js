/***************************************
 * 02_SYNC_LOG.gs
 ***************************************/

function setupSyncLog() {
  ensureSheet('SYNC_LOG', ['Timestamp', 'Phase', 'Message', 'Details', 'RunBy']);
  ensureSheet('AUDIT_LOG', ['Timestamp', 'Action', 'EntityType', 'EntityID', 'Before', 'After', 'Notes', 'By']);
  uiAlert_('SYNC_LOG and AUDIT_LOG sheets ready.');
}

function pruneSyncLog(keepRows) {
  const maxRows = Number(keepRows || 500);
  try {
    const sh = getSheet('SYNC_LOG');
    const lastRow = sh.getLastRow();
    const deleteCount = lastRow - maxRows - 1;
    if (deleteCount > 0) {
      sh.deleteRows(2, deleteCount);
      logSync_('SYNC_LOG', `Pruned ${deleteCount} old rows, kept ${maxRows}`);
    }
  } catch (e) {
    Logger.log('pruneSyncLog error: ' + e);
  }
}
