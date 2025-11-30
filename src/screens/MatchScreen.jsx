// src/screens/MatchScreen.jsx
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTrip,
  findCandidateMatchesForTrip,
} from "../services/matchingService";
import { fetchUser } from "../services/userService";
import { db } from "../firebaseClient";
import { collection, getDocs, query, where } from "firebase/firestore";
import { haversineDistanceMeters } from "../utils/matching";
import { createTripRecord } from "../services/tripService";

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

export default function MatchScreen() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [myTrip, setMyTrip] = useState(null);
  const [bestMatch, setBestMatch] = useState(null);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  const [videoCandidate, setVideoCandidate] = useState(null);
  const [videoExcludedIds, setVideoExcludedIds] = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoConfirmed, setVideoConfirmed] = useState(false);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const routeSegmentsRef = useRef({ pre: null, post: null });
  const markersRef = useRef({ origin: null, meeting: null, dest: null });

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

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
        minScore: 0.2,
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
        user: otherUser,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const loadVideoCandidate = async () => {
  if (!myTrip) {
    setError("Your trip is still loading – please try again in a moment.");
    return;
  }

  setVideoLoading(true);
  setVideoConfirmed(false);

  try {
    const q = query(
      collection(db, "users"),
      where("prefersVideoFirst", "==", true)
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const candidates = all.filter(
      (u) => u.id !== myTrip.userId && !videoExcludedIds.includes(u.id)
    );

    if (!candidates.length) {
      setVideoCandidate(null);
      setError("No other FaceTime-first users are available right now.");
      return;
    }

    const next =
      candidates[Math.floor(Math.random() * candidates.length)];
    setVideoCandidate(next);
  } catch (err) {
    console.error("[MatchScreen] loadVideoCandidate error", err);
    setError("Could not look up FaceTime users. Please try again.");
  } finally {
    setVideoLoading(false);
  }
};

const handleFaceTimeClick = () => {
  loadVideoCandidate();
};

const handleFaceTimeConfirm = () => {
  if (!videoCandidate) return;
  setVideoConfirmed(true);
};

const handleFaceTimeReject = () => {
  if (!videoCandidate) return;
  setVideoExcludedIds((prev) => [...prev, videoCandidate.id]);
  setVideoCandidate(null);
  loadVideoCandidate(); // try again, excluding the rejected user
};

  useEffect(() => {
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pick meeting point
  useEffect(() => {
    if (!myTrip || !bestMatch) return;

    async function chooseMeetingPoint() {
      const snap = await getDocs(collection(db, "safe_locations"));
      const safeLocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!safeLocs.length) {
        setMeetingPoint(null);
        return;
      }

      const { origin, destination } = myTrip;
      const mid = {
        lat: (origin.lat + destination.lat) / 2,
        lng: (origin.lng + destination.lng) / 2,
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

    chooseMeetingPoint().catch(console.error);
  }, [myTrip, bestMatch]);

  // draw route with waypoints
  useEffect(() => {
    if (!myTrip || !meetingPoint || !apiKey) return;

    let cancelled = false;

    async function initAndDraw() {
      try {
        const gmaps = await loadGoogleMaps(apiKey);
        if (cancelled) return;

        const { origin, destination } = myTrip;

        if (!mapRef.current) {
          mapRef.current = new gmaps.Map(mapDivRef.current, {
            center: { lat: origin.lat, lng: origin.lng },
            zoom: 14,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
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
                stopover: true,
              },
            ],
            travelMode: gmaps.TravelMode.WALKING,
          },
          (result, status) => {
            if (status !== "OK" || !result) return;

            const route = result.routes[0];
            const legs = route.legs || [];
            const preLeg = legs[0];
            const postLeg = legs[1];

            if (routeSegmentsRef.current.pre) {
              routeSegmentsRef.current.pre.setMap(null);
            }
            if (routeSegmentsRef.current.post) {
              routeSegmentsRef.current.post.setMap(null);
            }

            const prePath = [];
            preLeg?.steps?.forEach((step) =>
              step.path?.forEach((ll) => prePath.push(ll))
            );
            const postPath = [];
            postLeg?.steps?.forEach((step) =>
              step.path?.forEach((ll) => postPath.push(ll))
            );

            const prePolyline = new gmaps.Polyline({
              path: prePath,
              strokeColor: "#b83990",
              strokeOpacity: 0.95,
              strokeWeight: 5,
              map: mapRef.current,
            });

            const postPolyline = new gmaps.Polyline({
              path: postPath,
              strokeColor: "#492642",
              strokeOpacity: 0.9,
              strokeWeight: 5,
              map: mapRef.current,
            });

            routeSegmentsRef.current = { pre: prePolyline, post: postPolyline };

            Object.values(markersRef.current).forEach((m) => m?.setMap(null));

            const originMarker = new gmaps.Marker({
              position: { lat: origin.lat, lng: origin.lng },
              map: mapRef.current,
              label: "A",
            });
            const meetingMarker = new gmaps.Marker({
              position: { lat: meetingPoint.lat, lng: meetingPoint.lng },
              map: mapRef.current,
              label: "M",
            });
            const destMarker = new gmaps.Marker({
              position: { lat: destination.lat, lng: destination.lng },
              map: mapRef.current,
              label: "B",
            });

            markersRef.current = {
              origin: originMarker,
              meeting: meetingMarker,
              dest: destMarker,
            };

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

  const handleAccept = async () => {
    if (!myTrip || !bestMatch) return;

    setAccepted(true);

  
    try {
    const userId = myTrip.userId;                // the current user on this trip
    const otherUserId = bestMatch.trip.userId;   // the matched user’s trip.userId

    await createTripRecord({
      userId,
      otherUserId,
      startLocation: myTrip.origin?.text ?? "Unknown start",
      endLocation: myTrip.destination?.text ?? "Unknown end",
      // you can use plannedStartTime from Firestore if you want:
      tripDate: myTrip.plannedStartTime ?? new Date().toISOString(),
    });

    // optional: show a toast or set some "saved" state here
  } catch (err) {
    console.error("[MatchScreen] Failed to save trip to server:", err);
    // optional: show a lightweight error message
  }

    // TODO: update Firestore to mark as matched
  };

  const handleMessage = () => {
    if (!accepted || !myTrip || !bestMatch) return;

  const currentUserName =
    localStorage.getItem("ghs_name") || myTrip.userId || "You";

  navigate(`/trips/${tripId}/messages`, {
    state: {
      myUserId: myTrip.userId,          // e.g. "alice"
      otherUserId: bestMatch.user.id,   // e.g. "bob"
      myName: currentUserName,
      otherName: bestMatch.user.name,
      // roomId optional – room is deterministic anyway
    },
  });
  };

  const handleCall = (e) => {
    if (!accepted) {
      e.preventDefault();
      return;
    }
    if (!bestMatch?.user?.phone) {
      e.preventDefault();
      alert("Phone number not set up yet.");
    }
  };

  const hasMatch = !!bestMatch;

  const headerTitle = hasMatch
    ? "We found someone for you"
    : "Finding your match…";

  const headerSubtitle = hasMatch
    ? "Confirm your match and we’ll guide you both to a safe meeting spot."
    : "We’re looking for people walking or taking transit along a similar route.";

  return (
    <div className="screen match-screen">
      {/* HEADER */}
      <header className="screen-header">
        <h1 className="screen-title">{headerTitle}</h1>
        <p className="screen-subtitle">{headerSubtitle}</p>
      </header>

      {/* refresh */}
      <button
        className="btn btn--ghost"
        onClick={loadMatch}
        disabled={loading}
        style={{ marginBottom: 6 }}
      >
        {loading ? "Looking for friends near you…" : "Refresh match"}
      </button>

      {error && <div className="error">{error}</div>}

      {/* FaceTime fallback when pair is loading or missing */}
      {(loading || !bestMatch) && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn--primary btn--full"
            onClick={handleFaceTimeClick}
            disabled={videoLoading}
          >
            {videoLoading ? "Finding someone to FaceTime…" : "FaceTime another user"}
          </button>
        </div>
      )}

      {videoCandidate && (
        <div className="card card--padded" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--color-dark-purple)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {videoCandidate.name?.[0] || "U"}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {videoCandidate.name}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {videoCandidate.pronouns} • Rating{" "}
                {videoCandidate.ratingAverage?.toFixed?.(1) ?? "—"} (
                {videoCandidate.ratingCount ?? 0} reviews)
              </div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
                Prefers starting on FaceTime
                {videoCandidate.campusOnly ? " • On-campus only" : ""}
              </div>
            </div>
          </div>

          {!videoConfirmed ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleFaceTimeConfirm}
              >
                Confirm this person
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleFaceTimeReject}
              >
                See someone else
              </button>
            </div>
          ) : (
           <div style={{ display: "flex", gap: 8 }}>
            <a
              className="btn btn--primary"
              href={
                videoCandidate.facetimeHandle
                  ? `facetime:${videoCandidate.facetimeHandle}`
                  : undefined
              }
              style={{ textAlign: "center", flex: 1 }}
            >
              FaceTime {videoCandidate.name}
            </a>
          </div>
          )}
        </div>  
      )}

      {/* MATCH CARD */}
      {bestMatch && (
        <div className="card card--padded" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>
            Your match
          </div>

          <div style={{ marginTop: 2, display: "flex", gap: 12 }}>
            {/* profile bubble */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--pink-soft), var(--pink))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {bestMatch.user.name?.[0] || "G"}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--pink)",
                }}
              >
                {bestMatch.user.name}
                {bestMatch.user.age ? `, ${bestMatch.user.age}` : ""}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(0,0,0,0.55)",
                  marginTop: 2,
                }}
              >
                Rating:{" "}
                {bestMatch.user.ratingAverage != null
                  ? `${bestMatch.user.ratingAverage.toFixed(1)} ⭐`
                  : "—"}{" "}
                ({bestMatch.user.ratingCount ?? 0} reviews)
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(0,0,0,0.7)",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                They’re heading from{" "}
                <strong>{bestMatch.trip.origin?.text || "?"}</strong> toward{" "}
                <strong>{bestMatch.trip.destination?.text || "?"}</strong>.
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {!accepted && (
              <button
                type="button"
                className="btn btn--primary btn--full"
                onClick={handleAccept}
              >
                Confirm my match
              </button>
            )}

            {accepted && (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--full"
                  onClick={handleMessage}
                >
                  Message my match
                </button>

                <a
                  className="btn btn--ghost btn--full"
                  href={
                    bestMatch.user.phone
                      ? `tel:${bestMatch.user.phone}`
                      : "tel:5555555555"
                  }
                  onClick={handleCall}
                  style={{ textAlign: "center" }}
                >
                  Call my match
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* ROUTE CARD */}
      {myTrip && meetingPoint && (
        <div className="card card--padded" style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.8,
              marginBottom: 4,
            }}
          >
            Your route & meeting point
          </div>

          <div
            style={{
              fontSize: 13,
              marginBottom: 4,
              color: "var(--pink)",
              fontWeight: 600,
            }}
          >
            Your meeting point is:{" "}
            <span style={{ fontWeight: 800 }}>
              {meetingPoint.name || "a safe nearby spot"}
            </span>
          </div>

          {meetingPoint.address && (
            <div
              style={{
                fontSize: 11,
                marginBottom: 6,
                color: "rgba(0,0,0,0.7)",
              }}
            >
              {meetingPoint.address}
            </div>
          )}

          <div
            ref={mapDivRef}
            style={{
              width: "100%",
              height: "38vh", // smaller so it fits
              borderRadius: 14,
              background: "#eee",
              marginTop: 4,
              marginBottom: 6,
              overflow: "hidden",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              fontSize: 11,
              color: "rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 18,
                  height: 4,
                  borderRadius: 999,
                  background: "#b83990",
                }}
              />
              <span>Start → meeting point (you alone)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 18,
                  height: 4,
                  borderRadius: 999,
                  background: "#492642",
                }}
              />
              <span>Meeting point → destination (together)</span>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              color: "rgba(0,0,0,0.7)",
              marginTop: 4,
              lineHeight: 1.35,
            }}
          >
            

          </div>
        </div>
      )}
    </div>
  );
}
