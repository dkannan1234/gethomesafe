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
  const originDist = haversineDistanceMeters(
    myTrip.origin,
    otherTrip.origin
  );
  const destDist = haversineDistanceMeters(
    myTrip.destination,
    otherTrip.destination
  );

  // Tune these thresholds as needed:
  const originSim = similarityFromDistance(originDist, 1500);  // 1.5km
  const destSim = similarityFromDistance(destDist, 2000);      // 2km

  // Weight destination more than origin if you care more where they end up
  const weightOrigin = 0.4;
  const weightDest = 0.6;

  const raw = weightOrigin * originSim + weightDest * destSim;

  // Optional: penalize huge distances hard
  if (originDist > 5000 && destDist > 5000) {
    return raw * 0.3;
  }

  return raw;
}
