// src/screens/LocationInputScreen.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseClient";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

// Helper to load Google Maps SDK
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const existingScript = document.querySelector("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps));
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";

    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps SDK loaded but window.google.maps is undefined"));
    };
    script.onerror = reject;

    document.head.appendChild(script);
  });
}

export default function LocationInputScreen({ onContinue }) {
  const navigate = useNavigate();

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);

  const [mapsReady, setMapsReady] = useState(false);

  const [originCoords, setOriginCoords] = useState(null);
  const [originAddress, setOriginAddress] = useState("");
  const [locError, setLocError] = useState("");

  const [destCoords, setDestCoords] = useState(null);
  const [destAddress, setDestAddress] = useState("");

  const [routeError, setRouteError] = useState("");
  const [routeReady, setRouteReady] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);

  // in-person vs virtual buddy
  const [buddyMode, setBuddyMode] = useState("inperson"); // "inperson" | "virtual"

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  const currentUserId = localStorage.getItem("ghs_user_id");

  /* 1. Load Google Maps + autocomplete */
  useEffect(() => {
    if (!apiKey) {
      setRouteError("Missing Google Maps API key.");
      return;
    }

    let cancelled = false;

    async function initMaps() {
      try {
        const gmaps = await loadGoogleMaps(apiKey);
        if (cancelled) return;

        mapRef.current = new gmaps.Map(mapDivRef.current, {
          center: { lat: 39.9526, lng: -75.1652 },
          zoom: 13,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        directionsServiceRef.current = new gmaps.DirectionsService();
        directionsRendererRef.current = new gmaps.DirectionsRenderer({
          map: mapRef.current,
          suppressMarkers: false,
        });

        // origin autocomplete
        if (originInputRef.current) {
          const ac = new gmaps.places.Autocomplete(originInputRef.current, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode"],
          });
          originAutocompleteRef.current = ac;
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            if (!place.geometry || !place.geometry.location) return;
            const loc = place.geometry.location;
            const coords = { lat: loc.lat(), lng: loc.lng() };
            setOriginCoords(coords);
            setOriginAddress(place.formatted_address || place.name || "");
            mapRef.current?.panTo(coords);
          });
        }

        // destination autocomplete
        if (destInputRef.current) {
          const ac = new gmaps.places.Autocomplete(destInputRef.current, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode"],
          });
          destAutocompleteRef.current = ac;
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            if (!place.geometry || !place.geometry.location) return;
            const loc = place.geometry.location;
            const coords = { lat: loc.lat(), lng: loc.lng() };
            setDestCoords(coords);
            setDestAddress(place.formatted_address || place.name || "");
          });
        }

        setMapsReady(true);
      } catch (err) {
        console.error("Error loading Google Maps:", err);
        if (!cancelled) setRouteError("Failed to load Google Maps.");
      }
    }

    initMaps();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  /* 2. Get current GPS origin */
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("Geolocation not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const coords = { lat: latitude, lng: longitude };
        setOriginCoords(coords);
        setLocError("");

        if (!window.google?.maps) return;

        try {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: coords }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              const addr = results[0].formatted_address;
              setOriginAddress(addr);

              if (originInputRef.current && !originInputRef.current.value) {
                originInputRef.current.value = addr;
              }

              if (mapRef.current) {
                mapRef.current.setCenter(coords);
                mapRef.current.setZoom(15);
              }
            } else {
              console.warn("Reverse geocode failed:", status);
            }
          });
        } catch (err) {
          console.error("Reverse geocoding error:", err);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocError(
          "Could not fetch your location. You can type a start address instead."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  /* 3. Bias autocomplete around origin */
  useEffect(() => {
    if (!originCoords || !window.google?.maps) return;
    const gmaps = window.google.maps;
    const circle = new gmaps.Circle({
      center: originCoords,
      radius: 5000,
    });
    const bounds = circle.getBounds();
    if (!bounds) return;

    originAutocompleteRef.current?.setBounds(bounds);
    destAutocompleteRef.current?.setBounds(bounds);
  }, [originCoords]);

  /* Helper: draw route only */
  const showRoute = () => {
    setRouteError("");
    setRouteReady(false);

    const originInputVal = originInputRef.current?.value.trim() || "";
    const destInputVal = destInputRef.current?.value.trim() || "";

    if (!destInputVal) {
      setRouteError("Please enter a destination.");
      return;
    }
    if (!originCoords && !originInputVal) {
      setRouteError("Please allow location or enter a starting address.");
      return;
    }
    if (
      !mapsReady ||
      !window.google?.maps ||
      !directionsServiceRef.current ||
      !directionsRendererRef.current
    ) {
      setRouteError("Map not ready yet. Please wait a moment.");
      return;
    }

    setIsRouting(true);

    const gmaps = window.google.maps;
    const originForRoute = originCoords || originInputVal;
    const destForRoute = destCoords || destInputVal;

    directionsServiceRef.current.route(
      {
        origin: originForRoute,
        destination: destForRoute,
        travelMode: gmaps.TravelMode.WALKING,
      },
      (result, status) => {
        setIsRouting(false);

        if (status !== "OK" || !result) {
          console.error("Directions request failed:", status);
          setRouteError("Could not compute a route between these points.");
          return;
        }

        directionsRendererRef.current.setDirections(result);
        const r = result.routes?.[0];
        if (r?.bounds && mapRef.current) {
          mapRef.current.fitBounds(r.bounds, 40);
        }

        const originText = originInputVal || originAddress || "";
        const destText = destAddress || destInputVal;

        onContinue?.({
          origin: { coords: originCoords || null, text: originText },
          destination: { coords: destCoords || null, text: destText },
          directions: result,
        });

        setRouteReady(true);
      }
    );
  };

  /* Helper: save trip + go to match screen */
  const createTripAndNavigate = async () => {
    setRouteError("");

    const originInputVal = originInputRef.current?.value.trim() || "";
    const destInputVal = destInputRef.current?.value.trim() || "";

    const originText = originInputVal || originAddress || "";
    const destText = destAddress || destInputVal;

    if (!destText) {
      setRouteError("Missing destination.");
      return;
    }

    setIsSavingTrip(true);

    try {
      const tripsCol = collection(db, "trips");
      const docRef = await addDoc(tripsCol, {
        userId: currentUserId,
        buddyMode,
        origin: {
          text: originText,
          lat: originCoords?.lat ?? null,
          lng: originCoords?.lng ?? null,
        },
        destination: {
          text: destText,
          lat: destCoords?.lat ?? null,
          lng: destCoords?.lng ?? null,
        },
        plannedStartTime: new Date().toISOString(),
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: "searching",
        activeMatchId: null,
        excludedUserIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate(`/match/${docRef.id}`);
    } catch (err) {
      console.error("Failed to create trip:", err);
      setRouteError("Trip save failed. Try again.");
    } finally {
      setIsSavingTrip(false);
    }
  };

  const handlePrimaryClick = (e) => {
    e.preventDefault();
    if (!routeReady) showRoute();
    else createTripAndNavigate();
  };

  const isBusy = isRouting || isSavingTrip;
  const buttonLabel = !routeReady
    ? isRouting
      ? "Calculating route..."
      : "Show my route"
    : isSavingTrip
    ? "Finding your buddy..."
    : "Find me a match";

  return (
    <div className="screen journey-screen">
      {/* top bar with back button */}
      <div className="journey-topbar">
        <button
          type="button"
          className="btn journey-back"
          onClick={() => navigate("/home")}
        >
          ← Home
        </button>
      </div>

      {/* header */}
      <header className="journey-header">
        <h1 className="journey-title">Start New Journey</h1>
      </header>

      <main className="journey-main">
        {/* MODE TOGGLE */}
        <section className="journey-mode">
          <div className="journey-mode-toggle">
            <button
              type="button"
              className={
                "journey-mode-btn" +
                (buddyMode === "inperson" ? " journey-mode-btn--active" : "")
              }
              onClick={() => setBuddyMode("inperson")}
            >
              In-person buddy
            </button>
            <button
              type="button"
              className={
                "journey-mode-btn" +
                (buddyMode === "virtual" ? " journey-mode-btn--active" : "")
              }
              onClick={() => setBuddyMode("virtual")}
            >
              Virtual buddy only
            </button>
          </div>

          <p className="journey-mode-help">
            {buddyMode === "inperson"
              ? "In-person buddies meet at a safe location and walk together."
              : "Virtual buddies take similar routes, but just text or call while you walk."}
          </p>
        </section>

        {/* FORM */}
        <form className="journey-form" onSubmit={handlePrimaryClick}>
          <section className="journey-field-group">
            <label className="journey-label" htmlFor="origin-input">
              Start
            </label>
            <input
              id="origin-input"
              ref={originInputRef}
              type="text"
              autoComplete="off"
              placeholder="Use current location or type an address"
              className="field-input journey-input"
            />

            {originAddress && (
              <div className="journey-helper">
                Using current location: <strong>{originAddress}</strong>
              </div>
            )}
            {locError && <div className="journey-error-small">{locError}</div>}
          </section>

          <section className="journey-field-group">
            <label className="journey-label" htmlFor="destination-input">
              Destination
            </label>
            <input
              id="destination-input"
              ref={destInputRef}
              type="text"
              autoComplete="off"
              placeholder="e.g. Home, Library, Train station"
              className="field-input journey-input"
            />
          </section>

          <button
            type="submit"
            className="btn btn--primary btn--full journey-primary-btn"
            disabled={isBusy}
          >
            {buttonLabel}
          </button>

          {routeError && <div className="error">{routeError}</div>}
        </form>

        {/* MAP SECTION */}
        <section className="journey-map-section">
          <div ref={mapDivRef} className="journey-map" />
        </section>

        {/* tiny buffer so the map never kisses the bottom */}
        <div style={{ height: 16 }} />
      </main>
    </div>
  );
}
