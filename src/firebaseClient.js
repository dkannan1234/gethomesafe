import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAJhv7reZJdq3Klq4Df-aVhwTISN6YA-kQ",
  authDomain: "gethomesafe-220f1.firebaseapp.com",
  projectId: "gethomesafe-220f1",
  storageBucket: "gethomesafe-220f1.firebasestorage.app",
  messagingSenderId: "386984728363",
  appId: "1:386984728363:web:d61980ac3c3f73464f976e",
  measurementId: "G-M0P3TWGBWJ"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);