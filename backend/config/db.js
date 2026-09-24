import mongoose from "mongoose";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export const connectDB = async (attempt = 1) => {
  try {
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/taskpilot-ai";
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
    });
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} error: ${err.message}`);
    if (attempt < MAX_RETRIES) {
      console.log(`[DB] Retrying MongoDB connection in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return connectDB(attempt + 1);
    }
    console.error("[DB] Failed to connect to MongoDB after multiple attempts. Server will start without database support.");
  }
};
