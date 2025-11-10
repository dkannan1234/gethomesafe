import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../styles.css";

// Vite + Leaflet marker fix
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconRetinaUrl: marker2x, iconUrl: marker, shadowUrl: shadow });

export default function LocationMapTest() {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const watchedOnceRef = useRef(false);
  const watchIdRef = useRef(null);

  const [pos, setPos] = useState(null);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState("");

  const brandAccent =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--brand-accent").trim() || "#b83990"
      : "#b83990";

  const ui = {
    page: { fontFamily: "var(--font-sans)", maxWidth: 560, margin: "0 auto", padding: 16 },
    h2: { fontSize: "clamp(20px, 4vw, 28px)", margin: "12px 0" },
    card: { background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" },
    row: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
    btn: { padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 16, cursor: "pointer", minHeight: 44 },
    primary:   { background: "var(--color-light-pink)", color: "#492642" },
    warn:      { background: "var(--color-dark-purple)", color: "#fff" },
    meta: { fontSize: 14, color: "#333" },
    error: { color: "#b00020", marginTop: 8 },
    dl: { display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 6, columnGap: 12, marginTop: 10, fontSize: 15 },
    dt: { color: "#555" },
    code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", background: "#f6f8fa", padding: "2px 6px", borderRadius: 6 }
  };

  // init map
  useEffect(() => {
    const map = L.map(mapDivRef.current, { center: [39.9526, -75.1652], zoom: 13 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);
    mapRef.current = map;
    return () => map.remove();
  }, []);

  const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 };

  const onSuccess = (p) => {
    setError("");
    const lat = p.coords.latitude;
    const lng = p.coords.longitude;
    const acc = p.coords.accuracy ?? null;

    setPos({
      lat, lng,
      accuracy: acc,
      heading: p.coords.heading ?? null,
      speed: p.coords.speed ?? null,
      ts: new Date(p.timestamp)
    });

    if (!mapRef.current) return;
    const ll = L.latLng(lat, lng);

    if (!markerRef.current) {
      markerRef.current = L.marker(ll).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(ll);
    }

    if (acc != null) {
      if (!circleRef.current) {
        circleRef.current = L.circle(ll, { radius: acc, color: brandAccent, fillColor: brandAccent, fillOpacity: 0.15 });
        circleRef.current.addTo(mapRef.current);
      } else {
        circleRef.current.setLatLng(ll).setRadius(acc);
      }
    }

    if (!watchedOnceRef.current) {
      const bounds = circleRef.current ? circleRef.current.getBounds() : L.latLngBounds([ll, ll]);
      mapRef.current.fitBounds(bounds.pad(0.5));
      watchedOnceRef.current = true;
    } else {
      mapRef.current.panTo(ll, { animate: true, duration: 0.4 });
    }
  };

  const onError = (e) => {
    const msg =
      e.code === e.PERMISSION_DENIED ? "Permission denied."
      : e.code === e.POSITION_UNAVAILABLE ? "Position unavailable."
      : e.code === e.TIMEOUT ? "Location timed out."
      : "Unknown location error.";
    setError(msg);
  };

  const startWatch = () => {
    if (!("geolocation" in navigator)) return setError("Geolocation not supported in this browser.");
    if (watchIdRef.current != null) return; // already watching
    const id = navigator.geolocation.watchPosition(onSuccess, onError, options);
    watchIdRef.current = id;
    setWatching(true);
  };

  const stopWatch = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  };

  const toggleWatch = () => (watching ? stopWatch() : startWatch());

  useEffect(() => () => stopWatch(), []); // cleanup on unmount

  return (
    <div style={ui.page}>
      <h2 style={ui.h2}>Location Test (Live GPS + Map)</h2>

      <div style={ui.card}>
        <div style={ui.row}>
          {/* Single button: starts live location, toggles to Stop */}
          <button
            style={{ ...ui.btn, ...(watching ? ui.warn : ui.primary) }}
            onClick={toggleWatch}
          >
            {watching ? "Stop" : "Get Location"}
          </button>
        </div>

        <div
          ref={mapDivRef}
          style={{ width: "100%", height: "50vh", borderRadius: 12, marginTop: 12, overflow: "hidden", background: "#eef5ff" }}
        />

        <div style={ui.dl}>
          <div style={ui.dt}>Time</div>
          <div>{pos ? <span style={ui.code}>{pos.ts.toLocaleTimeString()}</span> : "—"}</div>

          <div style={ui.dt}>Latitude</div>
          <div>{pos ? <span style={ui.code}>{pos.lat.toFixed(6)}</span> : "—"}</div>

          <div style={ui.dt}>Longitude</div>
          <div>{pos ? <span style={ui.code}>{pos.lng.toFixed(6)}</span> : "—"}</div>

          <div style={ui.dt}>Accuracy (m)</div>
          <div>{pos?.accuracy != null ? <span style={ui.code}>{Math.round(pos.accuracy)}</span> : "—"}</div>

          <div style={ui.dt}>Heading</div>
          <div>{pos?.heading != null ? <span style={ui.code}>{Math.round(pos.heading)}°</span> : "—"}</div>

          <div style={ui.dt}>Speed</div>
          <div>{pos?.speed != null ? <span style={ui.code}>{pos.speed.toFixed(2)} m/s</span> : "—"}</div>
        </div>

        {error && <div style={ui.error}>{error}</div>}
      </div>
    </div>
  );
}
