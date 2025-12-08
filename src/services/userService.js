// src/services/userService.js

import { db } from "../firebaseClient";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// --- Helpers ---

async function fetchUserFromApi(userId) {
  const res = await fetch(`${API_URL}/api/users/${userId}`);

  if (res.status === 404) {
    // Not in Mongo – let caller try Firestore
    return null;
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.warn(
      "[userService] API error fetching user",
      userId,
      "status:",
      res.status,
      "body:",
      bodyText
    );
    throw new Error(
      `API error fetching user ${userId} (status ${res.status})`
    );
  }

  const data = await res.json();

  return {
    // NORMALIZE id vs _id here
    id: data.id || data._id || userId,
    name: data.name || data.displayName || "Friend",
    phone: data.phone || "",
    ratingAverage: data.ratingAverage ?? null,
    ratingCount: data.ratingCount ?? 0,
    bio: data.bio || "",
    age: data.age ?? null,
    pronouns: data.pronouns || "",
  };
}

async function fetchUserFromFirestore(userId) {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();

  return {
    id: userId,
    name: data.name || data.displayName || "Friend",
    phone: data.phone || "",
    ratingAverage: data.ratingAverage ?? null,
    ratingCount: data.ratingCount ?? 0,
    bio: data.bio || "",
    age: data.age ?? null,
    pronouns: data.pronouns || "",
  };
}

// --- Public API ---

export async function fetchUser(userId) {
  if (!userId) {
    throw new Error("No userId provided to fetchUser");
  }

  // Because you said the ID string is the same in both systems,
  // we don't need fancy detection – just try both.

  // 1) Try Mongo / Node API first
  try {
    const apiUser = await fetchUserFromApi(userId);
    if (apiUser) return apiUser;
  } catch (e) {
    console.warn(
      "[userService] API fetchUser failed, trying Firestore:",
      e.message
    );
  }

  // 2) Fallback to Firestore
  const fsUser = await fetchUserFromFirestore(userId);
  if (fsUser) return fsUser;

  // 3) Nothing worked
  throw new Error(`User ${userId} not found in API or Firestore`);
}

export async function rateUser(userId, rating) {
  if (!userId) {
    throw new Error("No userId provided to rateUser");
  }
  if (typeof rating !== "number" || rating <= 0) {
    throw new Error("Invalid rating value");
  }

  // 1) Try to rate via Node/Mongo API first
  try {
    const res = await fetch(`${API_URL}/api/users/${userId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return data; // API is the source of truth when present
    }

    if (res.status !== 404) {
      // 404 = "user not in Mongo" → we'll fallback to Firestore.
      throw new Error(
        data.message || `API rating failed (status ${res.status})`
      );
    }
  } catch (e) {
    console.warn(
      "[userService] API rateUser failed, falling back to Firestore:",
      e.message
    );
  }

  // 2) Fallback rating logic in Firestore
  const ref = doc(db, "users", userId);

  await updateDoc(ref, {
    ratingTotal: increment(rating),
    ratingCount: increment(1),
  });

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(
      `User ${userId} not found in Firestore when updating rating`
    );
  }

  const data = snap.data();
  const total = data.ratingTotal ?? 0;
  const count = data.ratingCount || 1;
  const avg = total / count;

  await updateDoc(ref, { ratingAverage: avg });

  return {
    ratingAverage: avg,
    ratingCount: count,
  };
}
