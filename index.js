// Must be the first import: ES module imports run before any code in this file,
// so modules like config/cloudinary.js would otherwise read process.env too early.
import "dotenv/config";

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import http from "http";
import { Server } from "socket.io";

import { connectDB, getDb } from "./config/db.js";
import createAuthRoutes from "./routes/authRoutes.js";
import createContactRoutes from "./routes/contactRoutes.js";
import createChatRoutes from "./routes/chatRoutes.js";
import createGroupRoutes from "./routes/groupRoutes.js";
import createProfileRoutes from "./routes/profileRoutes.js";
import createUploadRoutes from "./routes/uploadRoutes.js";
import { hashMap, onlinestatus, initSocketHandlers } from "./sockets/socketHandler.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://muralikrishna2977.github.io",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

await connectDB();
const db = getDb();

app.get("/ping", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running!" });
});

app.use("/", createAuthRoutes(db, hashMap));
app.use("/", createContactRoutes(db));
app.use("/", createChatRoutes(db, io, hashMap));
app.use("/", createGroupRoutes(db, io, hashMap));
app.use("/", createProfileRoutes(db));
app.use("/", createUploadRoutes());

initSocketHandlers(io, db);

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
