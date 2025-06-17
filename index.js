// import express from "express";
// const app = express();

// const PORT = process.env.PORT || 3000;

// app.get("/", (req, res) => {
//   res.send("Hello, Railway!");
// });

// app.get("/ping", (req, res) => {
//   res.send("pong");
// });

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });


import dotenv from "dotenv";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import http from "http";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { Server } from "socket.io";
import streamifier from "streamifier";

dotenv.config(); // Load environment variables

const app = express();
const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://muralikrishna2977.github.io"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});


const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;
const jwtSecret = process.env.JWT_SECRET;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage(); // Store files in memory before uploading
const upload = multer({ storage });

if (!mongoUri) {
  console.error("❌ MONGO_URI is not defined in .env");
  process.exit(1); // Stop the server if no MongoDB URI is provided
}

app.use(cors());
app.use(express.json());
app.use(bodyParser.json()); // You can remove this if not needed

let db;
async function connectDB() {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db("ChatingApp");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1); // Exit if database connection fails
  }
}
connectDB();

const hashMap = new Map();
const onlinestatus = new Map();

app.get("/ping", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running!" });
});

// File Upload Route
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res.status(400).json({ message: "No file uploaded" });

    // Upload file to Cloudinary using a stream
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto" },
        (error, uploadedFile) => {
          if (error) reject(error);
          else resolve(uploadedFile);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(stream);
    });

    const uploadedFile = await uploadPromise;
    res.status(200).json({ url: uploadedFile.secure_url });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// Signup Route
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await db.collection("users").findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection("users").insertOne({ name, email, password: hashedPassword });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Signin Route
app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await db.collection("users").findOne({ email });
    const userId=user._id.toString();

    if (!user) {
      return res.status(400).json({ message: "No such user" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    if (hashMap.has(userId)) {
      return res.status(400).json({ message: "Multiple logins are not allowed. This account is already in use." });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email: user.email },
      jwtSecret,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      userid: userId,
      name: user.name,
      email: user.email,
      token,
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/findifexist", async (req, res) => {
  const { member } = req.body;
  try {
    const contacts = await db.collection("users").findOne(
      { email: member },
      { projection: { name: 1, _id: 1 } }
    );
    res.status(201).json({ contacts: contacts ? [contacts] : [] });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/addfriend", async (req, res) => {
  const { senderid, fri_id, fri_name } = req.body;

  try {
    // Add friend to sender's document
    await db.collection("friends").updateOne(
      { userid: senderid },
      { $addToSet: { friends: { friend_id: fri_id, friend_name: fri_name } } },
      { upsert: true }
    );
    res.status(201).json({ message: "Friend added successfully" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/contacts", async (req, res) => {
  const { senderid } = req.body;
  try {
    const contacts = await db.collection("friends").find(
      { userid: senderid },
      { projection: { friends: 1, _id: 0 } }
    ).toArray();
    const friendsArray = contacts.length > 0 ? contacts[0].friends : [];
    res.status(201).json({ contacts: friendsArray });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/getname", async (req, res) => {
  const { senderid } = req.body;
  try {
    const response = await db.collection("users").findOne(
      { _id: new ObjectId(senderid) },
      { projection: { name: 1, _id: 0 } }
    );
    res.status(201).json({ name: response ? response.name : null });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/sendmessageinchat", async (req, res) => {
  const { senderid, reciverid, sendmessage, time, fileUrl, fileType, filename } = req.body;
  const chatId = [senderid, reciverid].sort().join("_"); // Ensure consistent chat ID

  try {
    await db.collection("messages").insertOne({
      chatId,
      senderid,
      reciverid,
      sendmessage,
      time,
      fileUrl,
      fileType,
      fileName: filename,
    });

    const receiverSocketId = hashMap.get(reciverid);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("recived_message", {
        sendmessage,
        senderid,
        reciverid,
        time,
        fileUrl,
        fileType,
        filename,
      });
    }

    res.status(201).json({ message: "Message sent" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/gethistory", async (req, res) => {
  const { senderid, reciverid, time } = req.body;
  if (!senderid || !reciverid || !time) {
    return res.status(400).json({ message: "Invalid request parameters" });
  }
  const chatId = [senderid, reciverid].sort().join("_");

  try {
    const messages = await db.collection("messages")
      .find({
        chatId: chatId,
        time: { $lt: time },
      })
      .sort({ time: -1 })
      .limit(15)
      .toArray();

    res.status(200).json({ history: messages });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/gethistoryinitial", async (req, res) => {
  const { senderid, reciverid } = req.body;
  if (!senderid || !reciverid) {
    return res.status(400).json({ message: "Invalid request parameters" });
  }
  const chatId = [senderid, reciverid].sort().join("_");

  try {
    const chatData = await db.collection("messages")
      .find({ chatId: chatId })
      .sort({ time: -1 })
      .limit(15)
      .toArray();
    res.status(200).json({ history: chatData });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Modified "editsendername" Route
app.post("/editsendername", async (req, res) => {
  const { name, senderid } = req.body;
  try {
    // Update the user's name using _id conversion
    await db.collection("users").updateOne(
      { _id: new ObjectId(senderid) },
      { $set: { name: name } }
    );

    // Update the name in friends list
    // await db.collection("friends").updateMany(
    //   { "friends.friend_id": senderid },
    //   { $set: { "friends.$.friend_name": editnameofSender } }
    // );

    res.status(201).json({ message: "Name Edited" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/creategroup", async (req, res) => {
  const { groupname, senderid, time } = req.body;
  const createdat = String(time);

  try {
    const groupExists = await db.collection("groups").findOne({ name: groupname });
    if (groupExists) {
      return res.status(400).json({ message: "Group Name already exists" });
    }

    const result = await db.collection("groups").insertOne({
      name: groupname,
      created_by: senderid,
      created_at: createdat,
    });

    res.status(201).json({ groupid: result.insertedId });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/fetchGroupInfo", async (req, res) => {
  const { clickedGroupid } = req.body;
  try {
    const result = await db.collection("groups").findOne(
      { _id: new ObjectId(clickedGroupid) },
      { projection: { created_at: 1, _id: 0 } }
    );
    res.status(201).json({ groupinfo: result });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/addmemberstogroup", async (req, res) => {
  const { groupid, checkedItems, timeAddmambers } = req.body;
  const joined_at = String(timeAddmambers);

  try {
    const members = checkedItems.map((userId) => ({
      group_id: groupid,
      user_id: userId,
      joined_at: joined_at,
    }));

    await db.collection("group_members").insertMany(members);
    res.status(201).json({ message: "Members Added Successfully" });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/getgroupmembers", async (req, res) => {
  const { clickedGroupid } = req.body;
  try {
    const response = await db.collection("group_members").aggregate([
      { $match: { group_id: clickedGroupid } },
      {
        $addFields: {
          user_id_object: { $toObjectId: "$user_id" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user_id_object",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      {
        $project: {
          friend_name: "$userInfo.name",
          friend_id: "$user_id",
        },
      },
    ]).toArray();

    res.status(201).json({ groupMembers: response });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/createroomforgroupandfetchhistory", async (req, res) => {
  const { groupid, senderid } = req.body;
  const roomId = groupid;
  const socketId = hashMap.get(senderid);
  if (socketId) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (memberSocket) {
      memberSocket.join(roomId);
    } else {
      console.log(`Socket not found for user ${senderid}`);
    }
  }

  try {
    const chatData = await db.collection("groupmessages").aggregate([
      { $match: { groupid: groupid } },
      { $sort: { sent_time: -1 } },
      { $limit: 15 },
      { $addFields: { senderObjectId: { $toObjectId: "$sender_id" } } },
      {
        $lookup: {
          from: "users",
          localField: "senderObjectId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          message: 1,
          sender_id: 1,
          sent_time: 1,
          sender_name: "$userInfo.name",
          fileUrl: 1,
          fileType: 1,
          fileName: 1,
        },
      },
    ]).toArray();
    res.status(200).json({ history: chatData });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/fetchhistoryforgroup", async (req, res) => {
  const { groupid, time } = req.body;

  try {
    const chatData = await db.collection("groupmessages").aggregate([
      {
        $match: {
          groupid: groupid,
          sent_time: { $lt: time },
        },
      },
      { $sort: { sent_time: -1 } },
      { $limit: 15 },
      { $addFields: { senderObjectId: { $toObjectId: "$sender_id" } } },
      {
        $lookup: {
          from: "users",
          localField: "senderObjectId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          message: 1,
          sender_id: 1,
          sent_time: 1,
          sender_name: "$userInfo.name",
          fileUrl: 1,
          fileType: 1,
          fileName: 1,
        },
      },
    ]).toArray();

    res.status(200).json({ history: chatData });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/getgroups", async (req, res) => {
  const { senderid } = req.body;

  if (!senderid) {
    console.error("Error: senderid is missing in request body");
    return res.status(400).json({ message: "Invalid request parameters" });
  }

  try {
    const response = await db.collection("group_members").aggregate([
      { $match: { user_id: senderid } },
      {
        $addFields: {
          group_id_object: { $toObjectId: "$group_id" },
        },
      },
      {
        $lookup: {
          from: "groups",
          localField: "group_id_object",
          foreignField: "_id",
          as: "groupDetails",
        },
      },
      {
        $unwind: {
          path: "$groupDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          groupid: "$group_id",
          name: "$groupDetails.name",
        },
      },
    ]).toArray();

    if (!response || response.length === 0) {
      return res.status(200).json({ groups: [] });
    }

    res.status(200).json({ groups: response });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Socket.IO configuration
io.on("connection", (socket) => {
  socket.on("register_user", async (userId) => {
    const soc = socket.id;
    hashMap.set(userId, soc);
    onlinestatus.set(soc, userId);

    try {
      const result = await db.collection("friends").findOne(
        { userid: userId },
        { projection: { friends: 1, _id: 0 } }
      );

      const friendsList = result?.friends || [];
      if (hashMap.get(userId)) {
        friendsList.forEach((friend) => {
          const socketId = hashMap.get(friend.friend_id);
          if (socketId) {
            io.to(socketId).emit("selfstatus", { userId, status: "online" });
          }
        });
      }
    } catch (err) {
      console.error("Database error:", err);
    }
  });

  socket.on("send-group-message", ({ clickedGroupid: roomId, senderid, sendmessage: message, time: timestamp, sendername, fileUrl, fileType, filename }) => {
    socket.to(roomId).emit("receive-group-message", {
      senderid,
      sendername,
      message,
      timestamp,
      roomId,
      fileUrl,
      fileType,
      fileName: filename,
    });

    const timesta = String(timestamp);

    db.collection("groupmessages").insertOne({
      groupid: roomId,
      sender_id: senderid,
      message,
      sent_time: timesta,
      fileUrl,
      fileType,
      fileName: filename,
    });
  });

  socket.on("onlineofflinestatus", async (userId) => {
    try {
      const result = await db.collection("friends").findOne(
        { userid: userId },
        { projection: { friends: 1, _id: 0 } }
      );

      const friendsList = result?.friends || [];
      if (hashMap.get(userId)) {
        friendsList.forEach((friend) => {
          const socketId = hashMap.get(friend.friend_id);
          if (socketId) {
            io.to(socketId).emit("onofstatus", { userId, status: "online" });
          }
        });
      } else {
        friendsList.forEach((friend) => {
          const socketId = hashMap.get(friend.friend_id);
          if (socketId) {
            io.to(socketId).emit("onofstatus", { userId, status: "offline" });
          }
        });
      }
    } catch (err) {
      console.error("Database error:", err);
    }
  });

  socket.on("disconnect", async () => {
    const userId = onlinestatus.get(socket.id);
    if (!userId) return;

    onlinestatus.delete(socket.id);
    hashMap.delete(userId);

    try {
      const result = await db.collection("friends").findOne(
        { userid: userId },
        { projection: { friends: 1, _id: 0 } }
      );

      const friendsList = result?.friends || [];
      friendsList.forEach((friend) => {
        const socketId = hashMap.get(friend.friend_id);
        if (socketId) {
          io.to(socketId).emit("onofstatus", { userId, status: "offline" });
        }
      });
    } catch (err) {
      console.error("Database error:", err);
    }
  });
});

// Start the server

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});


export { db };
