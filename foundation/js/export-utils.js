export function csvEscape(value) {
  const v = String(value ?? "");
  return `"${v.replace(/"/g, '""')}"`;
}

export function toCsv(headers, rows) {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename, headers, rows) {
  const csv = toCsv(headers, rows);
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}
