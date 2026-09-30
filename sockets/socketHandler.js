export const hashMap = new Map();
export const onlinestatus = new Map();

export function initSocketHandlers(io, db) {
  io.on("connection", (socket) => {
    socket.on("register_user", async (userId) => {
      hashMap.set(userId, socket.id);
      onlinestatus.set(socket.id, userId);

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

    socket.on("send-group-message", ({ clickedGroupid: roomId, senderid, sendmessage: message, time: timestamp, sendername, fileUrl, fileType, filename, replyTo }) => {
      socket.to(roomId).emit("receive-group-message", {
        senderid,
        sendername,
        message,
        timestamp,
        roomId,
        fileUrl,
        fileType,
        fileName: filename,
        replyTo,
      });

      const doc = {
        groupid: roomId,
        sender_id: senderid,
        message,
        sent_time: String(timestamp),
        fileUrl,
        fileType,
        fileName: filename,
      };
      if (replyTo) doc.replyTo = replyTo;
      db.collection("groupmessages").insertOne(doc);
    });

    socket.on("onlineofflinestatus", async (userId) => {
      try {
        const result = await db.collection("friends").findOne(
          { userid: userId },
          { projection: { friends: 1, _id: 0 } }
        );

        const friendsList = result?.friends || [];
        const status = hashMap.get(userId) ? "online" : "offline";
        friendsList.forEach((friend) => {
          const socketId = hashMap.get(friend.friend_id);
          if (socketId) {
            io.to(socketId).emit("onofstatus", { userId, status });
          }
        });
      } catch (err) {
        console.error("Database error:", err);
      }
    });

    // Typing indicator — relay to the target user
    socket.on("typing", ({ toUserId }) => {
      const fromUserId = onlinestatus.get(socket.id);
      const socketId = hashMap.get(toUserId);
      if (socketId && fromUserId) {
        io.to(socketId).emit("user-typing", { fromUserId });
      }
    });

    socket.on("stop-typing", ({ toUserId }) => {
      const fromUserId = onlinestatus.get(socket.id);
      const socketId = hashMap.get(toUserId);
      if (socketId && fromUserId) {
        io.to(socketId).emit("user-stop-typing", { fromUserId });
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
}
