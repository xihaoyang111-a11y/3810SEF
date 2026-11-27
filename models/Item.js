const mongoose = require("mongoose");
const { CATEGORIES, PLACES, CAMPUSES, STATUSES } = require("./itemRules");

// One document is one object handed in at the campus lost-property desk.
const itemSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]\d{6}$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, required: true, enum: CATEGORIES },
    place: { type: String, required: true, enum: PLACES },
    campus: { type: String, required: true, enum: CAMPUSES },
    status: { type: String, required: true, enum: STATUSES, default: "stored" },
    foundOn: { type: Date, required: true },
    spot: { type: String, default: "", maxlength: 80 },
    description: { type: String, default: "", maxlength: 280 },
    coverBytes: { type: Buffer, select: false },
    coverType: { type: String },
    loggedBy: { type: String, enum: ["Staff", "Student"], default: "Staff" },
    // Who handed it in through the web report form (username / student ID).
    // Older records have no value here, so the default keeps them readable.
    reportedBy: { type: String, trim: true, maxlength: 20, default: "Staff" },
    reporterContact: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { timestamps: true }
);

itemSchema.index({ status: 1, place: 1 });
itemSchema.index({ foundOn: -1 });
itemSchema.index({ loggedBy: 1 });

module.exports = mongoose.model("Item", itemSchema);
