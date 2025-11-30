// src/screens/HomeScreen.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function HomeScreen() {
  const navigate = useNavigate();
  const name = localStorage.getItem("ghs_name") || "friend";

  const [city, setCity] = useState("");
  const [timeString, setTimeString] = useState("");

  // live-ish time (updates every minute)
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

  // try to figure out city (using geolocation + Google Maps if available)
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
        // if user blocks location, just use whatever we had before (if anything)
        const fallback = localStorage.getItem("ghs_last_city");
        if (fallback) setCity(fallback);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  const locationLine = city
    ? `You’re in ${city}.`
    : "You’re in your area.";
  const timeLine = timeString ? `It’s ${timeString} right now.` : "";

  return (
    <div className="screen home-screen">
      <header className="home-hero">
        <p className="home-greeting">Hi, {name}</p>

        <h1 className="home-title">
          {locationLine}
          <br />
          <span className="home-time">{timeLine}</span>
        </h1>

        <p className="home-question">
          Do you want to find a buddy to get home with?
        </p>
      </header>

      <main className="home-main">
        <div className="card card--padded home-primary-card">
          <button
            className="btn btn--primary btn--full"
            onClick={() => navigate("/journey")}
          >
            Start a journey & find a buddy
          </button>

          <div className="home-how">
            <p className="home-how-title">How GetHomeSafe works</p>
            <ol className="home-how-list">
              <li>Tell us where you’re starting and where you’re going.</li>
              <li>We suggest a safe meeting point with someone nearby.</li>
              <li>
                Walk together or stay on a call while you both head home.
              </li>
            </ol>
          </div>
        </div>

        <div className="home-secondary-actions">
          <button
            className="btn btn--ghost"
            onClick={() => alert("Past journeys coming soon")}
          >
            Past journeys
          </button>

          <button
            className="btn btn--ghost"
            onClick={() => navigate("/messages")}
          >
            Messages
          </button>
        </div>
      </main>
    </div>
  );
}
