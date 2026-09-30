import { Router } from "express";
import { ObjectId } from "mongodb";

export default function createGroupRoutes(db, io, hashMap) {
  const router = Router();

  router.post("/creategroup", async (req, res) => {
    const { groupname, senderid, time } = req.body;
    try {
      const groupExists = await db.collection("groups").findOne({ name: groupname });
      if (groupExists) {
        return res.status(400).json({ message: "Group Name already exists" });
      }
      const result = await db.collection("groups").insertOne({
        name: groupname,
        created_by: senderid,
        created_at: String(time),
      });
      res.status(201).json({ groupid: result.insertedId });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Rename a group
  router.post("/updateGroupName", async (req, res) => {
    const { groupid, newName } = req.body;
    if (!groupid || !newName?.trim()) {
      return res.status(400).json({ message: "groupid and newName are required" });
    }
    try {
      const nameTaken = await db.collection("groups").findOne({ name: newName.trim() });
      if (nameTaken) {
        return res.status(400).json({ message: "Group name already taken" });
      }
      await db.collection("groups").updateOne(
        { _id: new ObjectId(groupid) },
        { $set: { name: newName.trim() } }
      );
      res.status(200).json({ message: "Group name updated" });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.post("/fetchGroupInfo", async (req, res) => {
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

  router.post("/addmemberstogroup", async (req, res) => {
    const { groupid, checkedItems, timeAddmambers } = req.body;
    try {
      const members = checkedItems.map((userId) => ({
        group_id: groupid,
        user_id: userId,
        joined_at: String(timeAddmambers),
      }));
      await db.collection("group_members").insertMany(members);
      res.status(201).json({ message: "Members Added Successfully" });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.post("/getgroupmembers", async (req, res) => {
    const { clickedGroupid } = req.body;
    try {
      const response = await db.collection("group_members").aggregate([
        { $match: { group_id: clickedGroupid } },
        { $addFields: { user_id_object: { $toObjectId: "$user_id" } } },
        {
          $lookup: {
            from: "users",
            localField: "user_id_object",
            foreignField: "_id",
            as: "userInfo",
          },
        },
        { $unwind: "$userInfo" },
        { $project: { friend_name: "$userInfo.name", friend_id: "$user_id" } },
      ]).toArray();
      res.status(201).json({ groupMembers: response });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.post("/getgroups", async (req, res) => {
    const { senderid } = req.body;
    if (!senderid) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
    try {
      const response = await db.collection("group_members").aggregate([
        { $match: { user_id: senderid } },
        { $addFields: { group_id_object: { $toObjectId: "$group_id" } } },
        {
          $lookup: {
            from: "groups",
            localField: "group_id_object",
            foreignField: "_id",
            as: "groupDetails",
          },
        },
        { $unwind: { path: "$groupDetails", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, groupid: "$group_id", name: "$groupDetails.name" } },
      ]).toArray();

      res.status(200).json({ groups: response.length > 0 ? response : [] });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.post("/createroomforgroupandfetchhistory", async (req, res) => {
    const { groupid, senderid } = req.body;
    const socketId = hashMap.get(senderid);
    if (socketId) {
      const memberSocket = io.sockets.sockets.get(socketId);
      if (memberSocket) {
        memberSocket.join(groupid);
      } else {
        console.log(`Socket not found for user ${senderid}`);
      }
    }

    try {
      const chatData = await db.collection("groupmessages").aggregate([
        { $match: { groupid } },
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
            replyTo: 1,
          },
        },
      ]).toArray();
      res.status(200).json({ history: chatData });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/fetchhistoryforgroup", async (req, res) => {
    const { groupid, time } = req.body;
    try {
      const chatData = await db.collection("groupmessages").aggregate([
        { $match: { groupid, sent_time: { $lt: time } } },
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
            replyTo: 1,
          },
        },
      ]).toArray();
      res.status(200).json({ history: chatData });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
