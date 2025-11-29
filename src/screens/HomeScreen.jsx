import { useNavigate } from "react-router-dom";

export default function HomeScreen() {
  const navigate = useNavigate();
  const name = localStorage.getItem("ghs_name") || "friend";

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Hi, {name} 👋</h1>
        <p className="screen-subtitle">
          Welcome to GetHomeSafe. Ready to start a new journey?
        </p>
      </header>

      <div className="card card--padded">
        <button
          className="btn btn--primary btn--full"
          onClick={() => navigate("/journey")}
        >
          Start a new journey
        </button>

        <div className="home-actions">
          <button
            className="btn btn--ghost"
            onClick={() => alert("Past trips coming soon ✨")}
          >
            View past trips
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => navigate("/messages")}
          >
            Open messages
          </button>
        </div>
      </div>
    </div>
  );
}
