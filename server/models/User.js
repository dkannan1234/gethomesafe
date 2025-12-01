const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    agreedToGuidelines: { type: Boolean, default: false },

    // Short profile text that we show on the match card
    bio: { type: String, trim: true, default: "" },

    // Simple rating fields so we can show “5.0 ⭐ (23 reviews)”
    ratingAverage: { type: Number, default: null },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);