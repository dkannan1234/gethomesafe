require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const ids = [
    "692cde99863ec778e8cdc73b",
    "692cdff3863ec778e8cdc746",
    "692d073a02dd151e55b0f690",
    "6935fa4a440711ccb82cb5a4",
    "693604a721318ae7b22b3a43",
  ];

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  const result = await User.deleteMany({ _id: { $in: objectIds } });

  console.log("Requested IDs:", ids.length);
  console.log("Actually deleted:", result.deletedCount);

  await mongoose.disconnect();
  console.log("Disconnected");
}

main().catch((err) => {
  console.error("Error in deleteSpecificUsers:", err);
  process.exit(1);
});
