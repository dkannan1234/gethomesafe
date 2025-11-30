// src/screens/LocationInputScreen.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseClient";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

// ---- Google Maps loader (same pattern as the working test) ----
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      console.log("[LocationInput] Google Maps already loaded");
      resolve(window.google.maps);
      return;
    }

    const existingScript = document.querySelector("script[data-google-maps]");
    if (existingScript) {
      console.log("[LocationInput] Waiting on existing Maps script");
      existingScript.addEventListener("load", () =>
        resolve(window.google.maps)
      );
      existingScript.addEventListener("error", reject);
      return;
    }

    console.log("[LocationInput] Injecting Maps script with key:", apiKey);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(
          new Error("Google Maps SDK loaded but window.google.maps is undefined")
        );
      }
    };

    script.onerror = (e) => reject(e);

    document.head.appendChild(script);
  });
}

export default function LocationInputScreen({ onContinue }) {
  const navigate = useNavigate();
  const currentUserId = localStorage.getItem("ghs_user_id");

  // Map refs
  const mapDivRef = useRef(null);      // container div
  const mapRef = useRef(null);         // map instance
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  // Autocomplete refs
  const originInputRef = useRef(null);
  const destInputRef = useRef(null);
  const originAutocompleteRef = useRef(null);
  const destAutocompleteRef = useRef(null);

  // State
  const [mapsReady, setMapsReady] = useState(false);

  const [originCoords, setOriginCoords] = useState(null); // {lat, lng}
  const [originAddress, setOriginAddress] = useState("");
  const [locError, setLocError] = useState("");

  const [destCoords, setDestCoords] = useState(null);
  const [destAddress, setDestAddress] = useState("");

  const [routeError, setRouteError] = useState("");
  const [routeReady, setRouteReady] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  console.log("[LocationInput] VITE_GOOGLE_MAPS_KEY:", apiKey);

  // 1) Load Google Maps + set up map & autocomplete
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
        if (!mapDivRef.current) {
          console.error("[LocationInput] mapDivRef is null");
          return;
        }

        console.log("[LocationInput] Creating map instance");
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

        // Origin autocomplete
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

        // Destination autocomplete
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
        console.error("[LocationInput] Error loading Google Maps:", err);
        if (!cancelled) setRouteError("Failed to load Google Maps.");
      }
    }

    initMaps();

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // 2) Get current GPS position and reverse geocode
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
              console.warn("[LocationInput] Reverse geocode failed:", status);
            }
          });
        } catch (err) {
          console.error("[LocationInput] Reverse geocoding error:", err);
        }
      },
      (err) => {
        console.error("[LocationInput] Geolocation error:", err);
        setLocError(
          "Could not fetch current location. You can enter a start address manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // 3) Bias autocomplete to user area
  useEffect(() => {
    if (!originCoords || !window.google?.maps) return;
    const gmaps = window.google.maps;
    const circle = new gmaps.Circle({
      center: originCoords,
      radius: 5000,
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

  // --- routing + trip creation ---

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
          console.error("[LocationInput] Directions request failed:", status);
          setRouteError("Could not compute route between these points.");
          return;
        }

        directionsRendererRef.current.setDirections(result);
        if (result.routes?.[0]?.bounds && mapRef.current) {
          mapRef.current.fitBounds(result.routes[0].bounds);
        }

        const originText = originInputVal || originAddress || "";
        const destText = destAddress || destInputVal;

        if (onContinue) {
          onContinue({
            origin: { coords: originCoords || null, text: originText },
            destination: { coords: destCoords || null, text: destText },
            directions: result,
          });
        }

        setRouteReady(true);
      }
    );
  };

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
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: "searching",
        activeMatchId: null,
        excludedUserIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate(`/match/${docRef.id}`);
    } catch (err) {
      console.error("[LocationInput] Failed to create trip:", err);
      setRouteError("Trip save failed. Try again.");
    } finally {
      setIsSavingTrip(false);
    }
  };

  const handlePrimaryClick = (e) => {
    e.preventDefault();
    if (!routeReady) {
      showRoute();
    } else {
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

  // ---- UI (no scrolling: header + form + map all inside the phone frame) ----
  return (
    <div className="screen location-screen">
      <header className="screen-header">
        <h1 className="screen-title">Where are you going?</h1>
        <p className="screen-subtitle">
          Enter your route so we can show your path and then find people heading
          the same way.
        </p>
      </header>

      <div className="location-main">
        {/* top card with fields + button */}
        <form className="card card--padded location-form" onSubmit={handlePrimaryClick}>
          <section className="field">
            <label className="field-label" htmlFor="origin-input">
              Start
            </label>
            <input
              id="origin-input"
              ref={originInputRef}
              type="text"
              placeholder="Use current location or type an address"
              autoComplete="off"
              className="field-input"
            />
            {originAddress && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "rgba(229, 38, 135, 0.8)",
                }}
              >
                Using current location:{" "}
                <span style={{ fontWeight: 600 }}>{originAddress}</span>
              </div>
            )}
            {locError && <div className="error">{locError}</div>}
          </section>

          <section className="field">
            <label className="field-label" htmlFor="destination-input">
              Destination
            </label>
            <input
              id="destination-input"
              ref={destInputRef}
              type="text"
              placeholder="Where do you want to end up?"
              autoComplete="off"
              className="field-input"
            />
          </section>

          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={isBusy}
          >
            {buttonLabel}
          </button>

          {routeError && <div className="error">{routeError}</div>}
        </form>

        {/* map card fills the rest of the phone frame */}
        <div className="card location-map-card">
          <div ref={mapDivRef} className="location-map" />
          <p className="location-caption">
            First we’ll show your walking route from where you are. Once it looks
            right, tap “Find me a match” to look for people heading along a
            similar path.
          </p>
        </div>
      </div>
    </div>
  );
}
