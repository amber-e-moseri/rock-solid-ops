
function ft_processElvantoImport() {
  const imp = getSheet('ELVANTO_IMPORT').getDataRange().getValues();
  const stud = getSheet('STUDENTS').getDataRange().getValues();
  const pipeSh = getSheet('FT_PIPELINE');
  const pipe = pipeSh.getDataRange().getValues();
  const IH = headerIndex(imp[0]), SH = headerIndex(stud[0]), PH = headerIndex(pipe[0]);
  const existingEmails = new Set(pipe.slice(1).map(r => String(r[PH['Email']]||'').trim().toLowerCase()).concat(stud.slice(1).map(r => String(r[SH['Email']]||'').trim().toLowerCase())));
  const out = [];
  let processed = 0;
  for (let i = 1; i < imp.length; i++) {
    const email = String(imp[i][IH['Email']] || '').trim().toLowerCase();
    const done = String(imp[i][IH['ProcessedToEligiblePool']] || '').toLowerCase() === 'true';
    if (!email || done) continue;
    if (!existingEmails.has(email)) {
      const dateAdded = imp[i][IH['DateAdded']] instanceof Date ? imp[i][IH['DateAdded']] : new Date(imp[i][IH['DateAdded']]);
      const week3 = new Date(dateAdded); week3.setDate(week3.getDate()+21);
      const week6 = new Date(dateAdded); week6.setDate(week6.getDate()+42);
      out.push([email, imp[i][IH['FullName']]||'', email, dateAdded, week3, false, week6, false, '', '', '', '', '', false]);
      existingEmails.add(email);
    }
    imp[i][IH['ProcessedToEligiblePool']] = true;
    imp[i][IH['ImportedDate']] = new Date();
    processed++;
  }
  if (out.length) pipeSh.getRange(pipeSh.getLastRow()+1,1,out.length,out[0].length).setValues(out);
  if (imp.length > 1) getSheet('ELVANTO_IMPORT').getRange(2,1,imp.length-1,imp[0].length).setValues(imp.slice(1));
  if (typeof logSync_ === 'function') logSync_('FT_IMPORT', `Processed ${processed}, created ${out.length}`);
}

function ft_runDailyFlagCheck() {
  const sh = getSheet('FT_PIPELINE');
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;
  const H = headerIndex(data[0]);
  const applicants = getSheet('APPLICANTS').getDataRange().getValues();
  const AH = headerIndex(applicants[0]);
  const regEmails = new Set(applicants.slice(1).map(r => String(r[AH['Email']]||'').trim().toLowerCase()));
  const today = new Date();
  let fired = 0;
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][H['Email']]||'').trim().toLowerCase();
    if (!email || regEmails.has(email)) {
      if ('ConvertedToFS' in H) data[i][H['ConvertedToFS']] = !!email && regEmails.has(email);
      continue;
    }
    if (data[i][H['Week3FlagDate']] instanceof Date && today >= data[i][H['Week3FlagDate']] && !data[i][H['Week3FlagFired']]) {
      data[i][H['Week3FlagFired']] = true; fired++;
    }
    if (data[i][H['Week6FlagDate']] instanceof Date && today >= data[i][H['Week6FlagDate']] && !data[i][H['Week6FlagFired']]) {
      data[i][H['Week6FlagFired']] = true; fired++;
    }
  }
  sh.getRange(2,1,data.length-1,data[0].length).setValues(data.slice(1));
  if (typeof logSync_ === 'function') logSync_('FT_FLAG_CHECK', `${fired} flag(s) fired`);
  return fired;
}

function ft_installDailyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'ft_runDailyFlagCheck').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('ft_runDailyFlagCheck').timeBased().atHour(8).everyDays(1).create();
}
