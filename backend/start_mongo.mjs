import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

const mongod = new MongoMemoryServer({});  

const uriFile = path.resolve("C:/Users/rkraj/OneDrive/Desktop/TaskPilot-AI - Copy/backend/mongo_uri.txt");

async function start() {
  await mongod.start();
  const uri = mongod.getUri();
  console.log("MongoDB Memory Server URI:", uri);
  fs.writeFileSync(uriFile, uri);
  await mongoose.connect(uri);
  console.log("Connected to MongoDB Memory Server");
}

start().catch((e) => {
  console.error("Failed to start memory server:", e);
  process.exit(1);
});