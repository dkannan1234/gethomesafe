
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

export default function StartScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen start-screen center-screen">
      <img src={logo} alt="GetHomeSafe" className="start-logo-img" />

      <div className="start-button-group">
        <button
          className="btn btn--primary btn--full"
          onClick={() => navigate("/signup")}
        >
          Sign up
        </button>

        <button
          className="btn btn--primary btn--full"
          onClick={() => navigate("/login")}
        >
          Log in
        </button>
      </div>
    </div>
  );
}
