const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

/**
 * Fetch a user profile from the Node/Express API (Mongo).
 * Returns a lightweight user object.
 */
export async function fetchUser(userId) {
  if (!userId) {
    throw new Error("No userId provided to fetchUser");
  }

  const res = await fetch(`${API_URL}/api/users/${userId}`);

  if (res.status === 404) {
    // don't crash the app – let caller substitute a generic profile
    throw new Error(`User ${userId} not found`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to fetch user ${userId}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name || "Walking buddy",
    phone: data.phone || "",
    ratingAverage: data.ratingAverage ?? null,
    ratingCount: data.ratingCount ?? 0,
  };
}

export async function rateUser(userId, rating) {
  const res = await fetch(`${API_URL}/api/users/${userId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to submit rating.");
  }
  return data;
}