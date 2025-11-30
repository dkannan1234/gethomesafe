const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function createTripRecord({
  userId,
  otherUserId,
  startLocation,
  endLocation,
  tripDate,
}) {
  const res = await fetch(`${API_URL}/api/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      otherUserId,
      startLocation,
      endLocation,
      tripDate,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create trip");
  }

  return res.json();
}

export async function fetchTripsForUser(userId) {
  const res = await fetch(`${API_URL}/api/trips/${userId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch trips");
  }
  return res.json();
}