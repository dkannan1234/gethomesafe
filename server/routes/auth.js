// server/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const { sendEmail } = require("../utils/sendEmail");

const router = express.Router();

// ---------- Helpers ----------

// Normalize + validate US phone numbers
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) {
    return "+1" + digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+1" + digits.slice(1);
  }
  return null;
}

function isValidEmail(email) {
  if (!email) return false;
  const value = String(email).trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(value);
}

// Helper to generate JWT
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      phone: user.phone,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---------- POST /api/auth/register ----------
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, bio, agreedToGuidelines } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        message:
          "Please enter a valid US phone number (10 digits, e.g. 555-123-4567).",
      });
    }

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: "Email is already in use." });
    }

    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(400).json({ message: "Phone number is already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      agreedToGuidelines: !!agreedToGuidelines,
      bio: bio || "",
      emailVerified: false,
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const verifyLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    // Log the verification link so you can use it even if email sending fails
    console.log("[Auth] Verification link for", user.email, "=>", verifyLink);

    // Send verification email (using text + html just like your working test script)
    await sendEmail({
      to: normalizedEmail,
      subject: "Verify your email for GetHomeSafe",
      text: `Hi ${user.name},

    Thanks for signing up for GetHomeSafe.

    Please verify your email by opening this link:
    ${verifyLink}

    If you did not request this, you can ignore this email.`,
      html: `
        <p>Hi ${user.name},</p>
        <p>Thanks for signing up for <strong>GetHomeSafe</strong>.</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verifyLink}">Verify my email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });

    const token = generateToken(user);

    return res.status(201).json({
      message: "Account created. Please check your email to verify your address.",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        bio: user.bio,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error during registration." });
  }
});

// ---------- POST /api/auth/login ----------
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required." });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        message:
          "Please enter a valid US phone number (10 digits, e.g. 555-123-4567).",
      });
    }

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // If you want to FORCE email verification before login, uncomment:
    if (!user.emailVerified) {
          return res.status(403).json({
            message: "Please verify your email before logging in.",
          });
        }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        bio: user.bio,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error during login." });
  }
});

// ---------- GET /api/auth/verify-email?token=... ----------
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send("Missing token.");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationTokenExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).send("Invalid or expired verification link.");
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(
      `${frontendUrl}/email-verified?email=${encodeURIComponent(user.email)}`
    );
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).send("Server error verifying email.");
  }
});

module.exports = router;
