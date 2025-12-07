// server/index.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./models/User");
const Trip = require("./models/Trip");
const authRoutes = require("./routes/auth");

const app = express();

// 🌐 Allow all origins in dev + JSON bodies
app.use(cors());
app.use(express.json());

// Mount /api/auth routes from routes/auth.js
app.use("/api/auth", authRoutes);

/**
 * Fetch a user profile by Mongo _id
 */
app.get("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ message: `User ${id} not found` });
    }

    res.json({
      id: user._id.toString(),
      name: user.name,
      phone: user.phone,
      email: user.email,
      bio: user.bio || "",
      ratingAverage: user.ratingAverage ?? null,
      ratingCount: user.ratingCount ?? 0,
      emailVerified: user.emailVerified,
    });
  } catch (err) {
    console.error("GET /api/users/:id error:", err);
    res.status(500).json({ message: "Server error fetching user." });
  }
});

// Submit a rating for a user (1–5 stars)
app.post("/api/users/:id/rate", async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: `User ${id} not found` });
    }

    const currentAvg = user.ratingAverage ?? 0;
    const currentCount = user.ratingCount ?? 0;

    const newCount = currentCount + 1;
    const newAvg = ((currentAvg * currentCount) + numericRating) / newCount;

    user.ratingAverage = newAvg;
    user.ratingCount = newCount;
    await user.save();

    res.json({
      id: user._id.toString(),
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
    });
  } catch (err) {
    console.error("POST /api/users/:id/rate error:", err);
    res.status(500).json({ message: "Server error submitting rating." });
  }
});

// --- Create trip record (server-side history) ---
app.post("/api/trips", async (req, res) => {
  try {
    const { userId, otherUserId, startLocation, endLocation, tripDate } =
      req.body;

    if (!userId || !otherUserId || !startLocation || !endLocation) {
      return res.status(400).json({
        message:
          "userId, otherUserId, startLocation, and endLocation are required.",
      });
    }

    const trip = await Trip.create({
      userId,
      otherUserId,
      startLocation,
      endLocation,
      tripDate: tripDate ? new Date(tripDate) : new Date(),
    });

    res.status(201).json(trip);
  } catch (err) {
    console.error("Error creating trip:", err);
    res.status(500).json({ message: "Failed to create trip." });
  }
});

// --- Get all trips for a user (most recent first) ---
app.get("/api/trips/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const trips = await Trip.find({ userId }).sort({ tripDate: -1 });

    res.json(trips);
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ message: "Failed to fetch trips." });
  }
});

// --- Boot server AFTER Mongo connects ---
const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`✅ Auth server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });
