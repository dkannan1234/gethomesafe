// src/screens/MatchScreen.jsx
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTrip,
  findCandidateMatchesForTrip,
  excludeUserForTrip,
} from "../services/matchingService";
import { fetchUser, rateUser } from "../services/userService";
import { db } from "../firebaseClient";
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
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

  // In-person match state
  const [bestMatch, setBestMatch] = useState(null);
  const [meetingPoint, setMeetingPoint] = useState(null);
  const [accepted, setAccepted] = useState(false);

  // Virtual buddy state
  const [virtualHandle, setVirtualHandle] = useState("");
  const [savingHandle, setSavingHandle] = useState(false);
  const [virtualBuddy, setVirtualBuddy] = useState(null);
  const [virtualLoading, setVirtualLoading] = useState(false);

  const [error, setError] = useState("");

  const [showRating, setShowRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const routeSegmentsRef = useRef({ pre: null, post: null });
  const markersRef = useRef({ origin: null, meeting: null, dest: null });

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

  const isVirtualTrip =
    myTrip?.buddyMode === "virtual" || myTrip?.matchMode === "virtual_only";

  const resetMapState = () => {
    if (routeSegmentsRef.current.pre) {
      routeSegmentsRef.current.pre.setMap(null);
    }
    if (routeSegmentsRef.current.post) {
      routeSegmentsRef.current.post.setMap(null);
    }
    routeSegmentsRef.current = { pre: null, post: null };
    Object.values(markersRef.current).forEach((m) => m?.setMap(null));
    markersRef.current = { origin: null, meeting: null, dest: null };
    mapRef.current = null;
  };

  const loadMatch = async () => {
    setLoading(true);
    setError("");

    resetMapState();
    setBestMatch(null);
    setMeetingPoint(null);
    setVirtualBuddy(null);

    try {
      const my = await fetchTrip(tripId);
      setMyTrip(my);

      const virtual =
        my.buddyMode === "virtual" || my.matchMode === "virtual_only";

      // Pre-fill FaceTime handle for virtual trips from Firestore if present
      if (virtual) {
        try {
          const meRef = doc(db, "users", my.userId);
          const meSnap = await getDoc(meRef);
          if (meSnap.exists()) {
            const data = meSnap.data();
            if (data.facetimeHandle) {
              setVirtualHandle(data.facetimeHandle);
            }
          }
        } catch (e) {
          console.warn("[MatchScreen] could not prefill FaceTime handle:", e);
        }
      }

      if (virtual) {
        // VIRTUAL: look for other virtual trips
        const candidates = await findCandidateMatchesForTrip(my, {
          maxResults: 10,
          minScore: 0.1,
          timeWindowMinutes: 60,
        });

        const filtered = candidates.filter((c) => {
          const t = c.trip;
          if (!t) return false;
          if (t.userId === my.userId) return false;
          if (t.status && t.status !== "searching") return false;
          if (t.buddyMode && t.buddyMode !== "virtual") return false;
          return true;
        });

        if (!filtered.length) {
          setError(
            "No other FaceTime-first users are available right now. We'll keep showing your solo route."
          );
          setLoading(false);
          return;
        }

        const top = filtered[0];
        const otherTrip = top.trip;

        let otherUser;
        try {
          otherUser = await fetchUser(otherTrip.userId);
        } catch (e) {
          console.warn("[MatchScreen] fetchUser (virtual) failed:", e?.message);
          otherUser = {
            id: otherTrip.userId,
            name: "Sarah Mejia Toro",
            phone: "",
            ratingAverage: null,
            ratingCount: 0,
          };
        }

        setVirtualBuddy({
          score: top.score,
          trip: otherTrip,
          user: otherUser,
        });

        setLoading(false);
        return;
      }

      // ----- IN-PERSON FLOW BELOW -----

      // If already matched, restore existing match
      if (my.status === "matched" && my.activeMatchUserId) {
        setAccepted(true);

        let otherUser;
        try {
          otherUser = await fetchUser(my.activeMatchUserId);
        } catch (e) {
          console.warn("[MatchScreen] fetchUser for existing match failed:", e);
          otherUser = {
            id: my.activeMatchUserId,
            name: "Sarah Jacob",
            phone: "",
            ratingAverage: null,
            ratingCount: 0,
            bio: "",
          };
        }

        // Try to get their trip for more detail
        let otherTrip = null;
        try {
          const tripsCol = collection(db, "trips");
          const qTrips = query(
            tripsCol,
            where("userId", "==", my.activeMatchUserId)
          );
          const snap = await getDocs(qTrips);
          const docSnap = snap.docs[0];
          if (docSnap) {
            otherTrip = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (e) {
          console.warn(
            "[MatchScreen] could not fetch other user's trip:",
            e
          );
        }

        setBestMatch({
          score: 1,
          trip:
            otherTrip || {
              id: "synthetic",
              userId: my.activeMatchUserId,
              origin: my.origin,
              destination: my.destination,
            },
          user: otherUser,
        });

        setLoading(false);
        return;
      }

      // Normal match search – 1 hour window
      const candidates = await findCandidateMatchesForTrip(my, {
        maxResults: 3,
        minScore: 0.2,
        timeWindowMinutes: 60,
      });

      if (!candidates.length) {
        setError("No suitable matches found right now.");
        setLoading(false);
        return;
      }

      const top = candidates[0];
      const otherTrip = top.trip;

      let otherUser;
      try {
        otherUser = await fetchUser(otherTrip.userId);
      } catch (e) {
        console.warn("[MatchScreen] fetchUser failed:", e?.message);
        otherUser = {
          id: otherTrip.userId,
          name: "Sarah Jacob",
          phone: "",
          ratingAverage: null,
          ratingCount: 0,
          bio: "",
        };
      }

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

  useEffect(() => {
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Choose meeting point (in-person only) */
  useEffect(() => {
    if (!myTrip || !bestMatch || isVirtualTrip) return;

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
  }, [myTrip, bestMatch, isVirtualTrip]);

  /* Draw route with waypoints (in-person only) */
  useEffect(() => {
    if (!myTrip || !meetingPoint || !apiKey || isVirtualTrip) return;

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
            if (status !== "OK" || !result) {
              console.warn("Route request failed in MatchScreen:", status);
              return;
            }

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
              strokeColor: "#e52687",
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

            // Clear old markers
            Object.values(markersRef.current).forEach((m) => m?.setMap(null));

            const youIcon = {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#e52687",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            };

            const meetIcon = {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeColor: "#e52687",
              strokeWeight: 2,
            };

            const destIcon = {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#f28dc0",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            };

            const originMarker = new gmaps.Marker({
              position: { lat: origin.lat, lng: origin.lng },
              map: mapRef.current,
              icon: youIcon,
              title: "You",
            });

            const meetingMarker = new gmaps.Marker({
              position: { lat: meetingPoint.lat, lng: meetingPoint.lng },
              map: mapRef.current,
              icon: meetIcon,
              title: bestMatch?.user?.name
                ? `Meeting spot with ${bestMatch.user.name}`
                : "Meeting spot with your buddy",
            });

            const destMarker = new gmaps.Marker({
              position: { lat: destination.lat, lng: destination.lng },
              map: mapRef.current,
              icon: destIcon,
              title: "Your destination",
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
        console.error("Error drawing in-person route:", err);
      }
    }

    initAndDraw();

    return () => {
      cancelled = true;
    };
  }, [myTrip, meetingPoint, apiKey, isVirtualTrip, bestMatch]);

  const handleAccept = async () => {
    if (!myTrip || !bestMatch) return;

    setAccepted(true);
    setShowRating(false);

    try {
      const userId = myTrip.userId;
      const otherUserId = bestMatch.trip.userId;

      await createTripRecord({
        userId,
        otherUserId,
        startLocation: myTrip.origin?.text ?? "Unknown start",
        endLocation: myTrip.destination?.text ?? "Unknown end",
        tripDate: myTrip.plannedStartTime ?? new Date().toISOString(),
      });

      const tripRef = doc(db, "trips", myTrip.id);
      await updateDoc(tripRef, {
        status: "matched",
        activeMatchUserId: otherUserId,
      });
    } catch (err) {
      console.error("[MatchScreen] Failed to save trip:", err);
    }
  };

  const handleRejectMatch = async () => {
    if (!myTrip || !bestMatch) return;
    try {
      await excludeUserForTrip(myTrip.id, bestMatch.trip.userId);
    } catch (err) {
      console.error("[MatchScreen] excludeUserForTrip error:", err);
    }
    setShowRating(false);
    loadMatch();
  };

  const handleMessage = () => {
    if (!accepted || !myTrip || !bestMatch) return;

    const currentUserName =
      localStorage.getItem("ghs_name") || myTrip.userId || "You";

    navigate(`/trips/${tripId}/messages`, {
      state: {
        myUserId: myTrip.userId,
        otherUserId: bestMatch.user.id,
        myName: currentUserName,
        otherName: bestMatch.user.name,
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

  const handleClickFinishWalk = () => {
    if (!accepted || !bestMatch) return;
    setShowRating(true);
    setSelectedRating(0);
  };

  const handleSubmitRating = async () => {
    if (!selectedRating || !bestMatch) return;

    setSubmittingRating(true);
    setError("");

    try {
      if (bestMatch.user?.id) {
        await rateUser(bestMatch.user.id, selectedRating);
      }

      if (myTrip) {
        const tripRef = doc(db, "trips", myTrip.id);
        await updateDoc(tripRef, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[MatchScreen] finish walk / rating error:", err);
      setError("We saved your rating, but something went wrong finishing the trip.");
    } finally {
      setSubmittingRating(false);
      navigate("/home");
    }
  };

  // ---- Virtual buddy helpers (still used via loadMatch / refresh) ----

  const handleSaveVirtualHandle = async () => {
    if (!myTrip) return;
    const trimmed = virtualHandle.trim();
    if (!trimmed) return;

    setSavingHandle(true);
    setError("");

    try {
      const userRef = doc(db, "users", myTrip.userId);
      await setDoc(
        userRef,
        {
          facetimeHandle: trimmed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("[MatchScreen] save FaceTime handle error:", err);
      setError("Could not save your FaceTime handle. Please try again.");
    } finally {
      setSavingHandle(false);
    }
  };

  const handleFindVirtualBuddy = async () => {
    if (!myTrip) {
      setError("Your trip is still loading – please try again in a moment.");
      return;
    }
    setVirtualLoading(true);
    setError("");

    try {
      await loadMatch();
    } finally {
      setVirtualLoading(false);
    }
  };

  const handleSeeAnotherVirtualBuddy = async () => {
    if (!myTrip || !virtualBuddy?.trip?.userId) return;

    try {
      await excludeUserForTrip(myTrip.id, virtualBuddy.trip.userId);
    } catch (err) {
      console.error("[MatchScreen] exclude virtual buddy error:", err);
    }
    setVirtualBuddy(null);
    loadMatch();
  };

  // ---- Header text ----

  const hasInPersonMatch = !!bestMatch && !isVirtualTrip;

  const headerTitle = isVirtualTrip
    ? "Finding your match..."
    : hasInPersonMatch
    ? accepted
      ? "You’re all set"
      : "We found someone for you"
    : "Finding your match…";

  const headerSubtitle = isVirtualTrip
    ? "You’re in virtual buddy mode. We’ll pair you with someone to walk ‘together’ remotely."
    : hasInPersonMatch
    ? accepted
      ? "You’ve confirmed your walking buddy. Head to your meeting point together and mark when you finish."
      : "Confirm your match and we’ll guide you both to a safe meeting spot."
    : "We’re looking for people walking or taking transit along a similar route.";

  return (
    <div className="screen match-screen">
      {/* HEADER */}
      <header className="screen-header match-header">
        <button
          type="button"
          className="match-back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back to journey
        </button>

        <div className="match-header-text">
          <h1 className="screen-title">{headerTitle}</h1>
          <p className="screen-subtitle">{headerSubtitle}</p>
        </div>
      </header>

      {/* REFRESH BUTTON */}
      {(!accepted || isVirtualTrip) && (
        <button
          className="btn match-refresh-btn"
          onClick={loadMatch}
          disabled={loading}
        >
          {loading ? "Looking for friends near you…" : "Refresh match"}
        </button>
      )}

      {error && <div className="error" style={{ marginTop: 6 }}>{error}</div>}

      {/* ------------- VIRTUAL BUDDY UI (ONLY RESULT CARD) ------------- */}
      {isVirtualTrip && virtualBuddy && (
        <div className="match-card match-card--virtual-result">
          <div className="match-card-label">Your Virtual Buddy</div>

          <div className="match-main-row">
            <div className="match-avatar">
              {virtualBuddy.user.name?.[0] || "V"}
            </div>

            <div className="match-main-info">
              <div className="match-main-name">
                {virtualBuddy.user.name}
                {virtualBuddy.user.age ? `, ${virtualBuddy.user.age}` : ""}
              </div>

              <div className="match-main-meta">
                Rating:{" "}
                {virtualBuddy.user.ratingAverage != null
                  ? `${virtualBuddy.user.ratingAverage.toFixed(1)} ⭐`
                  : "—"}{" "}
                ({virtualBuddy.user.ratingCount ?? 0} reviews)
              </div>

              {virtualBuddy.user.bio && (
                <div className="match-main-bio">{virtualBuddy.user.bio}</div>
              )}

              <div className="match-main-destination">
                Phone:{" "}
                <strong>
                  {virtualBuddy.user.phone || "Not provided"}
                </strong>
              </div>
            </div>
          </div>

          <div className="match-main-actions">
            {/* Centered primary button */}
            <a
              className="btn btn--primary"
              style={{
                display: "block",
                margin: "12px auto 8px",
                minWidth: "180px",
                textAlign: "center",
              }}
              href={
                virtualBuddy.user.phone
                  ? `tel:${virtualBuddy.user.phone}`
                  : undefined
              }
            >
              Call my buddy
            </a>

            <button
              type="button"
              className="btn btn--ghost btn--full"
              onClick={handleSeeAnotherVirtualBuddy}
            >
              See someone else
            </button>
          </div>
        </div>
      )}

      {/* ------------- IN-PERSON MATCH UI ------------- */}
      {!isVirtualTrip && bestMatch && (
        <div className="match-card">
          <div className="match-card-label">Your match</div>

          <div className="match-main-row">
            <div className="match-avatar">
              {bestMatch.user.name?.[0] || "G"}
            </div>

            <div className="match-main-info">
              <div className="match-main-name">
                {bestMatch.user.name}
                {bestMatch.user.age ? `, ${bestMatch.user.age}` : ""}
              </div>
              <div className="match-main-meta">
                Rating:{" "}
                {bestMatch.user.ratingAverage != null
                  ? `${bestMatch.user.ratingAverage.toFixed(1)} ⭐`
                  : "—"}{" "}
                ({bestMatch.user.ratingCount ?? 0} reviews)
              </div>

              {bestMatch.user.bio && (
                <div className="match-main-bio">{bestMatch.user.bio}</div>
              )}

              <div className="match-main-destination">
                They’re heading toward{" "}
                <strong>
                  {bestMatch.trip.destination?.text || "a similar area"}
                </strong>
                .
              </div>
            </div>
          </div>

          {/* MATCH ACTIONS */}
          <div className="match-main-actions">
            {!accepted && (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--full"
                  onClick={handleAccept}
                >
                  Confirm my match
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--full"
                  onClick={handleRejectMatch}
                >
                  See a different match
                </button>
              </>
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

                <button
                  type="button"
                  className="btn btn--ghost btn--full"
                  onClick={handleClickFinishWalk}
                >
                  I’ve finished my walk
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* RATING CARD (in-person only) */}
      {!isVirtualTrip && accepted && showRating && bestMatch && (
        <div className="match-card">
          <div className="match-rating-title">
            Rate your experience with {bestMatch.user.name}
          </div>
          <div className="match-rating-subtitle">
            This helps keep the community safe and kind.
          </div>

          <div className="match-rating-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setSelectedRating(star)}
                className={
                  "match-rating-star" +
                  (selectedRating >= star
                    ? " match-rating-star--active"
                    : "")
                }
              >
                {star}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn--primary btn--full"
            onClick={handleSubmitRating}
            disabled={!selectedRating || submittingRating}
          >
            {submittingRating ? "Saving rating…" : "Submit rating & finish"}
          </button>
        </div>
      )}

      {/* ROUTE CARD – ONLY for in-person trips */}
      {myTrip && !isVirtualTrip && (
        <div className="match-card">
          <div className="match-card-label">
            Your route{meetingPoint ? " & meeting point" : ""}
          </div>

          {meetingPoint && (
            <>
              <div className="match-meeting-headline">
                Your meeting point is{" "}
                <span className="match-meeting-name">
                  {meetingPoint.name || "a safe nearby spot"}
                </span>
              </div>

              {meetingPoint.address && (
                <div className="match-meeting-address">
                  {meetingPoint.address}
                </div>
              )}
            </>
          )}

          <div ref={mapDivRef} className="match-map" />

          {/* Legend */}
          <div className="match-legend">
            <div className="match-legend-row">
              <span className="match-legend-dot match-legend-dot--you" />
              <span>You</span>
            </div>

            <div className="match-legend-row">
              <span className="match-legend-dot match-legend-dot--meet" />
              <span>
                Meeting spot
                {bestMatch?.user?.name
                  ? ` with ${bestMatch.user.name}`
                  : ""}
              </span>
            </div>

            <div className="match-legend-row">
              <span className="match-legend-dot match-legend-dot--dest" />
              <span>Your destination</span>
            </div>

            <div className="match-legend-row">
              <span className="match-legend-line match-legend-line--solo" />
              <span>Start → meeting point (you alone)</span>
            </div>
            <div className="match-legend-row">
              <span className="match-legend-line match-legend-line--together" />
              <span>Meeting point → destination (together)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
