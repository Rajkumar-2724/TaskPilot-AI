import { connectDB } from "./config/db.js";
console.log("Testing DB connection...");
connectDB().then(() => {
  console.log("DB connected");
  process.exit(0);
}).catch((err) => {
  console.error("DB error:", err.message);
  process.exit(1);
});
