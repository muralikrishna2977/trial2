import { MongoClient } from "mongodb";

let db;

export async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI is not defined in .env");
    process.exit(1);
  }
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db("ChatingApp");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  }
}

export function getDb() {
  return db;
}
