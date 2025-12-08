const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const { sendEmail } = require("../utils/sendEmail");
const { getFrontendBaseUrl } = require("../utils/getFrontendBaseUrl");

const router = express.Router();

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

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, bio, agreedToGuidelines } = req.body;

    // Basic validation
    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, phone, and password are required." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email." });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        message:
          "Please enter a valid US phone number (10 digits, e.g. 555-123-4567).",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await User.findOne({
      $or: [{ phone: normalizedPhone }, { email: normalizedEmail }],
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "An account with that phone or email already exists." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create the user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      bio: (bio || "").trim(),
      agreedToGuidelines: !!agreedToGuidelines,
      emailVerified: false,
      // add other optional fields if your schema has them
      // ratingAverage: null,
      // ratingCount: 0,
    });

    // Generate email verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    user.emailVerificationTokenHash = tokenHash;
    user.emailVerificationTokenExpiresAt = expiresAt;
    await user.save();

    // Build verification link using FRONTEND_URL
    const frontendBase = getFrontendBaseUrl();
    // Derive backend base from same host but port 4000
    const url = new URL(frontendBase);
    url.port = process.env.PORT || "4000";

    const backendBase = url.origin;
    const verifyLink = `${backendBase}/api/auth/verify-email?token=${rawToken}`;

    console.log("[Auth] Verification link for", user.email, "=>", verifyLink);

    // Send verification email
    await sendEmail({
      to: user.email,
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

    // Respond to frontend (do NOT auto-login)
    return res.status(201).json({
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

// GET /api/auth/verify-email?token=... 
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

    const frontendBase = getFrontendBaseUrl();
    return res.redirect(
      `${frontendBase}/email-verified?email=${encodeURIComponent(user.email)}`
    );
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).send("Server error verifying email.");
  }
});

// POST /api/auth/login 
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    console.log("[Login] raw phone:", phone);

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Phone and password are required." });
    }

    const normalizedPhone = normalizePhone(phone);
    console.log("[Login] normalized phone:", normalizedPhone);

    if (!normalizedPhone) {
      return res.status(400).json({
        message:
          "Please enter a valid US phone number (10 digits, e.g. 555-123-4567).",
      });
    }

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      console.log("[Login] No user for phone", normalizedPhone);
      return res.status(400).json({ message: "Invalid credentials." });
    }

    console.log(
      "[Login] Found user:",
      user._id.toString(),
      "|",
      user.name,
      "|",
      user.email,
      "|",
      user.phone
    );

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      console.log("[Login] Password mismatch for user", user._id.toString());
      return res.status(400).json({ message: "Invalid credentials." });
    }

    if (!user.emailVerified) {
      console.log("[Login] Email not verified for", user.email);
      return res.status(403).json({
        message: "Please verify your email before logging in.",
      });
    }

    const token = generateToken(user);

    console.log("[Login] Success for", user._id.toString());

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

module.exports = router;

