// src/services/matchingService.js
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
  if (!snap.exists()) throw new Error(`Trip ${tripId} not found`);
  return { id: snap.id, ...snap.data() };
}

/**
 * Find candidate trips for the given trip.
 * Returns a sorted array: highest score first.
 */
export async function findCandidateMatchesForTrip(myTrip, options = {}) {
  const {
    maxResults = 5,
    minScore = 0.2, // filter out truly bad matches
  } = options;

  const tripsCol = collection(db, "trips");

  // Basic filter: other users, status 'searching'
  const q = query(
    tripsCol,
    where("status", "==", "searching")
    // later: add city/area filters if needed
  );

  const snap = await getDocs(q);
  const myUserId = myTrip.userId;
  const excluded = new Set(myTrip.excludedUserIds || []);

  const candidates = [];

  snap.forEach((docSnap) => {
    const t = { id: docSnap.id, ...docSnap.data() };

    // Skip my own trip
    if (t.userId === myUserId) return;

    // Skip excluded users for this trip
    if (excluded.has(t.userId)) return;

    // Respect match mode (if both trips define one)
    if (myTrip.matchMode && t.matchMode && myTrip.matchMode !== t.matchMode) {
      return;
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
 */
export async function excludeUserForTrip(tripId, userIdToExclude) {
  const ref = doc(db, "trips", tripId);
  await updateDoc(ref, {
    excludedUserIds: arrayUnion(userIdToExclude),
  });
}