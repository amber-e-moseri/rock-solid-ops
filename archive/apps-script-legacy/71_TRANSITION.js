
function transition_onGraduation_(studentID, graduationDate, batchID) {
  const sh = getSheet('TRANSITION_LOG');
  const deadline = new Date(graduationDate); deadline.setDate(deadline.getDate() + 14);
  sh.appendRow([studentID, graduationDate, batchID, deadline, '', '', '', 'Pending', false, '']);
}

function transition_runDailyCheck() {
  const sh = getSheet('TRANSITION_LOG');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;
  const H = headerIndex(data[0]);
  let flagged = 0;
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][H['PlacementStatus']]||'').trim();
    const g = data[i][H['GraduationDate']];
    if (status === 'Placed' || !(g instanceof Date)) continue;
    const days = Math.floor((new Date() - g)/(1000*60*60*24));
    if (days >= 21) { data[i][H['OverdueFlag']] = true; flagged++; }
  }
  sh.getRange(2,1,data.length-1,data[0].length).setValues(data.slice(1));
  if (typeof logSync_ === 'function') logSync_('TRANSITION_DAILY', `${flagged} overdue transition row(s)`);
  return flagged;
}
