import { Router } from "express";
import { ObjectId } from "mongodb";

const PAGE_SIZE = 15;

// All routes are mounted behind requireAuth. Every group-specific route checks that
// req.userId is a member of the group before reading or changing anything.
export default function createGroupRoutes(db, io, hashMap) {
  const router = Router();

  async function isMember(groupid, userId) {
    if (typeof groupid !== "string" || !groupid) return false;
    const doc = await db.collection("group_members").findOne({ group_id: groupid, user_id: userId });
    return Boolean(doc);
  }

  // Wraps a handler so it only runs for members of the group named by `field` in the body.
  const membersOnly = (field, handler) => async (req, res) => {
    try {
      if (!(await isMember(req.body[field], req.userId))) {
        return res.status(403).json({ message: "You are not a member of this group" });
      }
      await handler(req, res);
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };

  function fetchGroupHistory(match) {
    return db.collection("groupmessages").aggregate([
      { $match: match },
      { $sort: { sent_time: -1 } },
      { $limit: PAGE_SIZE },
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
  }

  router.post("/creategroup", async (req, res) => {
    const groupname = typeof req.body.groupname === "string" ? req.body.groupname.trim() : "";
    const time = String(req.body.time ?? "");
    if (!groupname) return res.status(400).json({ message: "Group name is required" });

    try {
      const groupExists = await db.collection("groups").findOne({ name: groupname });
      if (groupExists) {
        return res.status(400).json({ message: "Group Name already exists" });
      }
      const result = await db.collection("groups").insertOne({
        name: groupname,
        created_by: req.userId,
        created_at: time,
      });
      const groupid = result.insertedId.toString();
      // The creator is always the first member.
      await db.collection("group_members").insertOne({
        group_id: groupid,
        user_id: req.userId,
        joined_at: time,
      });
      res.status(201).json({ groupid });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.post("/updateGroupName", membersOnly("groupid", async (req, res) => {
    const newName = typeof req.body.newName === "string" ? req.body.newName.trim() : "";
    if (!newName) return res.status(400).json({ message: "newName is required" });

    const nameTaken = await db.collection("groups").findOne({ name: newName });
    if (nameTaken) {
      return res.status(400).json({ message: "Group name already taken" });
    }
    await db.collection("groups").updateOne(
      { _id: new ObjectId(req.body.groupid) },
      { $set: { name: newName } }
    );
    res.status(200).json({ message: "Group name updated" });
  }));

  router.post("/fetchGroupInfo", membersOnly("clickedGroupid", async (req, res) => {
    const result = await db.collection("groups").findOne(
      { _id: new ObjectId(req.body.clickedGroupid) },
      { projection: { created_at: 1, _id: 0 } }
    );
    res.status(201).json({ groupinfo: result });
  }));

  router.post("/addmemberstogroup", membersOnly("groupid", async (req, res) => {
    const { groupid, checkedItems, timeAddmambers } = req.body;
    if (!Array.isArray(checkedItems)) {
      return res.status(400).json({ message: "checkedItems must be a list of user ids" });
    }

    // Only real users, each once, and only people who aren't already members.
    const requested = [...new Set(checkedItems.filter((id) => typeof id === "string" && ObjectId.isValid(id)))];
    const existing = await db.collection("group_members")
      .find({ group_id: groupid, user_id: { $in: requested } }, { projection: { user_id: 1 } })
      .toArray();
    const existingIds = new Set(existing.map((m) => m.user_id));
    const candidates = requested.filter((id) => !existingIds.has(id));
    const users = await db.collection("users")
      .find({ _id: { $in: candidates.map((id) => new ObjectId(id)) } }, { projection: { _id: 1 } })
      .toArray();

    if (users.length > 0) {
      await db.collection("group_members").insertMany(
        users.map((u) => ({
          group_id: groupid,
          user_id: u._id.toString(),
          joined_at: String(timeAddmambers ?? ""),
        }))
      );
    }
    res.status(201).json({ message: "Members Added Successfully" });
  }));

  router.post("/getgroupmembers", membersOnly("clickedGroupid", async (req, res) => {
    const response = await db.collection("group_members").aggregate([
      { $match: { group_id: req.body.clickedGroupid } },
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
  }));

  router.post("/getgroups", async (req, res) => {
    try {
      const response = await db.collection("group_members").aggregate([
        { $match: { user_id: req.userId } },
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

      res.status(200).json({ groups: response });
    } catch (err) {
      console.error("Database Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Joins the caller's socket to the group room (members only) and returns the latest page.
  router.post("/createroomforgroupandfetchhistory", membersOnly("groupid", async (req, res) => {
    const { groupid } = req.body;
    const socketId = hashMap.get(req.userId);
    const memberSocket = socketId && io.sockets.sockets.get(socketId);
    if (memberSocket) memberSocket.join(groupid);

    res.status(200).json({ history: await fetchGroupHistory({ groupid }) });
  }));

  router.post("/fetchhistoryforgroup", membersOnly("groupid", async (req, res) => {
    const { groupid, time } = req.body;
    if (typeof time !== "string" || !time) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
    res.status(200).json({ history: await fetchGroupHistory({ groupid, sent_time: { $lt: time } }) });
  }));

  return router;
}
