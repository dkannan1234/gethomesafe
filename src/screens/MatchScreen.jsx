import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchTrip, findCandidateMatchesForTrip, excludeUserForTrip } from "../services/matchingService";
import { fetchUser } from "../services/userService";
import { db } from "../firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { haversineDistanceMeters } from "../utils/matching";

const ui = {
  page: { fontFamily: "var(--font-sans), system-ui, sans-serif", maxWidth: 560, margin: "0 auto", padding: 16 },
  card: { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 8px 20px rgba(0,0,0,0.06)", marginTop: 12 },
  h2: { fontSize: "clamp(20px, 4vw, 26px)", marginBottom: 4 },
  btn: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "none",
    fontSize: 14,
    cursor: "pointer",
    background: "var(--color-dark-pink, #b83990)",
    color: "#fff",
    marginRight: 8
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #ddd",
    fontSize: 14,
    cursor: "pointer",
    background: "#fff",
    color: "#444"
  },
  meta: { fontSize: 13, color: "#555", marginTop: 4 }
};

// Reuse script loader
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const existing = document.querySelector("script[data-google-maps]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google.maps));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => resolve(window.google.maps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function MatchPreviewTest() {
   const { tripId } = useParams();        // <-- use URL param

  const [loading, setLoading] = useState(false);
  const [myTrip, setMyTrip] = useState(null);
  const [bestMatch, setBestMatch] = useState(null);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const routeSegmentsRef = useRef({ pre: null, post: null });
  const markersRef = useRef({ origin: null, meeting: null, dest: null });

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

  // 1) Load my trip and best match
  const loadMatch = async () => {
    setLoading(true);
    setError("");
    setBestMatch(null);
    setMeetingPoint(null);
    setAccepted(false);

    try {
      const my = await fetchTrip(tripId);
      setMyTrip(my);

      const candidates = await findCandidateMatchesForTrip(my, {
        maxResults: 3,
        minScore: 0.2
      });

      if (!candidates.length) {
        setError("No suitable matches found right now.");
        setLoading(false);
        return;
      }

      const top = candidates[0];
      const otherTrip = top.trip;
      const otherUser = await fetchUser(otherTrip.userId);

      setBestMatch({
        score: top.score,
        trip: otherTrip,
        user: otherUser
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Choose meeting point from safe_locations near midpoint of my route
  useEffect(() => {
    if (!myTrip || !bestMatch) return;

    async function chooseMeetingPoint() {
      const snap = await getDocs(collection(db, "safe_locations"));
      const safeLocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!safeLocs.length) {
        console.warn("No safe_locations found");
        setMeetingPoint(null);
        return;
      }

      const { origin, destination } = myTrip;
      const mid = {
        lat: (origin.lat + destination.lat) / 2,
        lng: (origin.lng + destination.lng) / 2
      };

      let best = null;
      let bestDist = Infinity;
      for (const loc of safeLocs) {
        const d = haversineDistanceMeters(mid, { lat: loc.lat, lng: loc.lng });
        if (d < bestDist) {
          bestDist = d;
          best = loc;
        }
      }

      setMeetingPoint(best);
    }

    chooseMeetingPoint().catch((err) => {
      console.error("Error choosing meeting point:", err);
    });
  }, [myTrip, bestMatch]);

  // 3) Draw Alice’s route with two visually distinct segments:
  //    Segment 1: start -> meeting
  //    Segment 2: meeting -> destination
  useEffect(() => {
    if (!myTrip || !meetingPoint || !apiKey) return;

    let cancelled = false;

    async function initAndDraw() {
      try {
        const gmaps = await loadGoogleMaps(apiKey);
        if (cancelled) return;

        const { origin, destination } = myTrip;

        // Init map if needed
        if (!mapRef.current) {
          mapRef.current = new gmaps.Map(mapDivRef.current, {
            center: { lat: origin.lat, lng: origin.lng },
            zoom: 14,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false
          });
        }

        const directionsService = new gmaps.DirectionsService();

        directionsService.route(
          {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            waypoints: [
              {
                location: { lat: meetingPoint.lat, lng: meetingPoint.lng },
                stopover: true
              }
            ],
            travelMode: gmaps.TravelMode.WALKING
          },
          (result, status) => {
            if (status !== "OK" || !result) {
              console.error("Directions failed:", status);
              return;
            }

            const route = result.routes[0];
            const legs = route.legs || [];

            // Expect legs[0] = origin -> meeting, legs[1] = meeting -> destination
            const preLeg = legs[0];
            const postLeg = legs[1];

            // Clear old polylines if any
            if (routeSegmentsRef.current.pre) {
              routeSegmentsRef.current.pre.setMap(null);
            }
            if (routeSegmentsRef.current.post) {
              routeSegmentsRef.current.post.setMap(null);
            }

            const prePath = [];
            if (preLeg?.steps) {
              preLeg.steps.forEach((step) => {
                step.path?.forEach((latLng) => prePath.push(latLng));
              });
            }

            const postPath = [];
            if (postLeg?.steps) {
              postLeg.steps.forEach((step) => {
                step.path?.forEach((latLng) => postPath.push(latLng));
              });
            }

            // Draw segment 1: start -> meeting (e.g. pink)
            const prePolyline = new gmaps.Polyline({
              path: prePath,
              strokeColor: "#b83990", // light/dark pink
              strokeOpacity: 0.95,
              strokeWeight: 5,
              map: mapRef.current
            });

            // Draw segment 2: meeting -> destination (e.g. deep purple)
            const postPolyline = new gmaps.Polyline({
              path: postPath,
              strokeColor: "#492642",
              strokeOpacity: 0.9,
              strokeWeight: 5,
              map: mapRef.current
            });

            routeSegmentsRef.current = { pre: prePolyline, post: postPolyline };

            // Clear old markers
            Object.values(markersRef.current).forEach((m) => m?.setMap(null));

            // Markers for clarity
            const originMarker = new gmaps.Marker({
              position: { lat: origin.lat, lng: origin.lng },
              map: mapRef.current,
              label: "A"
            });
            const meetingMarker = new gmaps.Marker({
              position: { lat: meetingPoint.lat, lng: meetingPoint.lng },
              map: mapRef.current,
              label: "M"
            });
            const destMarker = new gmaps.Marker({
              position: { lat: destination.lat, lng: destination.lng },
              map: mapRef.current,
              label: "B"
            });

            markersRef.current = {
              origin: originMarker,
              meeting: meetingMarker,
              dest: destMarker
            };

            // Fit bounds around total route
            const bounds = new gmaps.LatLngBounds();
            prePath.forEach((p) => bounds.extend(p));
            postPath.forEach((p) => bounds.extend(p));
            mapRef.current.fitBounds(bounds, 40);
          }
        );
      } catch (err) {
        console.error("Error drawing route:", err);
      }
    }

    initAndDraw();

    return () => {
      cancelled = true;
    };
  }, [myTrip, meetingPoint, apiKey]);

  const handleAccept = () => {
    setAccepted(true);
    console.log("Accepted match with", bestMatch?.user?.id);
  };

  const handleSkip = () => {
    setAccepted(false);
    console.log("Skipped match with", bestMatch?.user?.id);
  };

  return (
    <div style={ui.page}>
      <h2 style={ui.h2}>Match Preview Test</h2>

      <p style={{ fontSize: 14, color: "#444" }}>
        Testing matches for trip: <code>{tripId}</code>
      </p>

      <button
        style={ui.btn}
        onClick={loadMatch}
        disabled={loading}
      >
        {loading ? "Finding match..." : "Refresh match"}
      </button>

      {error && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#b00020" }}>
          {error}
        </div>
      )}

      {myTrip && (
        <div style={ui.card}>
          <strong>Your trip</strong>
          <div style={ui.meta}>
            From: {myTrip.origin?.text || "?"}
            <br />
            To: {myTrip.destination?.text || "?"}
          </div>
        </div>
      )}

      {bestMatch && (
        <div style={ui.card}>
          <strong>Proposed match</strong>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {bestMatch.user.name}, {bestMatch.user.age}
            </div>
            <div style={ui.meta}>
              Rating: {bestMatch.user.ratingAverage?.toFixed(1) ?? "—"} ⭐ (
              {bestMatch.user.ratingCount ?? 0} reviews)
            </div>
            <div style={{ ...ui.meta, marginTop: 8 }}>
              Their trip (high level):
              <br />
              Heading from <strong>{bestMatch.trip.origin?.text || "?"}</strong> toward{" "}
              <strong>{bestMatch.trip.destination?.text || "?"}</strong>.
            </div>
            <div style={{ ...ui.meta, marginTop: 8 }}>
              Internal match score: {(bestMatch.score * 100).toFixed(0)} / 100
            </div>

            <div style={{ marginTop: 12 }}>
              <button style={ui.btn} onClick={handleAccept}>
                {accepted ? "Accepted" : "Accept"}
              </button>
              <button style={ui.secondaryBtn} onClick={handleSkip}>
                Skip this match
              </button>
            </div>

            <div style={{ ...ui.meta, marginTop: 8 }}>
              We show your path and a high-level view of their trip, but not their exact live
              location. You can choose to meet at the suggested safe spot or just coordinate a
              FaceTime call for your walk.
            </div>
          </div>
        </div>
      )}

      {myTrip && meetingPoint && (
        <div style={ui.card}>
          <strong>Your proposed route</strong>

          {/* MAP */}
          <div
            ref={mapDivRef}
            style={{
              width: "100%",
              height: "45vh",
              borderRadius: 14,
              background: "#eee",
              marginTop: 10,
              marginBottom: 8,
              overflow: "hidden"
            }}
          />

          {/* LEGEND */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 4, borderRadius: 999, background: "#b83990" }} />
              <span>Start → Meeting point (walk alone)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 4, borderRadius: 999, background: "#492642" }} />
              <span>Meeting point → Your destination (shared route)</span>
            </div>
          </div>

          <div style={{ ...ui.meta, marginTop: 6 }}>
            You’ll start from <strong>{myTrip.origin?.text}</strong>, meet at{" "}
            <strong>{meetingPoint.name}</strong>, then continue toward{" "}
            <strong>{myTrip.destination?.text}</strong>.
          </div>
          <div style={{ ...ui.meta, marginTop: 6 }}>
            We’ll use this route (plus your live location) to find people heading along similar
            paths, propose safe meeting points, and help you travel along vetted routes.
          </div>
        </div>
      )}
    </div>
  );
}


