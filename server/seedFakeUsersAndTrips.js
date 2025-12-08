require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const admin = require("firebase-admin");

const User = require("./models/User");

//  Mongo connection
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in .env");
  }
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB (seed script)");
}

// Firestore connection 
const serviceAccount = require(path.join(
  __dirname,
  "gethomesafe-220f1-firebase-adminsdk-fbsvc-a09d839c96.json"
));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const firestore = admin.firestore();
console.log("✅ Connected to Firestore (seed script)");

// Fake data 

const NAMES = [
  "Alex Rivera",
  "Jordan Chen",
  "Maya Patel",
  "Samir Ali",
  "Emily Johnson",
  "Chris Martinez",
  "Taylor Brooks",
  "Nina Lopez",
  "Omar Hassan",
  "Grace Kim",
  "Daniel Green",
  "Rachel Cohen",
  "Isaac Turner",
  "Priya Singh",
  "Ben Carter",
  "Hannah Lewis",
  "Felix Nguyen",
  "Olivia Parker",
  "Miguel Santos",
  "Lauren Price",
];

const BIOS = [
  "Loves long evening walks and podcasts.",
  "Night-owl grad student walking home from campus most days.",
  "Enjoys city walks, good coffee, and true crime podcasts.",
  "Usually heading back from the library or the gym.",
  "Big fan of safe, well-lit routes around Philly.",
  "Walks home from University City most weeknights.",
  "Enjoys exploring new neighborhoods at a slow pace.",
  "Often traveling between campus and the train station.",
  "Prefers walking in small groups and checking in.",
  "Dog person, coffee person, walks almost everywhere.",
];

const SPOTS = [
  {
    text: "Clark Park",
    lat: 39.9489,
    lng: -75.2159,
  },
  {
    text: "30th Street Station",
    lat: 39.9556,
    lng: -75.1820,
  },
  {
    text: "Rittenhouse Square",
    lat: 39.9489,
    lng: -75.1710,
  },
  {
    text: "Penn Campus (Locust Walk)",
    lat: 39.9522,
    lng: -75.1932,
  },
  {
    text: "Drexel Campus",
    lat: 39.9566,
    lng: -75.1899,
  },
  {
    text: "South Street",
    lat: 39.9410,
    lng: -75.1552,
  },
  {
    text: "Fishtown",
    lat: 39.9696,
    lng: -75.1340,
  },
  {
    text: "Old City",
    lat: 39.9496,
    lng: -75.1455,
  },
];

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function pickTwoDistinctSpots() {
  const a = pickRandom(SPOTS);
  let b = pickRandom(SPOTS);
  // avoid identical origin/destination
  for (let i = 0; i < 5 && b.text === a.text; i++) {
    b = pickRandom(SPOTS);
  }
  return [a, b];
}

// Seed 
async function seed() {
  try {
    await connectMongo();

    console.log("Clearing existing seed users & trips (optional)...");
    // If you only want to clear seed data, you could add a flag / filter.
    // For now we just don't delete anything to avoid nuking real data.
    // Uncomment if you want to wipe:
    console.log("Clearing ALL users & trips...");
    await User.deleteMany({ ratingAverage: 5.0, ratingCount: { $gt: 0 } });
    await firestore.collection("trips").get().then((snap) => {
      const batch = firestore.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    });
    await firestore.collection("users").get().then((snap) => {
      const batch = firestore.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    });
    const passwordHash = await bcrypt.hash("testpassword123", 10);
    const usersToCreate = NAMES.length;

    console.log(`🔄 Creating ${usersToCreate} fake users...`);

    for (let i = 0; i < usersToCreate; i++) {
      const name = NAMES[i];
      const phone = `+1215${(1000000 + i).toString().slice(-7)}`; // +1 215 xxx xxxx
      const bio = pickRandom(BIOS);

      const ratingCount = 3 + Math.floor(Math.random() * 40); // 3–42 reviews

      const mongoUser = await User.create({
        name,
        phone,
        passwordHash,
        agreedToGuidelines: true,
        bio,
        ratingAverage: 5.0,
        ratingCount,
      });

      const userId = mongoUser._id.toString();

      // Mirror profile into Firestore "users" collection for FaceTime matching
      const userDocRef = firestore.collection("users").doc(userId);
      await userDocRef.set({
        name,
        phone,
        description: bio,
        prefersVideoFirst: Math.random() < 0.5,
        campusOnly: Math.random() < 0.3,
        ratingAverage: 5.0,
        ratingCount,
        createdAt: new Date().toISOString(),
      });

      // Create 2 trips per user around Philly
      const tripsCol = firestore.collection("trips");
      for (let t = 0; t < 2; t++) {
        const [origin, destination] = pickTwoDistinctSpots();
        const inPerson = t === 0; // first trip in-person, second virtual

        const start = new Date();
        start.setMinutes(start.getMinutes() - Math.floor(Math.random() * 30)); // sometime in the last 30 min
        const end = new Date(start.getTime() + 45 * 60000); // +45 minutes

        await tripsCol.add({
          userId,
          origin: {
            text: origin.text,
            lat: origin.lat,
            lng: origin.lng,
          },
          destination: {
            text: destination.text,
            lat: destination.lat,
            lng: destination.lng,
          },
          matchMode: inPerson ? "in_person" : "virtual_only",
          plannedStartTime: start.toISOString(),
          plannedEndTime: end.toISOString(),
          status: "searching",
          activeMatchUserId: null,
          excludedUserIds: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log(`✅ Created user + trips for: ${name}`);
    }

    console.log("Seeding complete.");
  } catch (err) {
    console.error("Seed error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
