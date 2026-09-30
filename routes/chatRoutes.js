import { Router } from "express";

export default function createChatRoutes(db, io, hashMap) {
  const router = Router();

  router.post("/sendmessageinchat", async (req, res) => {
    const { senderid, reciverid, sendmessage, time, fileUrl, fileType, filename, replyTo } = req.body;
    const chatId = [senderid, reciverid].sort().join("_");

    try {
      const doc = {
        chatId,
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
    const { senderid, reciverid } = req.body;
    if (!senderid || !reciverid) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
    const chatId = [senderid, reciverid].sort().join("_");

    try {
      const chatData = await db.collection("messages")
        .find({ chatId })
        .sort({ time: -1 })
        .limit(15)
        .toArray();
      res.status(200).json({ history: chatData });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/gethistory", async (req, res) => {
    const { senderid, reciverid, time } = req.body;
    if (!senderid || !reciverid || !time) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
    const chatId = [senderid, reciverid].sort().join("_");

    try {
      const messages = await db.collection("messages")
        .find({ chatId, time: { $lt: time } })
        .sort({ time: -1 })
        .limit(15)
        .toArray();
      res.status(200).json({ history: messages });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
