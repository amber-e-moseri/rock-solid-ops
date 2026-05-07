/***************************************
 * 01_SheetUtils.gs
 ***************************************/

function getSheet(sheetName) {
  const ss = getFoundationSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Required sheet not found: "${sheetName}"`);
  return sheet;
}

function ensureSheet(sheetName, headers) {
  const ss = getFoundationSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4a5568').setFontColor('#ffffff');
    logInfo('SheetSetup', `Created sheet: ${sheetName}`, { headers: headers.length });
  }

  return sheet;
}

function getFoundationSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const fromProp = String(props.getProperty('FOUNDATION_SPREADSHEET_ID') || '').trim();
  if (fromProp) return SpreadsheetApp.openById(fromProp);
  if (typeof FOUNDATION_SPREADSHEET_ID !== 'undefined' && String(FOUNDATION_SPREADSHEET_ID || '').trim()) {
    return SpreadsheetApp.openById(String(FOUNDATION_SPREADSHEET_ID).trim());
  }
  if (typeof SYSTEM_SPREADSHEET_ID !== 'undefined' && String(SYSTEM_SPREADSHEET_ID || '').trim()) {
    return SpreadsheetApp.openById(String(SYSTEM_SPREADSHEET_ID).trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureColumns(sheet, columnNames) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const existing = new Set(headers.map(h => String(h || '').trim()));
  const toAdd = columnNames.filter(c => !existing.has(c));

  if (toAdd.length > 0) {
    const startCol = lastCol + 1;
    sheet.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
    logInfo('SheetSetup', `Added columns to ${sheet.getName()}`, { columns: toAdd });
  }
}

function buildColumnIndex(headers) {
  const index = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim();
    if (key) index[key] = i;
  });
  return index;
}

function buildColumnIndexNormalized(headers) {
  const index = {};
  headers.forEach((h, i) => {
    let key = String(h || '').trim();
    key = key.replace(/^[A-Z]\s*[-]?\s*\d+\s*/i, '');
    key = key.replace(/\s+/g, '').toLowerCase();
    if (key) index[key] = i;
  });
  return index;
}

function headerIndex(headersRow) {
  return buildColumnIndex(headersRow);
}

function headerIndexLoose(headers) {
  return buildColumnIndexNormalized(headers);
}
