// Rules for a lost-property record. Shared by the forms, the API, and the seed data.

const CATEGORIES = ["electronics", "wallet", "keys", "clothing", "books", "bottle", "idcard", "other"];
const PLACES = ["library", "canteen", "lecture", "gym", "gate", "classroom", "lounge", "lab"];
const CAMPUSES = ["MC", "JCC", "IOH"];
const STATUSES = ["stored", "claimed", "disposed"];

const CATEGORY_LABELS = {
  electronics: "Electronics",
  wallet: "Wallet",
  keys: "Keys",
  clothing: "Clothing",
  books: "Books",
  bottle: "Bottle",
  idcard: "ID card",
  other: "Other",
};

const PLACE_LABELS = {
  library: "Library",
  canteen: "Canteen",
  lecture: "Lecture theatre",
  gym: "Gym",
  gate: "Campus gate",
  classroom: "Classroom",
  lounge: "Student lounge",
  lab: "Computer lab",
};

const CAMPUS_LABELS = {
  MC: "MC · Main Campus",
  JCC: "JCC · Jockey Club Campus",
  IOH: "IOH · Jockey Club Institute of Healthcare",
};

const STATUS_LABELS = {
  stored: "Stored",
  claimed: "Claimed",
  disposed: "Cleared",
};

const CODE_RE = /^[A-Z]\d{6}$/;

function cleanText(value, max) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ").slice(0, max);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelOf(map, key) {
  return map[key] || key;
}

function toDayDate(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function toInputDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-HK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDayDate(toInputDate(date));
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseItemInput(body, mode) {
  const src = body || {};
  const errors = [];
  const data = {};
  const partial = mode === "patch";
  const want = (key) => !partial || hasOwn(src, key);

  if (want("name")) {
    const name = cleanText(src.name, 80);
    if (!name) errors.push("Item name is required.");
    else data.name = name;
  }

  if (want("category")) {
    const category = cleanText(src.category, 20);
    if (!CATEGORIES.includes(category)) errors.push("Choose a category.");
    else data.category = category;
  }

  if (want("place")) {
    const place = cleanText(src.place, 20);
    if (!PLACES.includes(place)) errors.push("Choose where it was found.");
    else data.place = place;
  }

  if (want("campus")) {
    const campus = cleanText(src.campus, 8).toUpperCase();
    if (!CAMPUSES.includes(campus)) errors.push("Choose the campus: MC, JCC, or IOH.");
    else data.campus = campus;
  }

  if (want("status")) {
    const status = cleanText(src.status, 20);
    if (!STATUSES.includes(status)) errors.push("Choose a status: stored, claimed, or disposed.");
    else data.status = status;
  }

  if (want("foundOn")) {
    const foundOn = toDayDate(src.foundOn);
    if (!foundOn) errors.push("Found date must look like YYYY-MM-DD.");
    else if (foundOn > endOfToday()) errors.push("Found date cannot be in the future.");
    else data.foundOn = foundOn;
  }

  if (want("spot")) data.spot = cleanText(src.spot, 80);
  if (want("description")) data.description = cleanText(src.description, 280);

  if (want("loggedBy")) {
    const who = cleanText(src.loggedBy, 20);
    if (!who && partial) {
      // A partial update can omit who handed the item in.
    } else if (who !== "Staff" && who !== "Student") {
      if (partial) errors.push("Logged by must be Staff or Student.");
      else data.loggedBy = "Staff";
    } else data.loggedBy = who;
  }

  if (partial && Object.keys(data).length === 0) errors.push("Provide at least one field to update.");
  return { data, errors };
}

function buildFilter(query) {
  const q = cleanText(query.q, 80);
  const category = cleanText(query.category, 20);
  const place = cleanText(query.place, 20);
  const campus = cleanText(query.campus, 8).toUpperCase();
  const status = cleanText(query.status, 20);
  const filter = {};

  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    filter.$or = [{ name: regex }, { description: regex }, { code: regex }];
  }
  if (CATEGORIES.includes(category)) filter.category = category;
  if (PLACES.includes(place)) filter.place = place;
  if (CAMPUSES.includes(campus)) filter.campus = campus;
  if (STATUSES.includes(status)) filter.status = status;

  return { filter, search: { q, category, place, campus, status } };
}

function presentItem(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    categoryLabel: labelOf(CATEGORY_LABELS, row.category),
    place: row.place,
    placeLabel: labelOf(PLACE_LABELS, row.place),
    campus: row.campus || "",
    campusLabel: labelOf(CAMPUS_LABELS, row.campus),
    status: row.status,
    statusLabel: labelOf(STATUS_LABELS, row.status),
    foundOn: row.foundOn ? toInputDate(row.foundOn) : "",
    foundLabel: row.foundOn ? formatDate(row.foundOn) : "",
    spot: row.spot || "",
    description: row.description || "",
    loggedBy: row.loggedBy || "",
    reportedBy: row.reportedBy || "Staff",
    reporterContact: row.reporterContact || "",
  };
}

// A student reporting a find. Reuses the normal item rules, then fixes the
// fields a student may not choose: it always starts on the shelf, and the
// shelf spot waits for staff to inspect it.
const PENDING_SPOT = "Pending Inspection";
const CONTACT_RE = /^[A-Za-z0-9._%+@\-\s()]*$/;

function parseReportInput(body) {
  const src = body || {};
  const { data, errors } = parseItemInput(
    {
      name: src.name,
      category: src.category,
      place: src.place,
      campus: src.campus,
      foundOn: src.foundOn,
      description: src.description,
      status: "stored",
      spot: PENDING_SPOT,
    },
    "create"
  );
  const contact = cleanText(src.reporterContact, 80);
  if (!CONTACT_RE.test(contact)) errors.push("Contact can only be an email address or a phone number.");
  else data.reporterContact = contact;
  return { data, errors };
}

function emptyReportValues() {
  return {
    name: "",
    category: "electronics",
    place: "library",
    campus: "MC",
    foundOn: toInputDate(new Date()),
    description: "",
    reporterContact: "",
  };
}

function emptyFormValues() {
  return {
    code: "",
    name: "",
    category: "electronics",
    place: "library",
    campus: "MC",
    status: "stored",
    foundOn: toInputDate(new Date()),
    spot: "",
    description: "",
    loggedBy: "Staff",
  };
}

module.exports = {
  CATEGORIES,
  PLACES,
  CAMPUSES,
  STATUSES,
  CATEGORY_LABELS,
  PLACE_LABELS,
  CAMPUS_LABELS,
  STATUS_LABELS,
  CODE_RE,
  cleanText,
  PENDING_SPOT,
  parseItemInput,
  parseReportInput,
  buildFilter,
  presentItem,
  emptyFormValues,
  emptyReportValues,
  daysAgo,
  labelOf,
};
