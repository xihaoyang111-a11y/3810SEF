const fs = require("node:fs");
const path = require("node:path");

const covers = new Map([
  ["B015884", "book.webp"],
  ["B220158", "bottle.webp"],
  ["C552014", "hoodie.webp"],
  ["I330917", "transit-card.webp"],
  ["I908332", "student-id.webp"],
  ["K184206", "keys.webp"],
  ["O441270", "umbrella.webp"],
  ["O287615", "earring.webp"],
  ["W661043", "wallet.webp"],
  ["E102481", "airpods.webp"],
  ["E663901", "charger.webp"],
  ["E774390", "calculator.webp"],
]);

function withSampleCover(item) {
  const filename = covers.get(item.code);
  if (!filename) return item;
  return {
    ...item,
    coverType: "image/webp",
    coverBytes: fs.readFileSync(path.join(__dirname, "sample-photos", filename)),
  };
}

module.exports = { withSampleCover };
