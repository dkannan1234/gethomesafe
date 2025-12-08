import { db } from "../firebaseClient";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { computeMatchScore } from "../utils/matching";

/**
 * Load a trip doc by id.
 */
export async function fetchTrip(tripId) {
  const ref = doc(db, "trips", tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`Trip ${tripId} not found`);
  }
  return { id: snap.id, ...snap.data() };
}

/**
 * Find candidate trips for the given trip.
 * Returns a sorted array: highest score first.
 *
 * Options:
 *   - maxResults (default 5)
 *   - minScore (default 0.2)
 *   - timeWindowMinutes (default 60) — ± window around myTrip.plannedStartTime
 */
export async function findCandidateMatchesForTrip(myTrip, options = {}) {
  const {
    maxResults = 5,
    minScore = 0.2,
    timeWindowMinutes = 60,
  } = options;

  const tripsCol = collection(db, "trips");

  // Only look at others who are currently searching.
  const qTrips = query(tripsCol, where("status", "==", "searching"));
  const snap = await getDocs(qTrips);

  const myUserId = myTrip.userId;
  const excluded = new Set(myTrip.excludedUserIds || []);

  // Parse my trip's planned start time (if any)
  let myStartTimeMs = null;
  if (myTrip.plannedStartTime) {
    const t = new Date(myTrip.plannedStartTime).getTime();
    if (!Number.isNaN(t)) {
      myStartTimeMs = t;
    }
  }
  const timeWindowMs = timeWindowMinutes * 60 * 1000;

  const candidates = [];

  snap.forEach((docSnap) => {
    const t = { id: docSnap.id, ...docSnap.data() };

    // Skip my own trip
    if (t.userId === myUserId) return;

    // Skip excluded users for this trip
    if (excluded.has(t.userId)) return;

    // Respect matchMode if both define it (virtual_only vs in_person)
    if (myTrip.matchMode && t.matchMode && myTrip.matchMode !== t.matchMode) {
      return;
    }

    // Basic time filter if both have a plannedStartTime
    if (myStartTimeMs && t.plannedStartTime) {
      const otherStartMs = new Date(t.plannedStartTime).getTime();
      if (!Number.isNaN(otherStartMs)) {
        const diff = Math.abs(otherStartMs - myStartTimeMs);
        if (diff > timeWindowMs) {
          return; // too far apart in time
        }
      }
    }

    const score = computeMatchScore(myTrip, t);
    if (score >= minScore) {
      candidates.push({ trip: t, score });
    }
  });

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxResults);
}

/**
 * Mark a given userId as excluded for this trip
 * so they won't show up again as a candidate.
 *
 * Note: we *only* use arrayUnion — no indexOf / manual array stuff.
 */
export async function excludeUserForTrip(tripId, userIdToExclude) {
  const ref = doc(db, "trips", tripId);
  await updateDoc(ref, {
    excludedUserIds: arrayUnion(userIdToExclude),
  });
}
