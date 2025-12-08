import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { db } from "../firebaseClient";
import { doc, setDoc } from "firebase/firestore";

const getDefaultApiUrl = () => {
  const host = window.location.hostname;
  // Always talk to the same host the frontend is served from, on port 4000
  return `http://${host}:4000`;
};

const API_URL = import.meta.env.VITE_API_URL || getDefaultApiUrl();

export default function LoginScreen({ initialMode = "signup" }) {
  const navigate = useNavigate();

  const isSignup = initialMode === "signup";

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState(""); // NEW
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [bio, setBio] = useState("");

  // flow state
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(""); // optional, to show success/msg

  // add "email" step into signup flow
  const signupSteps = ["name", "email", "phone", "password", "bio", "guidelines"];
  const loginSteps = ["phone", "password"];
  const steps = isSignup ? signupSteps : loginSteps;
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const handleSwitchMode = () => {
    if (loading) return;
    if (isSignup) {
      navigate("/login");
    } else {
      navigate("/signup");
    }
  };

  const submitToServer = async () => {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";

      const body = isSignup
        ? {
            name,
            email,
            phone,
            password,
            agreedToGuidelines: agreed,
            bio,
          }
        : { phone, password };

      const url = `${API_URL}${endpoint}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to sign in / sign up.");
      }

      if (isSignup) {
        // SIGNUP FLOW: do NOT log them in yet
        setInfo(
          "Account created. Check your email (and spam folder) to verify your address before logging in."
        );
        try {
          const userId = data.user._id;
          await setDoc(
            doc(db, "users", userId),
            {
              name: data.user.name,
              phone: data.user.phone,
              bio: data.user.bio || "",
              prefersVideoFirst: false,
              campusOnly: false,
              ratingAverage: data.user.ratingAverage ?? null,
              ratingCount: data.user.ratingCount ?? 0,
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (mirrorErr) {
          console.error(
            "[LoginScreen] Failed to mirror user profile to Firestore:",
            mirrorErr
          );
        }

        // Stay on this screen, show info + Back to Home button.
        // No auto-navigation here.
        setLoading(false);
        return;
      }

      // LOGIN FLOW: only here do we store token & go home
      localStorage.setItem("ghs_token", data.token);
      localStorage.setItem("ghs_name", data.user.name);
      localStorage.setItem("ghs_phone", data.user.phone);
      localStorage.setItem("ghs_user_id", data.user.id);
      if (data.user.email) {
        localStorage.setItem("ghs_email", data.user.email);
      }

      navigate("/home");
    } catch (err) {
      console.error("Auth error:", err);
      setError(
        err.message === "Failed to fetch"
          ? `Could not reach the server at ${API_URL}. Make sure it's running.`
          : err.message
      );
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    // If we've already created the account and are just showing
    // the "check your email" message, ignore further submits.
    if (isSignup && isLastStep && info) {
      return;
    }

    if (currentStep === "name" && !name.trim()) {
      setError("Please tell us your name.");
      return;
    }
    if (currentStep === "email" && !email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (currentStep === "phone" && !phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (currentStep === "password" && !password.trim()) {
      setError("Please enter a password.");
      return;
    }
    if (currentStep === "bio" && !bio.trim()) {
      setError("Please add a brief description about yourself.");
      return;
    }
    if (currentStep === "guidelines" && !agreed) {
      setError("Please agree to the guidelines to continue.");
      return;
    }

    if (isLastStep) {
      await submitToServer();
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (loading) return;

    if (stepIndex > 0) {
      setError("");
      setInfo("");
      setStepIndex((prev) => prev - 1);
    } else {
      navigate("/");
    }
  };

  const getQuestionTitle = () => {
    if (isSignup) {
      switch (currentStep) {
        case "name":
          return "Welcome to GetHomeSafe!";
        case "email":
          return "What’s your email address?";
        case "phone":
          return "What’s the best number to reach you?";
        case "password":
          return "Create a password to keep your account safe.";
        case "bio":
          return "Tell us about yourself.";
        case "guidelines":
          return "Last thing — our community guidelines.";
        default:
          return "";
      }
    } else {
      switch (currentStep) {
        case "phone":
          return "Welcome back.";
        case "password":
          return "Enter your password to continue.";
        default:
          return "";
      }
    }
  };

  const getQuestionSubtitle = () => {
    if (isSignup) {
      switch (currentStep) {
        case "name":
          return "We just need some basic information to get things started.";
        case "email":
          return "We’ll use this to verify your account and send important notices.";
        case "phone":
          return "We’ll send important updates about your trips here.";
        case "password":
          return "Pick something you’ll remember!";
        case "bio":
          return "This short description will be shown to people you match with, so they know who they’re walking with.";
        case "guidelines":
          return "We’re here to help each other get home safe. We need to be sure this is a safe space only!";
        default:
          return "";
      }
    } else {
      switch (currentStep) {
        case "phone":
          return "Type the phone number you used when you signed up.";
        case "password":
          return "Just to make sure it’s really you.";
        default:
          return "";
      }
    }
  };

  const primaryButtonLabel = () => {
    if (loading) {
      return isSignup ? "Saving..." : "Signing in...";
    }
    if (!isLastStep) {
      return "Continue";
    }
    return isSignup ? "Create my account" : "Log me in";
  };

  const totalSteps = steps.length;

  // Should we show the primary button?
  // Hide it when we've just created the account and are telling them
  // to check their email.
  const showPrimaryButton = !(
    isSignup &&
    isLastStep &&
    !!info
  );

  return (
    <div className="screen typeform-screen">
      <div className="tf-top-row">
        <button
          type="button"
          className="btn tf-back"
          onClick={handleBack}
          disabled={loading}
        >
          ← Back
        </button>

        <div className="tf-mode-label">
          {isSignup ? "Sign up" : "Log in"}
        </div>

        <button
          type="button"
          className="btn tf-switch-mode"
          onClick={handleSwitchMode}
          disabled={loading}
        >
          {isSignup ? "Already have an account?" : "Need an account?"}
        </button>
      </div>

      <div className="card card--padded tf-card">
        <h1 className="tf-title">{getQuestionTitle()}</h1>
        <p className="tf-subtitle">{getQuestionSubtitle()}</p>

        <form onSubmit={handleSubmit}>
          {currentStep === "name" && (
            <div className="field">
              <input
                autoFocus
                className="field-input tf-input-big"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My name is..."
              />
            </div>
          )}

          {currentStep === "email" && (
            <div className="field">
              <input
                autoFocus
                className="field-input tf-input-big"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          )}

          {currentStep === "phone" && (
            <div className="field">
              <input
                autoFocus
                className="field-input tf-input-big"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="555-123-4567"
              />
            </div>
          )}

          {currentStep === "password" && (
            <div className="field">
              <input
                autoFocus
                className="field-input tf-input-big"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "Create a password" : "Your password"}
              />
            </div>
          )}

          {currentStep === "bio" && (
            <div className="field">
              <textarea
                className="field-input tf-input-big"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="For example: 'hobbies: knitting' or 'likes: dogs & coffee'"
                rows={3}
              />
            </div>
          )}

          {currentStep === "guidelines" && isSignup && (
            <div className="guidelines">
              <p className="guidelines-title">Community guidelines</p>
              <ul className="guidelines-list">
                <li>Use GetHomeSafe only to walk or travel together.</li>
                <li>Respect boundaries and comfort levels.</li>
                <li>Call emergency services in unsafe situations.</li>
              </ul>
              <label className="guidelines-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to use this platform responsibly and help others get home safe.
                </span>
              </label>
            </div>
          )}

          {error && <div className="error">{error}</div>}
          {info && <div className="info">{info}</div>}

          <div className="tf-footer">
            <div className="tf-steps">
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <span
                  key={idx}
                  className={
                    "tf-dot" + (idx === stepIndex ? " tf-dot--active" : "")
                  }
                />
              ))}
            </div>

            {/* Primary continue/create button – hidden after signup success */}
            {showPrimaryButton && (
              <button
                type="submit"
                className="btn btn--primary tf-primary-btn"
                disabled={loading}
              >
                {primaryButtonLabel()}
              </button>
            )}

            {/* EXTRA BUTTON: only show after signup success */}
            {isSignup && isLastStep && info && (
              <button
                type="button"
                className="btn btn--ghost tf-secondary-btn"
                style={{ marginTop: "12px" }}
                onClick={() => navigate("/")}
              >
                Back to Home
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
