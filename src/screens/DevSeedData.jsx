import { useState } from "react";
import { db } from "../firebaseClient";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const ui = { /* ...same styles as before... */ };

export default function DevSeedData() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const seed = async () => {
    setStatus("running");
    setError("");

    try {
      // USERS
      const users = [
        { id: "alice", name: "Alice", age: 21, pronouns: "she/her", facetimeHandle: "alice.iphone@example.com",
          ratingAverage: 4.7, ratingCount: 9, totalMatches: 5, totalTripsCompleted: 10,
          prefersVideoFirst: true, willingToMeetInPerson: true, campusOnly: true },
        { id: "bob", name: "Bob", age: 22, pronouns: "he/him", facetimeHandle: "bob.ft@example.com",
          ratingAverage: 4.3, ratingCount: 6, totalMatches: 3, totalTripsCompleted: 6,
          prefersVideoFirst: false, willingToMeetInPerson: true, campusOnly: false },
        { id: "carla", name: "Carla", age: 20, pronouns: "she/they", facetimeHandle: "carla-safe@example.com",
          ratingAverage: 4.9, ratingCount: 12, totalMatches: 8, totalTripsCompleted: 12,
          prefersVideoFirst: true, willingToMeetInPerson: true, campusOnly: true },
        { id: "dave", name: "Dave", age: 23, pronouns: "he/him", facetimeHandle: "dave.walks@example.com",
          ratingAverage: 4.1, ratingCount: 4, totalMatches: 2, totalTripsCompleted: 3,
          prefersVideoFirst: false, willingToMeetInPerson: true, campusOnly: false },
        { id: "emily", name: "Emily", age: 19, pronouns: "she/her", facetimeHandle: "emily.night@example.com",
          ratingAverage: 4.8, ratingCount: 7, totalMatches: 4, totalTripsCompleted: 6,
          prefersVideoFirst: true, willingToMeetInPerson: false, campusOnly: true }
      ];

      for (const u of users) {
        await setDoc(doc(db, "users", u.id), {
          ...u,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // SAFE LOCATIONS
      const safeLocations = [
        {
          id: "30th-st-station",
          name: "30th Street Station",
          type: "transit_hub",
          lat: 39.955615,
          lng: -75.181923,
          city: "Philadelphia",
          area: "University City",
          openHours: "24/7",
          isWellLit: true,
          hasSecurity: true,
          tags: ["indoor", "crowded", "cameras"],
          successfulMeetupsCount: 42
        },
        {
          id: "penn-museum",
          name: "Penn Museum",
          type: "campus",
          lat: 39.94933,
          lng: -75.1910,
          city: "Philadelphia",
          area: "University City",
          isWellLit: true,
          hasSecurity: true,
          tags: ["campus", "museum"],
          successfulMeetupsCount: 15
        },
        {
          id: "houston-hall",
          name: "Houston Hall",
          type: "campus",
          lat: 39.9515,
          lng: -75.1925,
          city: "Philadelphia",
          area: "University City",
          isWellLit: true,
          hasSecurity: true,
          tags: ["student_center", "indoor"],
          successfulMeetupsCount: 20
        },
        {
          id: "rittenhouse-square",
          name: "Rittenhouse Square",
          type: "public_park",
          lat: 39.9489,
          lng: -75.1710,
          city: "Philadelphia",
          area: "Center City",
          isWellLit: true,
          hasSecurity: false,
          tags: ["park", "crowded_evenings"],
          successfulMeetupsCount: 10
        }
      ];

      for (const s of safeLocations) {
        await setDoc(doc(db, "safe_locations", s.id), {
          ...s,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

      // TRIPS – some campus-to-campus, some campus-to-center-city, some further away
      const trips = [
        // Campus → Campus
        {
          id: "trip_alice_1",
          userId: "alice",
          origin: {
            text: "30th Street Station, Philadelphia, PA",
            lat: 39.955615,
            lng: -75.181923
          },
          destination: {
            text: "Houston Hall, Philadelphia, PA",
            lat: 39.9515,
            lng: -75.1925
          }
        },
        // Dorm-ish → 30th St
        {
          id: "trip_bob_1",
          userId: "bob",
          origin: {
            text: "Near Penn Bookstore, Philadelphia, PA",
            lat: 39.9525,
            lng: -75.1920
          },
          destination: {
            text: "30th Street Station, Philadelphia, PA",
            lat: 39.955615,
            lng: -75.181923
          }
        },
        // Museum → 30th St
        {
          id: "trip_carla_1",
          userId: "carla",
          origin: {
            text: "Penn Museum, Philadelphia, PA",
            lat: 39.94933,
            lng: -75.1910
          },
          destination: {
            text: "30th Street Station, Philadelphia, PA",
            lat: 39.955615,
            lng: -75.181923
          }
        },
        // Campus → Rittenhouse (Center City)
        {
          id: "trip_dave_1",
          userId: "dave",
          origin: {
            text: "Houston Hall, Philadelphia, PA",
            lat: 39.9515,
            lng: -75.1925
          },
          destination: {
            text: "Rittenhouse Square, Philadelphia, PA",
            lat: 39.9489,
            lng: -75.1710
          }
        },
        // Center City → Campus
        {
          id: "trip_emily_1",
          userId: "emily",
          origin: {
            text: "Rittenhouse Square, Philadelphia, PA",
            lat: 39.9489,
            lng: -75.1710
          },
          destination: {
            text: "Penn Museum, Philadelphia, PA",
            lat: 39.94933,
            lng: -75.1910
          }
        }
      ];

      for (const t of trips) {
        await setDoc(doc(db, "trips", t.id), {
          ...t,
          plannedStartTime: now.toISOString(),
          plannedEndTime: inOneHour.toISOString(),
          status: "searching",
          activeMatchId: null,
          excludedUserIds: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setStatus("done");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div style={ui.page}>
      {/* same UI wrapper as before */}
      <button onClick={seed} /* ... */>
        {status === "running" ? "Seeding..." : "Seed sample data"}
      </button>
      {/* status + error */}
    </div>
  );
}
