
function pool_syncFromStudents() {
  const stud = getSheet('STUDENTS').getDataRange().getValues();
  const poolSh = getSheet('ELIGIBLE_POOL');
  const pool = poolSh.getDataRange().getValues();
  const SH = headerIndex(stud[0]), PH = headerIndex(pool[0]);
  const existing = new Set(pool.slice(1).map(r => String(r[PH['Email']]||'').trim().toLowerCase()));
  const rows = [];
  for (let i = 1; i < stud.length; i++) {
    const eligible = String(stud[i][SH['EligibleForFS']]||'').toLowerCase() === 'true' || stud[i][SH['EligibleForFS']] === true;
    const status = String(stud[i][SH['EligiblePoolStatus']]||'').trim();
    const email = String(stud[i][SH['Email']]||'').trim().toLowerCase();
    if (!eligible || !email) continue;
    if (['Registered','In Progress','Graduated'].includes(status)) continue;
    if (!existing.has(email)) {
      const dateAdded = stud[i][SH['DateAddedElvanto']] instanceof Date ? stud[i][SH['DateAddedElvanto']] : new Date();
      const days = Math.floor((new Date() - dateAdded)/(1000*60*60*24));
      rows.push([stud[i][SH['StudentID']]||email, stud[i][SH['FullName']]||'', email, stud[i][SH['GroupID']]||'', stud[i][SH['SubgroupID']]||'', 'Not Started', '', '', '', '', '', stud[i][SH['ReasonNotStarted']]||'', days, days > 42]);
      existing.add(email);
    }
  }
  if (rows.length) poolSh.getRange(poolSh.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  if (typeof logSync_ === 'function') logSync_('POOL_SYNC', `Added ${rows.length} eligible pool row(s)`);
}

function pool_runDailyCheck() {
  const sh = getSheet('ELIGIBLE_POOL');
  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0]);
  let escalated = 0;
  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][H['EligiblePoolStatus']]||'').trim();
    const nextDeadline = data[i][H['NextActionDeadline']];
    const days = Number(data[i][H['DaysInPool']]||0);
    const overdueDeadline = nextDeadline instanceof Date && nextDeadline < new Date() && !String(data[i][H['ContactOutcome']]||'').trim();
    const shouldEscalate = (days > 42 && status === 'Not Started') || overdueDeadline;
    data[i][H['EscalationFlag']] = shouldEscalate;
    if (shouldEscalate) escalated++;
  }
  if (data.length > 1) sh.getRange(2,1,data.length-1,data[0].length).setValues(data.slice(1));
  if (typeof logSync_ === 'function') logSync_('POOL_DAILY', `${escalated} escalated row(s)`);
  return escalated;
}

function pool_markRegistered_(email, batchID) {
  const sh = getSheet('ELIGIBLE_POOL');
  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0]);
  const target = String(email || '').trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][H['Email']]||'').trim().toLowerCase() === target) {
      data[i][H['EligiblePoolStatus']] = 'Registered';
      data[i][H['EscalationFlag']] = false;
      sh.getRange(i+1,1,1,data[0].length).setValues([data[i]]);
      return true;
    }
  }
  return false;
}
