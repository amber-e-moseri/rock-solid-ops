
function buildGroupSummary() {
  const sh = getSheet('GROUP_SUMMARY');
  const students = getSheet('STUDENTS').getDataRange().getValues();
  const pool = getSheet('ELIGIBLE_POOL').getDataRange().getValues();
  const moodle = getSheet('MOODLE_SYNC').getDataRange().getValues();
  const grad = getSheet('GRADUATION_REVIEW').getDataRange().getValues();
  const trans = getSheet('TRANSITION_LOG').getDataRange().getValues();
  const ft = getSheet('FT_PIPELINE').getDataRange().getValues();
  const feedback = getSheet('FEEDBACK_LOG').getDataRange().getValues();
  const SH = headerIndex(students[0]), PH = headerIndex(pool[0]), MH = headerIndex(moodle[0]), GH = headerIndex(grad[0]), TH = headerIndex(trans[0]), FH = headerIndex(ft[0]), FBH = headerIndex(feedback[0]);
  const keys = new Set(students.slice(1).map(r => `${r[SH['GroupID']]||''}||${r[SH['SubgroupID']]||''}`).filter(k => k !== '||'));
  const rows = [];
  keys.forEach(key => {
    const [groupID, subgroupID] = key.split('||');
    const stu = students.slice(1).filter(r => String(r[SH['GroupID']]||'') === groupID && String(r[SH['SubgroupID']]||'') === subgroupID);
    const mood = moodle.slice(1).filter(r => String(r[MH['SubgroupID']]||'') === subgroupID);
    const gradRows = grad.slice(1).filter(r => String(r[GH['SubgroupID']]||'') === subgroupID);
    const feed = feedback.slice(1).filter(r => String(r[FBH['SubgroupID']]||'') === subgroupID);
    rows.push([
      groupID, subgroupID,
      stu.length,
      stu.filter(r => String(r[SH['Status']]||'') === 'Active').length,
      stu.filter(r => String(r[SH['Status']]||'') === 'At Risk').length,
      pool.slice(1).filter(r => String(r[PH['GroupID']]||'') === groupID && String(r[PH['SubgroupID']]||'') === subgroupID && String(r[PH['EligiblePoolStatus']]||'') !== 'Graduated').length,
      0,
      mood.length ? mood.reduce((a,r)=>a+Number(r[MH['MoodleProgress']]||0),0)/mood.length : 0,
      gradRows.filter(r => !!r[GH['AllGatesMet']]).length,
      stu.filter(r => String(r[SH['Status']]||'') === 'Graduated').length,
      gradRows.filter(r => !!r[GH['Gate4_CellIntegrated']]).length,
      trans.slice(1).filter(r => String(r[TH['PlacementStatus']]||'') === 'Placed').length,
      ft.length > 1 ? ft.slice(1).filter(r => !!r[FH['ConvertedToFS']]).length / (ft.length - 1) : 0,
      feed.length ? feed.reduce((a,r)=>a+Number(r[FBH['OverallScore']]||0),0)/feed.length : 0,
      new Date()
    ]);
  });
  if (rows.length) {
    if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
    sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  }
  return rows.length;
}
