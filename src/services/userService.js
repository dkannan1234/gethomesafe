import { db } from "../firebaseClient";
import { doc, getDoc } from "firebase/firestore";

export async function fetchUser(userId) {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`User ${userId} not found`);
  return { id: snap.id, ...snap.data() };
}