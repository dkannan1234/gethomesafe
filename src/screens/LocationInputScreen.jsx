import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseClient";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";



// Plain helper: NO hooks here
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

export default function LocationInputScreen({ onContinue }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const navigate = useNavigate();

  const currentUserId = localStorage.getItem("ghs_user_id");

  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);

  const [mapsReady, setMapsReady] = useState(false);

  const [originCoords, setOriginCoords] = useState(null); // {lat, lng}
  const [originAddress, setOriginAddress] = useState(""); // human-readable
  const [locError, setLocError] = useState("");

  const [destCoords, setDestCoords] = useState(null);
  const [destAddress, setDestAddress] = useState("");

  const [routeError, setRouteError] = useState("");

  // NEW: route + button state
  const [routeReady, setRouteReady] = useState(false);   // has route been drawn?
  const [isRouting, setIsRouting] = useState(false);     // doing directions call
  const [isSavingTrip, setIsSavingTrip] = useState(false); // writing to Firestore

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

  // 1) Load Google Maps JS and initialize map + autocomplete
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

        // Map
        mapRef.current = new gmaps.Map(mapDivRef.current, {
          center: { lat: 39.9526, lng: -75.1652 },
          zoom: 13,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        // Directions
        directionsServiceRef.current = new gmaps.DirectionsService();
        directionsRendererRef.current = new gmaps.DirectionsRenderer({
          map: mapRef.current,
          suppressMarkers: false,
        });

        // Autocomplete on origin input
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

        // Autocomplete on destination input
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

  // 2) Get current GPS position and reverse geocode to a human address
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("Geolocation not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const coords = { lat: latitude, lng: longitude };
        setOriginCoords(coords);
        setLocError("");

        // Only reverse geocode once Maps is ready
        if (!window.google?.maps) return;

        try {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: coords }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              const addr = results[0].formatted_address;
              setOriginAddress(addr);

              // Prefill the origin input if empty
              if (originInputRef.current && !originInputRef.current.value) {
                originInputRef.current.value = addr;
              }

              // Center map on user
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
        setLocError("Could not fetch current location. You can enter a start address manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // 3) Bias autocomplete to user's area once we know origin coords
  useEffect(() => {
    if (!originCoords || !window.google?.maps) return;
    const gmaps = window.google.maps;
    const circle = new gmaps.Circle({
      center: originCoords,
      radius: 5000, // 5km radius bias
    });

    const bounds = circle.getBounds();
    if (!bounds) return;

    if (originAutocompleteRef.current) {
      originAutocompleteRef.current.setBounds(bounds);
    }
    if (destAutocompleteRef.current) {
      destAutocompleteRef.current.setBounds(bounds);
    }
  }, [originCoords]);

  // Helper: compute + draw the route
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
    const destinationForRoute = destCoords || destInputVal;

    directionsServiceRef.current.route(
      {
        origin: originForRoute,
        destination: destinationForRoute,
        travelMode: gmaps.TravelMode.WALKING,
      },
      (result, status) => {
        setIsRouting(false);

        if (status !== "OK" || !result) {
          console.error("Directions request failed:", status);
          setRouteError("Could not compute route between these points.");
          return;
        }

        // Draw route on map
        directionsRendererRef.current.setDirections(result);
        if (
          result.routes &&
          result.routes[0] &&
          result.routes[0].bounds &&
          mapRef.current
        ) {
          mapRef.current.fitBounds(result.routes[0].bounds);
        }

        // Lift data up if parent cares
        const originText = originInputVal || originAddress || "";
        const destText = destAddress || destInputVal;

        if (onContinue) {
          onContinue({
            origin: {
              coords: originCoords || null,
              text: originText,
            },
            destination: {
              coords: destCoords || null,
              text: destText,
            },
            directions: result,
          });
        }

        setRouteReady(true);
      }
    );
  };

  // Helper: create trip + navigate to match screen
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
        plannedEndTime: new Date(
          Date.now() + 60 * 60 * 1000
        ).toISOString(),
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

  // Single button: first click = show route, second click = create trip
  const handlePrimaryClick = (e) => {
    e.preventDefault();

    if (!routeReady) {
      // First phase: just draw the route
      showRoute();
    } else {
      // Second phase: route already visible → save + match
      createTripAndNavigate();
    }
  };

  const isBusy = isRouting || isSavingTrip;

  const buttonLabel = !routeReady
    ? isRouting
      ? "Calculating route..."
      : "Show route"
    : isSavingTrip
    ? "Finding your match..."
    : "Find me a match";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: "linear-gradient(180deg, #f5d7f2, #fefefe)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "24px 16px 40px",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <h1
            style={{
              fontSize: "clamp(24px, 5vw, 28px)",
              margin: 0,
              color: "#492642",
            }}
          >
            Start a new journey
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#4b3b48",
            }}
          >
            Enter your route so we can show your path and then find people heading the same way.
          </p>
        </header>

        <form
          onSubmit={handlePrimaryClick}
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            marginBottom: 16,
          }}
        >
          {/* START / ORIGIN */}
          <section style={{ marginBottom: 16 }}>
            <label
              htmlFor="origin-input"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#59455a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Start
            </label>
            <input
              id="origin-input"
              ref={originInputRef}
              type="text"
              placeholder="Use current location or type an address"
              autoComplete="off"
              style={{
                width: "100%",
                fontSize: 15,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e0d1e5",
                outline: "none",
              }}
            />
            {/* Show the resolved current address explicitly */}
            {originAddress && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b5b70" }}>
                Using current location:{" "}
                <span style={{ fontWeight: 500 }}>{originAddress}</span>
              </div>
            )}
            {locError && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b00020" }}>
                {locError}
              </div>
            )}
          </section>

          {/* DESTINATION */}
          <section style={{ marginBottom: 16 }}>
            <label
              htmlFor="destination-input"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#59455a",
                display: "block",
                marginBottom: 6,
              }}
            >
              Destination
            </label>
            <input
              id="destination-input"
              ref={destInputRef}
              type="text"
              placeholder="Where do you want to end up?"
              autoComplete="off"
              style={{
                width: "100%",
                fontSize: 15,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e0d1e5",
                outline: "none",
              }}
            />
          </section>

          {/* SINGLE SMART BUTTON */}
          <button
            type="submit"
            disabled={isBusy}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 999,
              border: "none",
              fontSize: 16,
              fontWeight: 600,
              cursor: !isBusy ? "pointer" : "default",
              background: !routeReady
                ? !isBusy
                  ? "#492642"
                  : "#cbb6d0"
                : !isBusy
                ? "#f5d7f2"
                : "#e0d1e5",
              color: !routeReady ? "#fff" : "#492642",
              transition: "background 0.15s ease",
            }}
          >
            {buttonLabel}
          </button>

          {routeError && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>
              {routeError}
            </div>
          )}
        </form>

        {/* MAP + EXPLANATORY TEXT */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          }}
        >
          <div
            ref={mapDivRef}
            style={{
              width: "100%",
              height: "50vh",
              borderRadius: 14,
              background: "#eee",
              marginBottom: 10,
              overflow: "hidden",
            }}
          />
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: "#7a6a80",
              margin: 0,
            }}
          >
            First we’ll show your walking route from where you are. Once it looks right, tap
            “Find me a match” to look for people heading along a similar path.
          </p>
        </div>
      </div>
    </div>
  );
}
