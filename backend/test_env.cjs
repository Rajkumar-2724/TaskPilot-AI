require("dotenv").config();
console.log("MONGO_URI:", process.env.MONGO_URI ? "SET (first 20 chars: " + process.env.MONGO_URI.substring(0,20) + ")" : "NOT SET");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "SET" : "NOT SET");
console.log("CLIENT_URL:", process.env.CLIENT_URL || "NOT SET");
console.log("PORT:", process.env.PORT || "NOT SET");
