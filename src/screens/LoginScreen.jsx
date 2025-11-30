// src/screens/LoginScreen.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function LoginScreen({ initialMode = "signup" }) {
  const navigate = useNavigate();

  // mode is fixed by which route we came from
  const isSignup = initialMode === "signup";

  // form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);

  // flow state
  const [stepIndex, setStepIndex] = useState(0); // 0,1,2,...
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // define the steps for each mode
  const signupSteps = ["name", "phone", "password", "guidelines"];
  const loginSteps = ["phone", "password"];
  const steps = isSignup ? signupSteps : loginSteps;
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  //  API submit 
  const submitToServer = async () => {
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";

      const body = isSignup
        ? { name, phone, password, agreedToGuidelines: agreed }
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
      // store token + user
      localStorage.setItem("ghs_token", data.token);
      localStorage.setItem("ghs_name", data.user.name);
      localStorage.setItem("ghs_phone", data.user.phone);
      localStorage.setItem("ghs_user_id", data.user.id); 

      navigate("/home");
    } catch (err) {
      console.error("Auth error:", err);
      setError(
        err.message === "Failed to fetch"
          ? `Could not reach the server at ${API_URL}. Make sure it's running.`
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // form submit — enter / click continue
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // per-step validation
    if (currentStep === "name" && !name.trim()) {
      setError("Please tell us your name.");
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
    if (stepIndex === 0 || loading) return;
    setError("");
    setStepIndex((prev) => prev - 1);
  };

  // ----- step-specific copy -----
  const getQuestionTitle = () => {
    if (isSignup) {
      switch (currentStep) {
        case "name":
          return "Welcome to GetHomeSafe!";
        case "phone":
          return "What’s the best number to reach you?";
        case "password":
          return "Create a password to keep your account safe.";
        case "guidelines":
          return "Last thing — our community guidelines.";
        default:
          return "";
      }
    } else {
      // login copy
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
        case "phone":
          return "We’ll send important updates about your trips here.";
        case "password":
          return "Pick something you’ll remember!";
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

  return (
    <div className="screen typeform-screen">
      {/* Top row with Back + mode label */}
      <div className="tf-top-row">
        {stepIndex > 0 && !loading && (
          <button
            type="button"
            className="btn tf-back"
            onClick={handleBack}
          >
            ← Back
          </button>
        )}
        <div className="tf-mode-label">
          {isSignup ? "Sign up" : "Log in"}
        </div>
      </div>

      {/* Card with single question */}
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
                placeholder={
                  isSignup ? "Create a password" : "Your password"
                }
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
                  I agree to use this platform responsibly and help others
                  get home safe.
                </span>
              </label>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div className="tf-footer">
            {/* progress dots */}
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

            <button
              type="submit"
              className="btn btn--primary tf-primary-btn"
              disabled={loading}
            >
              {primaryButtonLabel()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
