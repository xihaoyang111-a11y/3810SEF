const mongoose = require("mongoose");

// Staff run the desk. Students may only look at items still waiting to be claimed.
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 20,
    },
    role: { type: String, enum: ["staff", "student"], default: "staff" },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
