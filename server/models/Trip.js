const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    // the “owner” user of this trip
    userId: {
      type: String,
      ref: "User",
      required: true,
    },

    // the other user they traveled with
    otherUserId: {
      type: String,
      ref: "User",
      required: true,
    },

    // basic start / end location text
    startLocation: { type: String, required: true },
    endLocation: { type: String, required: true },

    // when the trip occurred
    tripDate: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trip", tripSchema);