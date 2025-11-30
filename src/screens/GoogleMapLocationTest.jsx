// src/screens/GoogleMapLocationTest.jsx
import { useEffect, useRef, useState } from "react";

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (window.google?.maps) {
      console.log("[GMaps] Already loaded");
      resolve(window.google.maps);
      return;
    }

    // Already loading
    const existingScript = document.querySelector("script[data-google-maps]");
    if (existingScript) {
      console.log("[GMaps] Script already on page, waiting for load");
      existingScript.addEventListener("load", () =>
        resolve(window.google.maps)
      );
      existingScript.addEventListener("error", reject);
      return;
    }

    console.log("[GMaps] Injecting script tag with key:", apiKey);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";

    script.onload = () => {
      console.log("[GMaps] script onload fired");
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(
          new Error(
            "Google Maps SDK loaded but window.google.maps is undefined"
          )
        );
      }
    };

    script.onerror = (e) => {
      console.error("[GMaps] script onerror", e);
      reject(e);
    };

    document.head.appendChild(script);
  });
}

export default function GoogleMapLocationTest() {
  const mapContainerRef = useRef(null); // the DIV we put the map in
  const mapRef = useRef(null);          // the map instance
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const watchIdRef = useRef(null);

  const [watching, setWatching] = useState(false);
  const [error, setError] = useState("");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  console.log("VITE_GOOGLE_MAPS_KEY in component:", apiKey);

  const onSuccess = (pos) => {
    setError("");

    const { latitude, longitude, accuracy } = pos.coords;
    const ll = { lat: latitude, lng: longitude };

    if (!mapRef.current || !window.google?.maps) return;

    // Marker
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: ll,
        map: mapRef.current,
      });
    } else {
      markerRef.current.setPosition(ll);
    }

    // Accuracy circle
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        map: mapRef.current,
        center: ll,
        radius: accuracy,
        fillColor: "#b83990",
        fillOpacity: 0.15,
        strokeColor: "#b83990",
        strokeOpacity: 0.6,
      });
    } else {
      circleRef.current.setCenter(ll);
      circleRef.current.setRadius(accuracy);
    }

    mapRef.current.panTo(ll);
  };

  const onError = (e) => {
    console.error("Geolocation error:", e);
    setError(e.message || "Location error.");
  };

  const stopWatch = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  };

  const startWatch = () => {
    if (watchIdRef.current) return;

    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
      }
    );

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
        const gmaps = await loadGoogleMaps(apiKey);
        if (cancelled) return;
        if (!mapContainerRef.current) {
          console.error("[GMaps] mapContainerRef is null");
          return;
        }

        console.log("[GMaps] Creating map on container:", mapContainerRef.current);
        mapRef.current = new gmaps.Map(mapContainerRef.current, {
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
    <div
      style={{
        height: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <h2 style={{ marginBottom: 12, color: "var(--pink)" }}>
        Live Location Test (Google Maps)
      </h2>

      <button
        onClick={watching ? stopWatch : startWatch}
        style={{
          padding: "12px 18px",
          borderRadius: 12,
          background: watching ? "#e52687" : "#f28dc0",
          color: watching ? "#fff" : "#e52687",
          border: "none",
          fontSize: 16,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        {watching ? "Stop" : "Get Location"}
      </button>

      <div
        ref={mapContainerRef}
        style={{
          flex: 1,
          borderRadius: 12,
          background: "#eee",
        }}
      />

      {error && (
        <div style={{ color: "#b00020", marginTop: 10, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
