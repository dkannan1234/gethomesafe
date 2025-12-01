// src/screens/HomeScreen.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import welcomeImage from "../assets/welcome-page.png";

export default function HomeScreen() {
  const navigate = useNavigate();
  const fullName = localStorage.getItem("ghs_name") || "friend";
  const firstName = fullName.split(" ")[0];

  const [city, setCity] = useState("");
  const [timeString, setTimeString] = useState("");

  // simple daily tips
  const travelTips = [
    "Share your route with a friend before you leave.",
    "Stick to well-lit streets when you can.",
    "Keep one ear free if you’re walking with headphones.",
    "If something feels off, trust that feeling and change your route.",
    "Text someone when you’ve arrived home safely.",
  ];
  const [tip] = useState(
    () => travelTips[Math.floor(Math.random() * travelTips.length)]
  );

  // live-ish time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    };

    updateTime();
    const id = setInterval(updateTime, 60_000);
    return () => clearInterval(id);
  }, []);

  // city lookup
  useEffect(() => {
    const saved = localStorage.getItem("ghs_last_city");
    if (saved) setCity(saved);

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            { location: { lat: latitude, lng: longitude } },
            (results, status) => {
              if (status === "OK" && results && results[0]) {
                const components = results[0].address_components || [];
                const locality =
                  components.find((c) => c.types.includes("locality")) ||
                  components.find((c) => c.types.includes("sublocality")) ||
                  components.find((c) =>
                    c.types.includes("administrative_area_level_1")
                  );

                if (locality?.long_name) {
                  setCity(locality.long_name);
                  localStorage.setItem("ghs_last_city", locality.long_name);
                }
              }
            }
          );
        }
      },
      () => {
        const fallback = localStorage.getItem("ghs_last_city");
        if (fallback) setCity(fallback);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  const metaLine =
    city && timeString
      ? `You’re in ${city} · ${timeString}`
      : city
      ? `You’re in ${city}`
      : timeString
      ? `It’s ${timeString}`
      : "";

  const handleLogout = () => {
    localStorage.removeItem("ghs_token");
    localStorage.removeItem("ghs_name");
    localStorage.removeItem("ghs_phone");
    localStorage.removeItem("ghs_user_id");
    navigate("/login", { replace: true });
  };

  return (
    <div className="screen home-screen">
      {/* small top bar */}
      <header className="home-topbar">
        <button type="button" className="btn home-topbar-logout" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main className="home-main">
        {/* HERO */}
        <section className="home-hero">
          <img
            src={welcomeImage}
            alt="Welcome"
            className="home-hero-logo"
          />
          <p className="home-hero-welcome">Welcome, {firstName}.</p>
          {metaLine && <p className="home-hero-meta">{metaLine}</p>}
          <p className="home-hero-question">
            Need someone to walk or ride home with?
          </p>
        </section>

        {/* PRIMARY CTA CARD */}
        <section className="card home-cta-card">
          <button
            className="btn btn--primary btn--full home-cta-button"
            onClick={() => navigate("/journey")}
          >
            Start a journey & find a buddy
          </button>
          <p className="home-cta-caption">
            Tell us your route and we’ll look for people on a similar path.
          </p>
        </section>

        {/* TWO LITTLE INFO CARDS */}
        <section className="home-info-grid">
          <article className="card home-info-card">
            <p className="home-info-title">Today’s safety tip</p>
            <p className="home-info-text">{tip}</p>
          </article>

          <article className="card home-info-card">
            <p className="home-info-title">How it works</p>
            <ol className="home-how-list">
              <li>Share where you’re starting and going.</li>
              <li>We suggest a safe meeting point with someone nearby.</li>
              <li>Walk together — or stay on a call.</li>
            </ol>
          </article>
        </section>

        {/* RECENT JOURNEYS */}
        <section className="card home-recent-card">
          <p className="home-recent-title">Past journeys</p>
          <p className="home-recent-empty">No journeys yet.</p>
        </section>
      </main>
    </div>
  );
}
