const { presentItem } = require("./itemRules");

const COLUMNS = [
  ["Reference", "code"],
  ["Item name", "name"],
  ["Category", "categoryLabel"],
  ["Found at", "placeLabel"],
  ["Campus", "campusLabel"],
  ["Status", "statusLabel"],
  ["Date found", "foundOn"],
  ["Shelf spot", "spot"],
  ["Description", "description"],
  ["Logged by", "loggedBy"],
];

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Keep user-entered text from being interpreted as a spreadsheet formula.
  if (/^\s*[=+\-@]|^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function createItemCsv(docs) {
  const rows = [COLUMNS.map(([heading]) => csvCell(heading)).join(",")];
  for (const doc of docs) {
    const item = presentItem(doc);
    rows.push(COLUMNS.map(([, key]) => csvCell(item[key])).join(","));
  }
  // A BOM helps spreadsheet applications recognize Chinese text as UTF-8.
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

module.exports = { createItemCsv };
