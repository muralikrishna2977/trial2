import { ObjectId } from "mongodb";

export const hashMap = new Map(); // userId -> socketId
export const onlinestatus = new Map(); // socketId -> userId

// Every socket is authenticated by socketAuth (see middleware/auth.js), which sets
// socket.data.userId. Handlers use that id and never trust user ids sent by the client.
export function initSocketHandlers(io, db) {
  async function notifyFriends(userId, event, status) {
    try {
      const result = await db.collection("friends").findOne(
        { userid: userId },
        { projection: { friends: 1, _id: 0 } }
      );
      (result?.friends || []).forEach((friend) => {
        const socketId = hashMap.get(friend.friend_id);
        if (socketId) io.to(socketId).emit(event, { userId, status });
      });
    } catch (err) {
      console.error("Database error:", err);
    }
  }

  io.on("connection", (socket) => {
    const userId = socket.data.userId;

    // Registered on connect from the verified token.
    hashMap.set(userId, socket.id);
    onlinestatus.set(socket.id, userId);
    notifyFriends(userId, "selfstatus", "online");

    socket.on("send-group-message", async (payload = {}) => {
      const { clickedGroupid: roomId, sendmessage: message, time: timestamp, fileUrl, fileType, filename, replyTo } = payload;
      // Sockets only join a group room via /createroomforgroupandfetchhistory, which checks membership.
      if (typeof roomId !== "string" || !socket.rooms.has(roomId)) return;

      try {
        const sender = await db.collection("users").findOne(
          { _id: new ObjectId(userId) },
          { projection: { name: 1 } }
        );

        socket.to(roomId).emit("receive-group-message", {
          senderid: userId,
          sendername: sender?.name ?? "Member",
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
          sender_id: userId,
          message,
          sent_time: String(timestamp),
          fileUrl,
          fileType,
          fileName: filename,
        };
        if (replyTo) doc.replyTo = replyTo;
        await db.collection("groupmessages").insertOne(doc);
      } catch (err) {
        console.error("Database error:", err);
      }
    });

    // Tells the given user's friends whether that user is currently online.
    socket.on("onlineofflinestatus", (targetUserId) => {
      if (typeof targetUserId !== "string") return;
      notifyFriends(targetUserId, "onofstatus", hashMap.get(targetUserId) ? "online" : "offline");
    });

    // Typing indicator — relay to the target user
    socket.on("typing", ({ toUserId } = {}) => {
      const socketId = hashMap.get(toUserId);
      if (socketId) io.to(socketId).emit("user-typing", { fromUserId: userId });
    });

    socket.on("stop-typing", ({ toUserId } = {}) => {
      const socketId = hashMap.get(toUserId);
      if (socketId) io.to(socketId).emit("user-stop-typing", { fromUserId: userId });
    });

    socket.on("disconnect", () => {
      onlinestatus.delete(socket.id);
      // Only clear the mapping if it still points at this socket (not a newer connection).
      if (hashMap.get(userId) !== socket.id) return;
      hashMap.delete(userId);
      notifyFriends(userId, "onofstatus", "offline");
    });
  });
}
