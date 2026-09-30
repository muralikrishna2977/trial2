import { Router } from "express";

const PAGE_SIZE = 15;

// All routes are mounted behind requireAuth. The sender is always req.userId, so a
// user can only send as themselves and only read conversations they are part of.
export default function createChatRoutes(db, io, hashMap) {
  const router = Router();

  const chatIdFor = (a, b) => [a, b].sort().join("_");

  async function isContact(userId, otherId) {
    const doc = await db.collection("friends").findOne({ userid: userId, "friends.friend_id": otherId });
    return Boolean(doc);
  }

  router.post("/sendmessageinchat", async (req, res) => {
    const senderid = req.userId;
    const { reciverid, sendmessage, time, fileUrl, fileType, filename, replyTo } = req.body;
    if (typeof reciverid !== "string" || !reciverid) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
      if (!(await isContact(senderid, reciverid))) {
        return res.status(403).json({ message: "You can only message your contacts" });
      }

      const doc = {
        chatId: chatIdFor(senderid, reciverid),
        senderid,
        reciverid,
        sendmessage,
        time,
        fileUrl,
        fileType,
        fileName: filename,
      };
      if (replyTo) doc.replyTo = replyTo;
      await db.collection("messages").insertOne(doc);

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
          replyTo,
        });
      }

      res.status(201).json({ message: "Message sent" });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/gethistoryinitial", async (req, res) => {
    const { reciverid } = req.body;
    if (typeof reciverid !== "string" || !reciverid) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
      const chatData = await db.collection("messages")
        .find({ chatId: chatIdFor(req.userId, reciverid) })
        .sort({ time: -1 })
        .limit(PAGE_SIZE)
        .toArray();
      res.status(200).json({ history: chatData });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/gethistory", async (req, res) => {
    const { reciverid, time } = req.body;
    if (typeof reciverid !== "string" || !reciverid || typeof time !== "string" || !time) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    try {
      const messages = await db.collection("messages")
        .find({ chatId: chatIdFor(req.userId, reciverid), time: { $lt: time } })
        .sort({ time: -1 })
        .limit(PAGE_SIZE)
        .toArray();
      res.status(200).json({ history: messages });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
