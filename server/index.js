// server/index.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const User = require("./models/User");
const Trip = require("./models/Trip");

const app = express();

// 🌐 Allow all origins in dev + JSON bodies
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "API is up" });
});

// --- Register (sign up) ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, password, agreedToGuidelines } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Missing fields." });
    }

    if (!agreedToGuidelines) {
      return res
        .status(400)
        .json({ message: "You must agree to the community guidelines." });
    }

    const existing = await User.findOne({ phone: phone.trim() });
    if (existing) {
      return res
        .status(409)
        .json({ message: "Phone number already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone: phone.trim(),
      passwordHash,
      agreedToGuidelines: true,
    });

    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error creating account." });
  }
});

// --- Login ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Phone and password are required." });
    }

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      return res
        .status(401)
        .json({ message: "Invalid phone or password." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ message: "Invalid phone or password." });
    }

    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error logging in." });
  }
});

app.post("/api/trips", async (req, res) => {
  try {
    const { userId, otherUserId, startLocation, endLocation, tripDate } =
      req.body;

    if (!userId || !otherUserId || !startLocation || !endLocation) {
      return res
        .status(400)
        .json({
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

    const trips = await Trip.find({ userId }).sort({ tripDate: -1 }); // newest first

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
