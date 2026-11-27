/*
 * Lost Desk — campus lost-and-found.
 *
 * Web pages (login required): list / search, log a found item, open it,
 * update the record, mark it claimed or cleared, delete a bad entry, log out.
 * Students can also report an item they found; staff check it in.
 * Staff get an analytics page built with MongoDB aggregation.
 * REST API (no login, as the brief allows): GET, POST, PUT, DELETE under /api/items.
 *
 * Database, first match wins:
 *   1. MONGODB_URI environment variable
 *   2. atlas.local.json in this folder
 *   3. local MongoDB, then an in-memory demo instance
 */

const fs = require("fs");
const { randomBytes } = require("node:crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const Item = require("./models/Item");
const { seedDatabase } = require("./models/seed");
const baseline = require("./models/baseline.json");
const { withSampleCover } = require("./models/sampleCovers");
const { readCoverUpload } = require("./models/coverUpload");
const {
  CATEGORIES,
  PLACES,
  CAMPUSES,
  STATUSES,
  CATEGORY_LABELS,
  PLACE_LABELS,
  CAMPUS_LABELS,
  STATUS_LABELS,
  CODE_RE,
  PENDING_SPOT,
  cleanText,
  parseItemInput,
  parseReportInput,
  buildFilter,
  presentItem,
  emptyFormValues,
  emptyReportValues,
  labelOf,
} = require("./models/itemRules");

const PORT = process.env.PORT || 8099;
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.locals.CATEGORIES = CATEGORIES;
app.locals.PLACES = PLACES;
app.locals.CAMPUSES = CAMPUSES;
app.locals.STATUSES = STATUSES;
app.locals.categoryLabel = (key) => labelOf(CATEGORY_LABELS, key);
app.locals.placeLabel = (key) => labelOf(PLACE_LABELS, key);
app.locals.campusLabel = (key) => labelOf(CAMPUS_LABELS, key);
app.locals.statusLabel = (key) => labelOf(STATUS_LABELS, key);
app.locals.desk = {
  place: "Student Union Activity Room",
  placeZh: "學生會活動室",
  building: "G/F, Campus Centre",
  hours: "Monday to Friday, 10:00–18:00",
  email: "hkmulostdesk@gmail.com",
  phone: "5406 4218",
};

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || "";
  delete req.session.flash;
  next();
});

function setFlash(req, message) {
  req.session.flash = message;
}

function isStudent(req) {
  return req.session.user && req.session.user.role === "student";
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/login");
}

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (!isStudent(req)) return next();
  setFlash(req, "That page is for desk staff only.");
  return res.redirect("/desk");
}

// Reporting a find is the student's way in. Staff already have the item in
// hand, so they use Log item, which lets them set the status and shelf spot.
function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (isStudent(req)) return next();
  setFlash(req, "Staff log found items here with Log item.");
  return res.redirect("/desk/new");
}

const STUDENT_ID_RE = /^s\d{7}$/;

function passwordRuleOk(password) {
  const letters = (String(password).match(/[A-Za-z]/g) || []).length;
  const digits = (String(password).match(/\d/g) || []).length;
  return letters >= 1 && digits >= 3;
}

function loginView(res, status, error, restored) {
  return res.status(status).render("login", {
    title: "Sign in",
    error: error || "",
    restored: Boolean(restored),
  });
}

function viewItem(doc, student) {
  const view = presentItem(doc);
  view.hasCover = Boolean(doc.coverType);
  view.needsCheckIn = doc.status === "stored" && doc.spot === PENDING_SPOT;
  if (student) {
    view.spot = "";
    view.reporterContact = "";
  }
  return view;
}

// The REST API needs no login, so it never returns a reporter's phone or email.
function apiItem(doc) {
  const view = presentItem(doc);
  delete view.reporterContact;
  return view;
}

function signIn(req, res, next, user) {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      role: user.role || "staff",
    };
    return req.session.save(() => res.redirect("/desk"));
  });
}

function readConfigUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const file = path.join(__dirname, "atlas.local.json");
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed.MONGODB_URI) return parsed.MONGODB_URI;
    } catch (err) {
      console.error("Could not read atlas.local.json");
    }
  }
  return null;
}

async function uniqueCode(category) {
  const letterMatch = String(category || "").match(/[A-Za-z]/);
  const letter = letterMatch ? letterMatch[0].toUpperCase() : "X";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const digits = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    const code = `${letter}${digits}`;
    if (CODE_RE.test(code) && !(await Item.exists({ code }))) return code;
  }
  const error = new Error("Could not assign a reference number");
  error.status = 500;
  throw error;
}

function tally(rows) {
  return rows.reduce(
    (stats, row) => {
      stats.total += 1;
      stats[row.status] += 1;
      return stats;
    },
    { total: 0, stored: 0, claimed: 0, disposed: 0 }
  );
}

// Every number on the analytics page is computed inside MongoDB with
// aggregation pipelines. Node never loads the item documents themselves.
async function buildAnalytics() {
  const [hotspotRows, categoryRows, statusRows, studentRows, pendingRows] = await Promise.all([
    // 1. Campus hotspots: where things get lost most.
    Item.aggregate([
      { $group: { _id: "$place", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 },
    ]),
    // 2. Category distribution.
    Item.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    // 3. Status breakdown, used for the claim (return-to-owner) rate.
    Item.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    // 4. Student contribution: items handed in by students.
    Item.aggregate([{ $match: { loggedBy: "Student" } }, { $count: "count" }]),
    // 5. Student reports still waiting for staff to inspect and shelve.
    Item.aggregate([{ $match: { status: "stored", spot: PENDING_SPOT } }, { $count: "count" }]),
  ]);

  const statusSummary = { stored: 0, claimed: 0, disposed: 0 };
  statusRows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(statusSummary, row._id)) statusSummary[row._id] = row.count;
  });
  const totalItems = statusRows.reduce((sum, row) => sum + row.count, 0);
  const percentOf = (count) => (totalItems > 0 ? Math.round((count / totalItems) * 1000) / 10 : 0);

  return {
    totalItems,
    claimRatePercent: percentOf(statusSummary.claimed),
    studentReports: studentRows.length ? studentRows[0].count : 0,
    pendingInspection: pendingRows.length ? pendingRows[0].count : 0,
    statusSummary,
    campusHotspots: hotspotRows.map((row) => ({
      place: row._id,
      label: labelOf(PLACE_LABELS, row._id),
      count: row.count,
      percent: percentOf(row.count),
    })),
    categoryBreakdown: categoryRows.map((row) => ({
      category: row._id,
      label: labelOf(CATEGORY_LABELS, row._id),
      count: row.count,
      percent: percentOf(row.count),
    })),
  };
}

function reportView(res, status, error, values) {
  return res.status(status).render("report", {
    title: "Report a found item",
    error: error || "",
    values: { ...emptyReportValues(), ...values },
  });
}

async function connectDatabase() {
  mongoose.set("strictQuery", true);
  const uri = readConfigUri();
  if (uri) {
    await mongoose.connect(uri);
    console.log("MongoDB connected from configuration");
    return "uri";
  }

  const localUri = "mongodb://127.0.0.1:27017/lostdesk";
  try {
    await mongoose.connect(localUri, { serverSelectionTimeoutMS: 1200 });
    console.log("MongoDB connected at local lostdesk database");
    return "local";
  } catch (err) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    console.log("No local mongod. Starting an in-memory MongoDB for this demo...");
    const { MongoMemoryServer } = require("mongodb-memory-server");
    app.locals.memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(app.locals.memoryServer.getUri(), { dbName: "lostdesk" });
    console.log("In-memory MongoDB is ready (data resets when the server stops).");
    return "memory";
  }
}

app.get("/", (req, res) => {
  res.redirect(req.session.user ? "/desk" : "/login");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/desk");
  return loginView(res, 200, "", req.query.restored === "1");
});

app.post("/login", async (req, res, next) => {
  try {
    const username = cleanText(req.body.username, 20).toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ username }).select("+passwordHash");
    if (!user) return loginView(res, 401, "No account uses that username.");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return loginView(res, 401, "Password is not right.");
    return signIn(req, res, next, user);
  } catch (err) {
    return next(err);
  }
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/desk");
  res.render("register", { title: "Sign up", error: "", values: { username: "" } });
});

app.post("/register", async (req, res, next) => {
  try {
    const username = cleanText(req.body.username, 20).toLowerCase();
    const password = String(req.body.password || "");
    const confirm = String(req.body.confirm || "");
    const values = { username };
    const fail = (status, error) => res.status(status).render("register", { title: "Sign up", error, values });

    if (!STUDENT_ID_RE.test(username)) return fail(400, "Student ID must look like s1234567.");
    if (!passwordRuleOk(password)) return fail(400, "Password needs at least one letter and at least three numbers, such as test123.");
    if (password !== confirm) return fail(400, "The two passwords do not match.");

    await User.create({
      username,
      displayName: username,
      role: "student",
      passwordHash: await bcrypt.hash(password, 10),
    });
    setFlash(req, "Account created. Sign in to see what is waiting.");
    return res.redirect("/login");
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).render("register", {
        title: "Sign up",
        error: "That student ID is already registered.",
        values: { username: cleanText(req.body.username, 20).toLowerCase() },
      });
    }
    return next(err);
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

// View personal profile
app.get("/profile", requireLogin, async (req, res, next) => {
  try {
    const profile = await User.findById(req.session.user.id);

    if (!profile) {
      return res.redirect("/desk");
    }

    return res.render("profile", {
      title: "My Profile",
      profile: profile,
      error: ""
    });
  } catch (err) {
    return next(err);
  }
});

// Update personal profile
app.post("/profile/update", requireLogin, async (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || "").trim();
    const email = String(req.body.email || "").trim();
    const phone = String(req.body.phone || "").trim();

    if (!displayName || displayName.length > 40 ||
        email.length > 100 || phone.length > 20) {
      setFlash(req, "Invalid profile information.");
      return res.redirect("/profile");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFlash(req, "Invalid email address.");
      return res.redirect("/profile");
    }

    const profile = await User.findByIdAndUpdate(
      req.session.user.id,
      { displayName, email, phone },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.redirect("/desk");
    }

    req.session.user.displayName = profile.displayName;

    setFlash(req, "Profile updated successfully.");

    return res.redirect("/profile");
  } catch (err) {
    return next(err);
  }
});

// Change password
app.post("/profile/password", requireLogin, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    const user = await User.findById(req.session.user.id)
      .select("+passwordHash");

    if (!user) {
      return res.redirect("/login");
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!ok) {
      setFlash(req, "Current password is incorrect.");
      return res.redirect("/profile");
    }

    if (!passwordRuleOk(newPassword) ||
        Buffer.byteLength(newPassword, "utf8") > 72) {
      setFlash(req, "Invalid new password.");
      return res.redirect("/profile");
    }

    if (newPassword !== confirmPassword) {
      setFlash(req, "New passwords do not match.");
      return res.redirect("/profile");
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    setFlash(req, "Password changed successfully.");
    return res.redirect("/profile");

  } catch (err) {
    return next(err);
  }
});

app.post("/reset", async (req, res, next) => {
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];
  if (!loopback.includes(mongoose.connection.host) || !loopback.includes(req.ip)) {
    return res.sendStatus(404);
  }
  try {
    await Promise.all([User.deleteMany({}), Item.deleteMany({})]);
    await User.insertMany(baseline.users);
    await Item.insertMany(baseline.items.map((item) => withSampleCover({ ...item, foundOn: new Date(item.foundOn) })));
    return req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login?restored=1");
    });
  } catch (err) {
    return next(err);
  }
});

app.get("/desk", requireLogin, async (req, res, next) => {
  try {
    const student = isStudent(req);
    const query = student ? { ...req.query, status: "stored" } : req.query;
    const { filter, search } = buildFilter(query);
    // A student report stays off the waiting list until staff have the item
    // at the desk and give it a real shelf spot.
    const visible = student ? { spot: { $ne: PENDING_SPOT } } : {};
    Object.assign(filter, visible);
    const [allDocs, matchedDocs] = await Promise.all([
      Item.find(visible).select("status spot").lean(),
      Item.find(filter).sort({ foundOn: -1, name: 1 }),
    ]);
    const items = matchedDocs.map((doc) => viewItem(doc, student));
    const stats = tally(allDocs);
    stats.pending = allDocs.filter((doc) => doc.status === "stored" && doc.spot === PENDING_SPOT).length;
    res.render("list", { title: student ? "Waiting" : "Desk", items, stats, search, showing: items.length, student });
  } catch (err) {
    return next(err);
  }
});

app.get("/desk/new", requireStaff, (req, res) => {
  res.render("edit", {
    title: "Log item",
    mode: "create",
    action: "/desk",
    error: "",
    values: emptyFormValues(),
  });
});

app.post("/desk", requireStaff, readCoverUpload, async (req, res, next) => {
  try {
    const { data, errors } = parseItemInput(req.body, "create");
    if (req.coverError) errors.unshift(req.coverError);
    if (errors.length) {
      return res.status(400).render("edit", {
        title: "Log item",
        mode: "create",
        action: "/desk",
        error: errors[0],
        values: { ...emptyFormValues(), ...req.body },
      });
    }
    data.code = await uniqueCode(data.category);
    await Item.create({ ...data, ...req.cover });
    setFlash(req, `${data.name} is logged as ${data.code}.`);
    return res.redirect("/desk");
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).render("edit", {
        title: "Log item",
        mode: "create",
        action: "/desk",
        error: "Could not give this item a free reference number. Press Save record again.",
        values: { ...emptyFormValues(), ...req.body },
      });
    }
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// Student "Report a found item". Students only. They can only set what they
// saw: status is always stored and the shelf spot waits for staff to check
// the item in. These routes sit above /desk/:code so "report" is not read as
// a tag code.
// ---------------------------------------------------------------------------
app.get("/desk/report", requireStudent, (req, res) => {
  reportView(res, 200, "", {});
});

app.post("/desk/report", requireStudent, async (req, res, next) => {
  try {
    const { data, errors } = parseReportInput(req.body);
    if (errors.length) return reportView(res, 400, errors[0], req.body);

    data.code = await uniqueCode(data.category);
    data.loggedBy = "Student";
    data.reportedBy = req.session.user.username;
    const created = await Item.create(data);

    setFlash(
      req,
      `Thank you. ${created.name} is logged as ${created.code}. Please bring it to ${app.locals.desk.place}. It appears on the waiting list once staff have checked it in.`
    );
    return res.redirect("/desk");
  } catch (err) {
    if (err && err.name === "ValidationError") return reportView(res, 400, "Check the form and try again.", req.body);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// Analytics: MongoDB aggregation pipelines, shown as a page and as JSON.
// ---------------------------------------------------------------------------
app.get("/desk/analytics", requireStaff, async (req, res, next) => {
  try {
    const stats = await buildAnalytics();
    return res.render("analytics", { title: "Analytics", stats });
  } catch (err) {
    return next(err);
  }
});

// curl -s http://localhost:8099/api/analytics
app.get("/api/analytics", async (req, res, next) => {
  try {
    const stats = await buildAnalytics();
    return res.json({ generatedAt: new Date().toISOString(), ...stats });
  } catch (err) {
    return next(err);
  }
});

app.get("/desk/:code/cover", requireLogin, async (req, res, next) => {
  try {
    const filter = { code: req.params.code.toUpperCase() };
    if (isStudent(req)) {
      filter.status = "stored";
      filter.spot = { $ne: PENDING_SPOT };
    }
    const item = await Item.findOne(filter).select("coverType +coverBytes");
    if (!item?.coverBytes || !item.coverType) return res.sendStatus(404);
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    return res.type(item.coverType).send(item.coverBytes);
  } catch (err) {
    return next(err);
  }
});

app.get("/desk/:code", requireLogin, async (req, res, next) => {
  try {
    const item = await Item.findOne({ code: req.params.code.toUpperCase() });
    if (!item) {
      return res.status(404).render("message", {
        title: "Not found",
        heading: "That tag is not on the desk",
        detail: "It may have been deleted. Go back and search again.",
      });
    }
    if (isStudent(req) && item.status !== "stored") {
      setFlash(req, "That item is no longer waiting to be claimed.");
      return res.redirect("/desk");
    }
    if (isStudent(req) && item.spot === PENDING_SPOT) {
      setFlash(req, "That item has not been checked in at the desk yet.");
      return res.redirect("/desk");
    }
    return res.render("details", { title: item.name, item: viewItem(item, isStudent(req)), student: isStudent(req) });
  } catch (err) {
    return next(err);
  }
});

app.get("/desk/:code/edit", requireStaff, async (req, res, next) => {
  try {
    const item = await Item.findOne({ code: req.params.code.toUpperCase() });
    if (!item) return res.redirect("/desk");
    const view = viewItem(item, false);
    return res.render("edit", {
      title: `${view.needsCheckIn ? "Check in" : "Edit"} ${view.name}`,
      mode: "edit",
      action: `/desk/${view.code}/update`,
      error: "",
      values: view,
    });
  } catch (err) {
    return next(err);
  }
});

app.post("/desk/:code/update", requireStaff, readCoverUpload, async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const existing = await Item.findOne({ code });
    if (!existing) return res.redirect("/desk");
    const view = viewItem(existing, false);
    const { data, errors } = parseItemInput(req.body, "create");
    if (view.needsCheckIn && (!data.spot || data.spot.toLowerCase() === PENDING_SPOT.toLowerCase())) {
      errors.unshift("Enter the actual shelf location to confirm check-in.");
    }
    if (req.coverError) errors.unshift(req.coverError);
    if (errors.length) {
      return res.status(400).render("edit", {
        title: `${view.needsCheckIn ? "Check in" : "Edit"} ${existing.name}`,
        mode: "edit",
        action: `/desk/${code}/update`,
        error: errors[0],
        values: { ...view, ...req.body, code, hasCover: view.hasCover, needsCheckIn: view.needsCheckIn },
      });
    }
    const update = { $set: { ...data, ...req.cover } };
    if (!req.cover && req.body.removeCover === "1") {
      update.$unset = { coverBytes: 1, coverType: 1 };
    }
    await Item.updateOne({ code }, update);
    setFlash(req, view.needsCheckIn && data.status === "stored"
      ? `${data.name} was checked in and is now visible to students.`
      : `${data.name} was updated.`);
    return res.redirect(`/desk/${code}`);
  } catch (err) {
    return next(err);
  }
});

app.post("/desk/:code/status", requireStaff, async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const status = cleanText(req.body.status, 20);
    if (!STATUSES.includes(status)) return res.redirect(`/desk/${code}`);
    const existing = await Item.findOne({ code });
    if (!existing) return res.redirect("/desk");
    existing.status = status;
    await existing.save();
    const word = status === "claimed" ? "marked claimed" : status === "disposed" ? "cleared from the shelf" : "put back on the shelf";
    setFlash(req, `${existing.name} was ${word}.`);
    return res.redirect(`/desk/${code}`);
  } catch (err) {
    return next(err);
  }
});

app.post("/desk/:code/delete", requireStaff, async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const existing = await Item.findOne({ code });
    if (!existing) return res.redirect("/desk");
    await Item.deleteOne({ code });
    setFlash(req, `${existing.name} (${code}) was removed.`);
    return res.redirect("/desk");
  } catch (err) {
    return next(err);
  }
});

// READ many, with the same filters as the desk page.
// curl -s "http://localhost:8099/api/items?category=electronics&status=stored"
app.get("/api/items", async (req, res, next) => {
  try {
    const { filter } = buildFilter(req.query);
    const docs = await Item.find(filter).sort({ foundOn: -1, name: 1 });
    return res.json(docs.map(apiItem));
  } catch (err) {
    return next(err);
  }
});

// curl -s http://localhost:8099/api/items/K184206
app.get("/api/items/:code", async (req, res, next) => {
  try {
    const item = await Item.findOne({ code: req.params.code.toUpperCase() });
    if (!item) return res.status(404).json({ error: "No item with that tag code." });
    return res.json(apiItem(item));
  } catch (err) {
    return next(err);
  }
});

// curl -s -X POST http://localhost:8099/api/items -H "Content-Type: application/json" -d "{\"name\":\"Black cap\",\"category\":\"clothing\",\"place\":\"library\",\"campus\":\"MC\",\"status\":\"stored\",\"foundOn\":\"2026-11-05\",\"spot\":\"Bin B3\"}"
app.post("/api/items", async (req, res, next) => {
  try {
    const { data, errors } = parseItemInput(req.body, "create");
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    data.code = await uniqueCode(data.category);
    const created = await Item.create(data);
    return res.status(201).json(apiItem(created));
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: "That tag code is already used." });
    return next(err);
  }
});

// curl -s -X PUT http://localhost:8099/api/items/C482910 -H "Content-Type: application/json" -d "{\"status\":\"claimed\",\"description\":\"Owner collected it at the desk\"}"
app.put("/api/items/:code", async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const existing = await Item.findOne({ code });
    if (!existing) return res.status(404).json({ error: "No item with that tag code." });
    const { data, errors } = parseItemInput(req.body, "patch");
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    Object.assign(existing, data);
    await existing.save();
    return res.json(apiItem(existing));
  } catch (err) {
    return next(err);
  }
});

// curl -s -X DELETE http://localhost:8099/api/items/C482910
app.delete("/api/items/:code", async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const existing = await Item.findOne({ code });
    if (!existing) return res.status(404).json({ error: "No item with that tag code." });
    await Item.deleteOne({ code });
    return res.json({ deleted: true, code, name: existing.name });
  } catch (err) {
    return next(err);
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "No such API route." });
  return res.status(404).render("message", {
    title: "Not found",
    heading: "That page is not on the desk",
    detail: `${req.path} is not a Lost Desk page.`,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed" || req.path.startsWith("/api/")) {
    const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
    const error = err.type === "entity.parse.failed" ? "Request body is not valid JSON." : "Server error.";
    return res.status(status).json({ error });
  }
  return res.status(500).render("message", {
    title: "Server error",
    heading: "The desk hit a problem",
    detail: "Try the page again. If it keeps failing, check the server log.",
  });
});

async function start() {
  await connectDatabase();
  await seedDatabase();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Lost Desk listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Lost Desk failed to start.");
  console.error(err.name || "Error");
  process.exit(1);
});
