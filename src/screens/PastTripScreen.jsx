import { useEffect, useState } from "react";
import { fetchTripsForUser } from "../services/tripService";

export default function PastTripScreen() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId = localStorage.getItem("ghs_user_id");
    console.log(userId);

    if (!userId) {
      setError("No user ID found. Please log in again.");
      setLoading(false);
      return;
    }

    async function loadTrips() {
      try {
        const data = await fetchTripsForUser(userId);
        setTrips(data); // server already returns newest → oldest
      } catch (err) {
        console.error("[PastTripScreen] Failed to load trips:", err);
        setError(err.message || "Could not load past trips.");
      } finally {
        setLoading(false);
      }
    }

    loadTrips();
  }, []);

  return (
    <div className="screen past-trips-screen">
      <header className="screen-header">
        <h1 className="screen-title">Past trips</h1>
        <p className="screen-subtitle">
          Here’s a history of trips you’ve taken with other users.
        </p>
      </header>

      {loading && <p>Loading trips…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && trips.length === 0 && (
        <p>You don’t have any trips saved yet.</p>
      )}

      <ul className="trip-list">
        {trips.map((trip) => (
          <li key={trip._id} className="trip-list-item">
            <div className="trip-main">
              <span className="trip-locations">
                {trip.startLocation} → {trip.endLocation}
              </span>
            </div>
            <div className="trip-meta">
              <span className="trip-date">
                {new Date(trip.tripDate).toLocaleString()}
              </span>
              <span className="trip-with">
                With user: {trip.otherUserId}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}