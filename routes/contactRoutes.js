import { Router } from "express";
import { ObjectId } from "mongodb";

// All routes are mounted behind requireAuth; the caller is always req.userId.
export default function createContactRoutes(db) {
  const router = Router();

  router.post("/addfriend", async (req, res) => {
    const { fri_id, fri_name } = req.body;
    if (typeof fri_id !== "string" || !ObjectId.isValid(fri_id) || fri_id === req.userId) {
      return res.status(400).json({ message: "Invalid contact" });
    }
    try {
      const friend = await db.collection("users").findOne({ _id: new ObjectId(fri_id) });
      if (!friend) return res.status(404).json({ message: "No such user" });

      await db.collection("friends").updateOne(
        { userid: req.userId },
        { $addToSet: { friends: { friend_id: fri_id, friend_name: friend.name ?? fri_name } } },
        { upsert: true }
      );
      res.status(201).json({ message: "Friend added successfully" });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/contacts", async (req, res) => {
    try {
      const contacts = await db.collection("friends").find(
        { userid: req.userId },
        { projection: { friends: 1, _id: 0 } }
      ).toArray();
      const friendsArray = contacts.length > 0 ? contacts[0].friends : [];
      res.status(201).json({ contacts: friendsArray });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/getname", async (req, res) => {
    try {
      const response = await db.collection("users").findOne(
        { _id: new ObjectId(req.userId) },
        { projection: { name: 1, _id: 0 } }
      );
      res.status(201).json({ name: response ? response.name : null });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
