import mongoose from "mongoose";
console.log("Attempting DB connection...");
const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/taskpilot-ai";
console.log("URI:", uri);
const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
console.log("Connected to:", conn.connection.host);
process.exit(0);
