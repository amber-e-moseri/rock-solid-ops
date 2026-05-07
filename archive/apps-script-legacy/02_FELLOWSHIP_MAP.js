/***************************************
 * 02_FELLOWSHIP_MAP.gs
 ***************************************/

const SHEET_FELLOWSHIP_MAP = 'FELLOWSHIP_MAP';
const FELLOWSHIP_MAP_HEADERS_ = ['FellowshipCode', 'CampusName', 'GroupID', 'SubgroupID', 'Active', 'Timezone'];

// Format per row: [FellowshipCode, CampusName, GroupID, SubgroupID, Active, Timezone]
const FELLOWSHIP_MAP_SEED_ = [
  // ── Central East A (Prairies) ─────────────────────────────────
  ['CMU',        'Canadian Mennonite University',       'CE', 'CESGA', true, 'America/Winnipeg'],
  ['UNP',        'University of the North, The Pas',    'CE', 'CESGA', true, 'America/Winnipeg'],
  ['UMANITOBA',  'University of Manitoba',              'CE', 'CESGA', true, 'America/Winnipeg'],
  ['USASK',      'University of Saskatchewan',          'CE', 'CESGA', true, 'America/Regina'],
  ['UREGINA',    'University of Regina',                'CE', 'CESGA', true, 'America/Regina'],
  ['USB',        'University of St. Boniface',          'CE', 'CESGA', true, 'America/Winnipeg'],
  ['UWINNIPEG',  'University of Winnipeg',              'CE', 'CESGA', true, 'America/Winnipeg'],

  // ── Central East B (Atlantic) ─────────────────────────────────
  ['CNA',  'College of the North Atlantic',         'CE', 'CESGB', true, 'America/St_Johns'],
  ['MUN',  'Memorial University',                   'CE', 'CESGB', true, 'America/St_Johns'],
  ['DAL',  'Dalhousie University',                  'CE', 'CESGB', true, 'America/Halifax'],
  ['UNB',  'University of New Brunswick',           'CE', 'CESGB', true, 'America/Halifax'],
  ['UPEI', 'University of Prince Edward Island',    'CE', 'CESGB', true, 'America/Halifax'],

  // ── Central South A (Toronto / Ottawa / Quebec) ───────────────
  ['QC',         'Quebec',                              'CS', 'CSGA', true, 'America/Toronto'],
  ['ALGOMAU',    'Algoma University',                   'CS', 'CSGA', true, 'America/Toronto'],
  ['BROCK',      'Brock University',                    'CS', 'CSGA', true, 'America/Toronto'],
  ['CENTENNIAL', 'Centennial College',                  'CS', 'CSGA', true, 'America/Toronto'],
  ['OTTAWA',     'University of Ottawa',                'CS', 'CSGA', true, 'America/Toronto'],
  ['TMU',        'Toronto Metropolitan University',     'CS', 'CSGA', true, 'America/Toronto'],
  ['UTSC',       'University of Toronto Scarborough',   'CS', 'CSGA', true, 'America/Toronto'],
  ['UTSG',       'University of Toronto St. George',    'CS', 'CSGA', true, 'America/Toronto'],
  ['YORK',       'York University',                     'CS', 'CSGA', true, 'America/Toronto'],
  ['YORKVILLE',  'Yorkville University',                'CS', 'CSGA', true, 'America/Toronto'],

  // ── Central South B (West GTA / Waterloo) ─────────────────────
  ['UGUELPH',     'University of Guelph',                   'CS', 'CSGB', true, 'America/Toronto'],
  ['HUMBERNORTH', 'Humber College North',                   'CS', 'CSGB', true, 'America/Toronto'],
  ['SHERIDAN',    'Sheridan College',                        'CS', 'CSGB', true, 'America/Toronto'],
  ['SHERIDANHMC', 'Sheridan HMC',                           'CS', 'CSGB', true, 'America/Toronto'],
  ['SHERIDANTRAF','Sheridan Trafalgar',                      'CS', 'CSGB', true, 'America/Toronto'],
  ['SHERIDANO',   'Sheridan Oakville / Mississauga',         'CS', 'CSGB', true, 'America/Toronto'],
  ['UTM',         'University of Toronto Mississauga',       'CS', 'CSGB', true, 'America/Toronto'],
  ['UWATERLOO',   'University of Waterloo',                  'CS', 'CSGB', true, 'America/Toronto'],
  ['LAURIER',     'Wilfrid Laurier University',              'CS', 'CSGB', true, 'America/Toronto'],
  ['WLU',         'Wilfrid Laurier University (Brantford)',  'CS', 'CSGB', true, 'America/Toronto'],

  // ── West A (Alberta / BC) ─────────────────────────────────────
  ['MACEWAN',  'MacEwan University',            'WS', 'WSGA', true, 'America/Edmonton'],
  ['TRU',      'Thompson Rivers University',    'WS', 'WSGA', true, 'America/Vancouver'],
  ['UALBERTA', 'University of Alberta',         'WS', 'WSGA', true, 'America/Edmonton'],
  ['UCALGARY', 'University of Calgary',         'WS', 'WSGA', true, 'America/Edmonton'],

  // ── West B (Southern Alberta) ─────────────────────────────────
  ['LETHPOLY', 'Lethbridge Polytechnic',      'WS', 'WSGB', true, 'America/Edmonton'],
  ['MHC',      'Medicine Hat College',         'WS', 'WSGB', true, 'America/Edmonton'],
  ['ULETH',    'University of Lethbridge',     'WS', 'WSGB', true, 'America/Edmonton'],
];

function setupFellowshipMap() {
  const sh = ensureSheet(SHEET_FELLOWSHIP_MAP, FELLOWSHIP_MAP_HEADERS_);
  sh.getRange(1, 1, 1, FELLOWSHIP_MAP_HEADERS_.length)
    .setValues([FELLOWSHIP_MAP_HEADERS_])
    .setFontWeight('bold')
    .setBackground('#2B6CB0')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);

  const data = sh.getDataRange().getValues();
  const H = headerIndex(data[0]);
  const existing = new Set();
  for (let i = 1; i < data.length; i++) {
    const code = normalizeCode(data[i][H.FellowshipCode]);
    if (code) existing.add(code);
  }

  const seenSeed = new Set();
  const rowsToAdd = [];
  for (let i = 0; i < FELLOWSHIP_MAP_SEED_.length; i++) {
    const row = FELLOWSHIP_MAP_SEED_[i];
    const code = normalizeCode(row[0]);
    if (!code || seenSeed.has(code) || existing.has(code)) continue;
    seenSeed.add(code);
    rowsToAdd.push([
      code,
      String(row[1] || '').trim(),
      String(row[2] || '').trim(),
      String(row[3] || '').trim(),
      row[4] === false ? false : true,
      String(row[5] || '').trim() || 'America/Toronto'
    ]);
  }

  if (rowsToAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAdd.length, FELLOWSHIP_MAP_HEADERS_.length).setValues(rowsToAdd);
  }

  logSync_('FELLOWSHIP_MAP_SETUP', `Completed setup. inserted=${rowsToAdd.length}, existing=${existing.size}`);
  return { inserted: rowsToAdd.length, existing: existing.size };
}

function fellowshipMap_getAll() {
  const sh = getSheet(SHEET_FELLOWSHIP_MAP);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const H = headerIndex(data[0]);

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!isTrue(row[H.Active])) continue;
    const code = normalizeCode(row[H.FellowshipCode]);
    if (!code) continue;
    out.push({
      code: code,
      campusName: String(row[H.CampusName] || '').trim(),
      groupID: String(row[H.GroupID] || '').trim(),
      subgroupID: String(row[H.SubgroupID] || '').trim(),
      timezone: String(row[H.Timezone] || '').trim() || 'America/Toronto'
    });
  }
  return out;
}

function fellowshipMap_lookup(code) {
  const needle = normalizeCode(code);
  if (!needle) return null;
  const rows = fellowshipMap_getAll();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].code === needle) return rows[i];
  }
  return null;
}

function fellowshipMap_getBySubgroup(subgroupID) {
  const needle = String(subgroupID || '').trim().toUpperCase();
  return fellowshipMap_getAll().filter(r => String(r.subgroupID || '').trim().toUpperCase() === needle);
}

function fellowshipMap_getByGroup(groupID) {
  const needle = String(groupID || '').trim().toUpperCase();
  return fellowshipMap_getAll().filter(r => String(r.groupID || '').trim().toUpperCase() === needle);
}
