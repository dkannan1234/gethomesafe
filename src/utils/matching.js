// src/utils/matching.js

// Haversine distance in meters between two {lat, lng}
export function haversineDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);

  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);

  const x =
    sinΔφ * sinΔφ +
    Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

// Convert a distance to a similarity 0..1 where 1 = perfect match
function similarityFromDistance(distanceMeters, maxGoodDistanceMeters) {
  if (!isFinite(distanceMeters)) return 0;
  if (distanceMeters <= 0) return 1;
  const x = Math.min(distanceMeters / maxGoodDistanceMeters, 1);
  return 1 - x; // linear falloff
}

/**
 * Compute a match score between two trips.
 * Returns a number between 0 and 1.
 */
export function computeMatchScore(myTrip, otherTrip) {
  // Safely normalize locations
  const myOrigin = myTrip.origin || {};
  const myDest = myTrip.destination || {};
  const otherOrigin = otherTrip.origin || {};
  const otherDest = otherTrip.destination || {};

  const myDestText = (myDest.text || "").toLowerCase();
  const otherDestText = (otherDest.text || "").toLowerCase();

  let score = 0;

  // 1) Destination text similarity (if either side has text)
  if (myDestText && otherDestText) {
    // basic overlap: substring match either way
    if (
      myDestText.includes(otherDestText) ||
      otherDestText.includes(myDestText)
    ) {
      score += 0.4;
    }
  }

  // 2) Coordinate proximity if we have lat/lng for both
  const hasMyCoords =
    typeof myOrigin.lat === "number" &&
    typeof myOrigin.lng === "number" &&
    typeof myDest.lat === "number" &&
    typeof myDest.lng === "number";

  const hasOtherCoords =
    typeof otherOrigin.lat === "number" &&
    typeof otherOrigin.lng === "number" &&
    typeof otherDest.lat === "number" &&
    typeof otherDest.lng === "number";

  if (hasMyCoords && hasOtherCoords) {
    // You already have this helper; importing from "../utils/matching" above.
    // If it's in this same file, just call it directly.
    const startDist = haversineDistanceMeters(
      { lat: myOrigin.lat, lng: myOrigin.lng },
      { lat: otherOrigin.lat, lng: otherOrigin.lng }
    );
    const endDist = haversineDistanceMeters(
      { lat: myDest.lat, lng: myDest.lng },
      { lat: otherDest.lat, lng: otherDest.lng }
    );

    // Convert distances into 0..1 scores (closer = higher)
    // 0 m  -> 1.0
    // 2km+ -> ~0
    const distToScore = (dMeters) => {
      const km = dMeters / 1000;
      if (km >= 2) return 0;
      return 1 - km / 2;
    };

    const startScore = distToScore(startDist);
    const endScore = distToScore(endDist);

    // Weight coordinates fairly high
    score += 0.3 * startScore + 0.3 * endScore;
  }

  // 3) Slight bonus if same matchMode is explicitly set
  if (myTrip.matchMode && otherTrip.matchMode) {
    if (myTrip.matchMode === otherTrip.matchMode) {
      score += 0.1;
    }
  }

  // clamp to [0, 1]
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return score;
}

