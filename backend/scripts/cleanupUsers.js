import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import User from "../models/User.js";

const MONGO_URI =
  process.env.MONGO_URI_OVERRIDE ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/taskpilot-ai";

const KEEP_EMAIL = "rkrajubhai726@gmail.com";
const DEMO_EMAIL = "admin@gmail.com";
const DEMO_PASSWORD = "admin@123";
const DEMO_NAME = "Admin";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const keep = await User.findOne({ email: KEEP_EMAIL });
  const deleted = await User.deleteMany({ email: { $ne: KEEP_EMAIL } });
  console.log(
    `Kept: ${keep ? `${keep.email} (${keep.role})` : `NONE FOUND (${KEEP_EMAIL})`}`
  );
  console.log(`Deleted ${deleted.deletedCount} user(s)`);

  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    existing.name = DEMO_NAME;
    existing.password = DEMO_PASSWORD;
    existing.role = "Admin";
    existing.isActive = true;
    await existing.save();
    console.log(`Updated ${DEMO_EMAIL} -> role ${existing.role}`);
  } else {
    const created = await User.create({
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      role: "Admin",
    });
    console.log(`Created ${DEMO_EMAIL} -> role ${created.role}`);
  }

  const remaining = await User.find().select("email role isActive");
  console.log("Remaining users:", remaining.map((u) => u.email));

  await mongoose.disconnect();
  console.log("Done");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});