const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // email for verification + uniqueness
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    phone: { type: String, required: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    agreedToGuidelines: { type: Boolean, default: false },

    // Short profile text that we show on the match card
    bio: { type: String, trim: true, default: "" },

    // Simple rating fields so we can show “5.0 ⭐ (23 reviews)”
    ratingAverage: { type: Number, default: null },
    ratingCount: { type: Number, default: 0 },

    // NEW: email verification fields
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
