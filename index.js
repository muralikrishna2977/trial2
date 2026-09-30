// Must be the first import: ES module imports run before any code in this file,
// so modules like config/cloudinary.js would otherwise read process.env too early.
import "dotenv/config";

import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { connectDB, getDb } from "./config/db.js";
import { requireAuth, socketAuth } from "./middleware/auth.js";
import createAuthRoutes from "./routes/authRoutes.js";
import createContactRoutes from "./routes/contactRoutes.js";
import createChatRoutes from "./routes/chatRoutes.js";
import createGroupRoutes from "./routes/groupRoutes.js";
import createProfileRoutes from "./routes/profileRoutes.js";
import createUploadRoutes from "./routes/uploadRoutes.js";
import { hashMap, initSocketHandlers } from "./sockets/socketHandler.js";

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is not defined in .env");
  process.exit(1);
}

// Browser origins allowed to call the API. Override with a comma-separated CORS_ORIGINS.
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:5173,http://localhost:5174,https://muralikrishna2977.github.io"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

await connectDB();
const db = getDb();

app.get("/ping", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running!" });
});

// Public: /signup and /signin (its /findifexist route requires auth itself).
app.use("/", createAuthRoutes(db, hashMap));

// Everything below requires a valid token.
app.use(requireAuth);
app.use("/", createContactRoutes(db));
app.use("/", createChatRoutes(db, io, hashMap));
app.use("/", createGroupRoutes(db, io, hashMap));
app.use("/", createProfileRoutes(db));
app.use("/", createUploadRoutes());

io.use(socketAuth);
initSocketHandlers(io, db);

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
