import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();
const uri = process.env.MONGO_URI;
console.log("Connecting to MongoDB Atlas...");
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to:", mongoose.connection.host);
  await mongoose.connection.close();
} catch (err) {
  console.error("Connection failed:", err.message);
}
