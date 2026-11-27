const bcrypt = require("bcryptjs");
const User = require("./User");
const Item = require("./Item");
const { withSampleCover } = require("./sampleCovers");
const { daysAgo } = require("./itemRules");

const DEMO_USERS = [
  { username: "admin", displayName: "Admin", password: "admin123", role: "staff" },
  { username: "s1385703", displayName: "s1385703", password: "test123", role: "student" },
];

function sampleItems() {
  return [
    { code: "E102481", name: "AirPods case", category: "electronics", place: "library", campus: "MC", status: "stored", foundOn: daysAgo(1), spot: "Bin A1", description: "White case only. No earbuds inside.", loggedBy: "Staff" },
    { code: "I330917", name: "Octopus card", category: "idcard", place: "canteen", campus: "JCC", status: "stored", foundOn: daysAgo(0), spot: "Drawer C", description: "Anonymous card. No name printed on it.", loggedBy: "Student" },
    { code: "K184206", name: "House keys", category: "keys", place: "gate", campus: "IOH", status: "stored", foundOn: daysAgo(2), spot: "Bin B2", description: "Three keys and a red fob.", loggedBy: "Staff" },
    { code: "C552014", name: "Black hoodie", category: "clothing", place: "gym", campus: "MC", status: "claimed", foundOn: daysAgo(6), spot: "Rack 1", description: "Size M. Owner described the tear on the cuff.", loggedBy: "Student" },
    { code: "E774390", name: "Casio calculator", category: "electronics", place: "lecture", campus: "JCC", status: "stored", foundOn: daysAgo(3), spot: "Bin A4", description: "fx-50FH. The name Alan is written on the back.", loggedBy: "Staff" },
    { code: "B220158", name: "Green water bottle", category: "bottle", place: "gym", campus: "IOH", status: "disposed", foundOn: daysAgo(21), spot: "", description: "Left past the 14-day hold and cleared.", loggedBy: "Student" },
    { code: "W661043", name: "Brown wallet", category: "wallet", place: "canteen", campus: "MC", status: "stored", foundOn: daysAgo(1), spot: "Safe", description: "Cash counted and logged. No ID inside.", loggedBy: "Staff" },
    { code: "I908332", name: "Student ID card", category: "idcard", place: "classroom", campus: "JCC", status: "claimed", foundOn: daysAgo(4), spot: "Drawer C", description: "Returned after the owner showed a second photo.", loggedBy: "Student" },
    { code: "O441270", name: "Blue umbrella", category: "other", place: "gate", campus: "IOH", status: "stored", foundOn: daysAgo(5), spot: "Bin B1", description: "Folding umbrella. Strap is broken.", loggedBy: "Staff" },
    { code: "B015884", name: "Paperback novel", category: "books", place: "library", campus: "MC", status: "stored", foundOn: daysAgo(8), spot: "Shelf D", description: "Klara and the Sun. A bookmark was left inside.", loggedBy: "Student" },
    { code: "E663901", name: "USB-C charger", category: "electronics", place: "lab", campus: "JCC", status: "stored", foundOn: daysAgo(2), spot: "Bin A2", description: "65W brick. No name on the cable.", loggedBy: "Staff" },
    { code: "O287615", name: "Silver hoop earring", category: "other", place: "lounge", campus: "IOH", status: "claimed", foundOn: daysAgo(9), spot: "Drawer A", description: "One hoop. Owner described the matching pair.", loggedBy: "Student" },
  ];
}

async function seedDatabase() {
  for (const demo of DEMO_USERS) {
    const existing = await User.findOne({ username: demo.username });
    if (!existing) {
      const passwordHash = await bcrypt.hash(demo.password, 10);
      await User.create({
        username: demo.username,
        displayName: demo.displayName,
        passwordHash,
        role: demo.role || "staff",
      });
    } else if (existing.role !== demo.role) {
      existing.role = demo.role;
      await existing.save();
    }
  }

  const count = await Item.countDocuments();
  if (count === 0) {
    await Item.insertMany(sampleItems().map(withSampleCover));
    console.log("Seeded an empty lost-property desk with sample items.");
  }
}

module.exports = { seedDatabase, DEMO_USERS };
