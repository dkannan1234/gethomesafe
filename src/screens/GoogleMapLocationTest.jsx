import { useEffect, useRef, useState } from "react";

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    // Already loading
    const existingScript = document.querySelector("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps));
      existingScript.addEventListener("error", reject);
      return;
    }

    // Create script tag with key FROM PARAM
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps SDK loaded but window.google.maps is undefined"));
      }
    };

    script.onerror = (e) => reject(e);

    document.head.appendChild(script);
  });
}


export default function GoogleMapLocationTest() {
  const mapRef = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const circle = useRef(null);
  const watchId = useRef(null);

  const [watching, setWatching] = useState(false);
  const [error, setError] = useState("");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  console.log("VITE_GOOGLE_MAPS_KEY in component:", apiKey);

  const onSuccess = (pos) => {
    setError("");

    const { latitude, longitude, accuracy } = pos.coords;
    const ll = { lat: latitude, lng: longitude };

    if (!map.current || !window.google?.maps) return;

    // Marker
    if (!marker.current) {
      marker.current = new window.google.maps.Marker({
        position: ll,
        map: map.current,
      });
    } else {
      marker.current.setPosition(ll);
    }

    // Accuracy circle
    if (!circle.current) {
      circle.current = new window.google.maps.Circle({
        map: map.current,
        center: ll,
        radius: accuracy,
        fillColor: "#b83990",
        fillOpacity: 0.15,
        strokeColor: "#b83990",
        strokeOpacity: 0.6,
      });
    } else {
      circle.current.setCenter(ll);
      circle.current.setRadius(accuracy);
    }

    map.current.panTo(ll);
  };

  const onError = (e) => {
    console.error("Geolocation error:", e);
    setError(e.message || "Location error.");
  };

  const stopWatch = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWatching(false);
  };

  const startWatch = () => {
    if (watchId.current) return;

    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
    });

    setWatching(true);
  };

  useEffect(() => {
    if (!apiKey) {
      console.error("VITE_GOOGLE_MAPS_KEY is missing");
      setError("Missing Google Maps API key.");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        await loadGoogleMaps(apiKey);

        if (!mapRef.current || cancelled) return;

        map.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 39.9526, lng: -75.1652 },
          zoom: 14,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        console.log("Google Maps initialized (manual script load)");
      } catch (e) {
        console.error("Error loading Google Maps:", e);
        if (!cancelled) setError("Failed to load Google Maps.");
      }
    }

    init();

    return () => {
      cancelled = true;
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Live Location Test (Google Maps)</h2>

      <button
        onClick={watching ? stopWatch : startWatch}
        style={{
          padding: "12px 18px",
          borderRadius: 12,
          background: watching ? "#492642" : "#f5d7f2",
          color: watching ? "#fff" : "#492642",
          border: "none",
          fontSize: 16,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        {watching ? "Stop" : "Get Location"}
      </button>

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "60vh",
          borderRadius: 12,
          background: "#eee",
        }}
      />

      {error && (
        <div style={{ color: "#b00020", marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}
