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

  // NEW: whether this trip is looking for an in-person walking buddy or a virtual one
  // "in_person" -> physically meet + walk
  // "virtual_only" -> just walk on similar route, talk / share status
  const [matchMode, setMatchMode] = useState("in_person");

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
            if (!place.geometry || !place.geometry.location) {
              // Allow free-text name; we still keep the text but just skip coords
              setOriginCoords(null);
              setOriginAddress(place.formatted_address || place.name || "");
              return;
            }
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
            if (!place.geometry || !place.geometry.location) {
              setDestCoords(null);
              setDestAddress(place.formatted_address || place.name || "");
              return;
            }
            const loc = place.geometry.location;
            const coords = { lat: loc.lat(), lng: loc.lng() };
            setDestCoords(coords);
            setDestAddress(place.formatted_address || place.name || "");
          });
        }

        setMapsReady(true);
      } catch (err) {
        console.error("[LocationInput] Error loading Google Maps:", err);
        if (!cancelled) {
          // Fallback: let the user still continue even if the map never appears
          setRouteError(
            "We couldn’t load the map preview, but you can still continue to find a match."
          );
          setMapsReady(false);
        }
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
          "Could not fetch current location. You can type where you’re starting from instead."
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
      setRouteError("Please tell us roughly where you’re going.");
      return;
    }
    if (!originCoords && !originInputVal) {
      setRouteError("Please allow location or type where you’re starting.");
      return;
    }

    const originText = originInputVal || originAddress || "";
    const destText = destAddress || destInputVal;

    // If Maps isn't ready, fall back to "no map but still match"
    if (
      !mapsReady ||
      !window.google?.maps ||
      !directionsServiceRef.current ||
      !directionsRendererRef.current
    ) {
      setRouteError(
        "We couldn’t draw the map preview, but we can still look for someone on a similar route."
      );
      setRouteReady(true);
      if (onContinue) {
        onContinue({
          origin: { coords: originCoords || null, text: originText },
          destination: { coords: destCoords || null, text: destText },
          directions: null,
        });
      }
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
          // Fallback: allow continue without map
          setRouteError(
            "We couldn’t draw your exact path, but we’ll still use your start and end to find a match."
          );
          setRouteReady(true);
          if (onContinue) {
            onContinue({
              origin: { coords: originCoords || null, text: originText },
              destination: { coords: destCoords || null, text: destText },
              directions: null,
            });
          }
          return;
        }

        directionsRendererRef.current.setDirections(result);
        if (result.routes?.[0]?.bounds && mapRef.current) {
          mapRef.current.fitBounds(result.routes[0].bounds);
        }

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
        matchMode, // NEW: "in_person" or "virtual_only"
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
      : "Show my route"
    : isSavingTrip
    ? matchMode === "in_person"
      ? "Finding someone to walk with…"
      : "Finding your virtual buddy…"
    : matchMode === "in_person"
    ? "Find someone to walk with"
    : "Find a virtual walking buddy";

  // ---- UI ----
  return (
    <div className="screen location-screen">
      <header className="screen-header">
        <h1 className="screen-title">Where are you going?</h1>
        <p className="screen-subtitle">
          Tell us your start and end so we can find someone heading a similar way.
        </p>
      </header>

      {/* NEW: choice between physical vs virtual buddy */}
      <div className="card card--padded" style={{ marginBottom: 10 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>
          How do you want to walk tonight?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMatchMode("in_person")}
            style={{
              flex: 1,
              borderRadius: 999,
              border:
                matchMode === "in_person"
                  ? "2px solid var(--pink)"
                  : "1px solid rgba(229, 38, 135, 0.2)",
              background:
                matchMode === "in_person"
                  ? "rgba(229, 38, 135, 0.07)"
                  : "transparent",
            }}
          >
            In-person buddy
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMatchMode("virtual_only")}
            style={{
              flex: 1,
              borderRadius: 999,
              border:
                matchMode === "virtual_only"
                  ? "2px solid var(--pink)"
                  : "1px solid rgba(229, 38, 135, 0.2)",
              background:
                matchMode === "virtual_only"
                  ? "rgba(229, 38, 135, 0.07)"
                  : "transparent",
            }}
          >
            Virtual buddy only
          </button>
        </div>
        <p
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "rgba(0,0,0,0.6)",
            lineHeight: 1.4,
          }}
        >
          In-person buddies meet at a safe location and walk together. Virtual
          buddies walk separately on similar routes and can just text or call.
        </p>
      </div>

      <div className="location-main">
        {/* top card with fields + button */}
        <form
          className="card card--padded location-form"
          onSubmit={handlePrimaryClick}
        >
          <section className="field">
            <label className="field-label" htmlFor="origin-input">
              Start
            </label>
            <input
              id="origin-input"
              ref={originInputRef}
              type="text"
              placeholder="e.g. 'Campus library' or 'Smith Hall'"
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
              placeholder="e.g. 'Home', 'Off-campus house', 'Train station'"
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
            We’ll try to draw your walking route here. If the map doesn’t load,
            we’ll still use your start and end to match you with someone going a
            similar way.
          </p>
        </div>
      </div>
    </div>
  );
}
