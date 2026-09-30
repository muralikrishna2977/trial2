import { Router } from "express";
import { ObjectId } from "mongodb";

export default function createContactRoutes(db) {
  const router = Router();

  router.post("/addfriend", async (req, res) => {
    const { senderid, fri_id, fri_name } = req.body;
    try {
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

  router.post("/contacts", async (req, res) => {
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

  router.post("/getname", async (req, res) => {
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

  return router;
}
