const test = require("node:test");
const assert = require("node:assert/strict");
const { createItemCsv } = require("../models/itemExport");

const HEADERS = [
  "Reference", "Item name", "Category", "Found at", "Campus", "Status",
  "Date found", "Shelf spot", "Description", "Logged by",
];

// Parse the downloaded representation independently of the export code. Requiring
// quoted fields and CRLF record separators also catches malformed CSV output.
function readCsv(csv) {
  assert.equal(csv[0], "\uFEFF", "CSV must begin with a UTF-8 BOM");
  const rows = [];
  let row = [];
  let index = 1;
  while (index < csv.length) {
    assert.equal(csv[index++], '"', "Every field must be quoted");
    let value = "";
    let closed = false;
    while (index < csv.length) {
      const character = csv[index++];
      if (character !== '"') {
        value += character;
      } else if (csv[index] === '"') {
        value += '"';
        index += 1;
      } else {
        closed = true;
        break;
      }
    }
    assert.ok(closed, "Quoted field must be closed");
    row.push(value);
    if (csv[index] === ",") {
      index += 1;
      assert.ok(index < csv.length, "A comma must be followed by a field");
    } else {
      assert.equal(csv.slice(index, index + 2), "\r\n", "Records must end with CRLF");
      index += 2;
      assert.equal(row.length, HEADERS.length, "Each row must have ten columns");
      rows.push(row);
      row = [];
    }
  }
  assert.deepEqual(row, [], "No partial record may remain");
  return rows;
}

function item(overrides = {}) {
  return {
    code: "K184206",
    name: "House keys",
    category: "keys",
    place: "library",
    campus: "MC",
    status: "stored",
    foundOn: new Date(2026, 10, 25, 12),
    spot: "Bin B3",
    description: "Red fob",
    loggedBy: "Staff",
    ...overrides,
  };
}

test("an empty result exports a valid header-only CSV with a BOM", () => {
  const csv = createItemCsv([]);
  assert.deepEqual(readCsv(csv), [HEADERS]);
  assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("columns use readable labels and the same local date as the desk", () => {
  assert.deepEqual(readCsv(createItemCsv([item({ status: "disposed" })])), [
    HEADERS,
    ["K184206", "House keys", "Keys", "Library", "MC · Main Campus", "Cleared",
      "2026-11-25", "Bin B3", "Red fob", "Staff"],
  ]);
});

test("commas, quotes, multiline descriptions and Chinese text round-trip", () => {
  const name = '黑色水樽, "Song"';
  const description = '第一行\r\n第二行\nEngraved "S", blue cap';
  const csv = createItemCsv([item({ name, description })]);
  const [, row] = readCsv(csv);
  assert.equal(row[1], name);
  assert.equal(row[8], description);
  assert.ok(csv.includes('"黑色水樽, ""Song"""'));
});

test("multiple records retain the supplied search-result order", () => {
  const rows = readCsv(createItemCsv([
    item({ code: "B000002", name: "Second", category: "books", campus: "JCC" }),
    item({ code: "K000001", name: "First", place: "lab", status: "claimed" }),
  ]));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(1).map((row) => row[0]), ["B000002", "K000001"]);
  assert.equal(rows[1][2], "Books");
  assert.equal(rows[1][4], "JCC · Jockey Club Campus");
  assert.equal(rows[2][3], "Computer lab");
  assert.equal(rows[2][5], "Claimed");
});

test("missing and null values are empty rather than undefined or null text", () => {
  const rows = readCsv(createItemCsv([
    {},
    { code: null, name: null, category: null, place: null, campus: null,
      status: null, foundOn: null, spot: null, description: null, loggedBy: null },
  ]));
  assert.deepEqual(rows[1], Array(10).fill(""));
  assert.deepEqual(rows[2], Array(10).fill(""));
});

test("formula starters and initial control characters are rendered as text", () => {
  const values = [
    "=1+1", "+1+1", "-1+1", "@SUM(A1:A2)",
    "  =1+1", "\u00a0+1+1", "\t=1+1", "\r-1+1", "\n@SUM(A1:A2)",
    "\tplain text", "\rplain text", "\nplain text",
  ];
  for (const value of values) {
    const [, row] = readCsv(createItemCsv([item({ name: value, description: value, spot: value })]));
    for (const column of [1, 7, 8]) {
      assert.equal(row[column], "'" + value, `Unsafe value ${JSON.stringify(value)} in column ${column}`);
    }
  }
});

test("ordinary text and existing apostrophes remain unchanged", () => {
  for (const value of ["Keys + ring", "Blue-green", "Price = unknown", "user@example.com", "  padded text", "'=1+1"]) {
    const [, row] = readCsv(createItemCsv([item({ name: value })]));
    assert.equal(row[1], value);
  }
});

test("only the declared columns are exported, without database or photo fields", () => {
  const csv = createItemCsv([item({
    _id: "INTERNAL_OBJECT_ID",
    __v: 42,
    passwordHash: "PRIVATE_PASSWORD_HASH",
    coverBytes: Buffer.from("PRIVATE_IMAGE_BYTES"),
    coverType: "PRIVATE_IMAGE_TYPE",
    createdAt: new Date(2000, 0, 1),
  })]);
  const rows = readCsv(csv);
  assert.deepEqual(rows[0], HEADERS);
  for (const marker of ["INTERNAL_OBJECT_ID", "PRIVATE_PASSWORD_HASH", "PRIVATE_IMAGE_BYTES", "PRIVATE_IMAGE_TYPE"]) {
    assert.ok(!csv.includes(marker), `${marker} must not be exported`);
  }
});

test("export does not mutate source records while neutralizing unsafe text", () => {
  const original = item({ name: "=1+1", description: 'A, "B"' });
  const before = structuredClone(original);
  Object.freeze(original);
  const records = Object.freeze([original]);
  createItemCsv(records);
  assert.deepEqual(original, before);
});

test("Mongoose-style documents and plain query objects produce the same rows", () => {
  const plain = item();
  const document = { toObject: () => ({ ...plain }) };
  assert.equal(createItemCsv([document]), createItemCsv([plain]));
});
