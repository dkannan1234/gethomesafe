import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "leaflet-routing-machine"; // adds L.Routing

// Fix default marker icons in Vite
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
});

const styles = {
  page: { fontFamily: "var(--font-sans), sans-serif", maxWidth: 560, margin: "0 auto", padding: 16 },
  h2: { fontSize: "clamp(20px, 4vw, 28px)", margin: "12px 0" },
  card: { background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" },
  row: { display: "grid", gap: 8, marginTop: 8 },
  input: { padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 16 },
  btn: { padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 16, cursor: "pointer", minHeight: 44 },
  primary: { background: "var(--color-light-pink)", color: "#492642" },
  secondary: { background: "var(--color-dark-pink)", color: "#fff" },
  map: { width: "100%", height: "60vh", borderRadius: 12, overflow: "hidden", background: "#eef5ff" },
  meta: { fontSize: 14, color: "#333", marginTop: 8 }
};

// Simple geocoder (free) using OpenStreetMap Nominatim
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();
  if (!data?.length) throw new Error(`No results for "${query}"`);
  const { lat, lon } = data[0];
  return [parseFloat(lat), parseFloat(lon)];
}

export default function MappingTest() {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const routeRef = useRef(null);

  const [origin, setOrigin] = useState("30th Street Station, Philadelphia");
  const [destination, setDestination] = useState("Penn Museum, Philadelphia");
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const map = L.map(mapDivRef.current, {
      center: [39.9526, -75.1652],
      zoom: 13,
      zoomControl: true,
    });

    // OSM tiles (free)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    // Routing control — keep markers draggable, avoid adding new ones by clicking
    const routing = L.Routing.control({
      waypoints: [],
      routeWhileDragging: true,     // live updates while dragging markers
      draggableWaypoints: true,     // allow dragging the existing markers
      addWaypoints: false,          // but don't allow adding extras by clicking
      show: false,                  // hide the default big panel
      lineOptions: { addWaypoints: false },
      fitSelectedRoutes: false,     // we'll fit bounds ourselves after routing
    })
      .on("routesfound", (e) => {
        const route = e.routes?.[0];
        if (route) {
          const distanceMeters = route.summary.totalDistance;
          const timeSeconds = route.summary.totalTime;
          setMetrics({
            distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
            durationText: `${Math.round(timeSeconds / 60)} mins`,
            latencyMs: null,
          });
        }
      })
      .on("routingerror", (e) => {
        setError("Routing failed. Try different locations.");
        console.error(e?.error || e);
      })
      .addTo(map);

    mapRef.current = map;
    routeRef.current = routing;

    return () => {
      routing.remove();
      map.remove();
    };
  }, []);

  const drawRoute = async (e) => {
    e?.preventDefault?.();
    setError("");
    setMetrics(null);
    if (!mapRef.current || !routeRef.current) return;

    const t0 = performance.now();
    try {
      const [origLat, origLng] = await geocode(origin);
      const [destLat, destLng] = await geocode(destination);

      routeRef.current.setWaypoints([
        L.latLng(origLat, origLng),
        L.latLng(destLat, destLng),
      ]);

      // After the route appears, fit bounds and record latency
      setTimeout(() => {
        const route = routeRef.current._lastRoute; // internal but practical
        if (route?.bounds) mapRef.current.fitBounds(route.bounds, { padding: [30, 30] });
        const t1 = performance.now();
        setMetrics((m) => (m ? { ...m, latencyMs: Math.round(t1 - t0) } : m));
      }, 50);
    } catch (err) {
      console.error(err);
      setError(err.message || "Geocoding failed.");
    }
  };

  // auto draw once after init
  useEffect(() => {
    const id = setTimeout(() => {
      drawRoute();
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.page}>
      <h2 style={styles.h2}>Mapping Test (Leaflet + OpenStreetMap)</h2>

      <div style={{ ...styles.card, background: "#f8fbff" }}>
        <form onSubmit={drawRoute} style={styles.row}>
          <label>
            <div>Start</div>
            <input
              style={styles.input}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Enter start address"
              required
              inputMode="text"
            />
          </label>

          <label>
            <div>Destination</div>
            <input
              style={styles.input}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter destination"
              required
              inputMode="text"
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ ...styles.btn, ...styles.primary }}>Show Route</button>
          </div>

          <div style={{ fontSize: 13, color: "#555" }}>
            Tip: drag the start/end markers on the map to refine the route.
          </div>

          {metrics && (
            <div style={styles.meta}>
              <strong>Distance:</strong> {metrics.distanceText} &nbsp; • &nbsp;
              <strong>ETA:</strong> {metrics.durationText} &nbsp; • &nbsp;
              {metrics.latencyMs != null && (
                <>
                  <strong>Req→Render:</strong> {metrics.latencyMs} ms
                </>
              )}
            </div>
          )}
          {error && <div style={{ color: "#b00020", marginTop: 6 }}>{error}</div>}
        </form>
      </div>

      <div ref={mapDivRef} style={styles.map} aria-label="Route map" />
    </div>
  );
}