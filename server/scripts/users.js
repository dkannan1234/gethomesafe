require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("All users (name, email, phone):");
  const users = await User.find({}, "name email phone").lean();
  users.forEach((u) => {
    console.log(`${u._id}: ${u.name} | ${u.email} | ${u.phone}`);
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
