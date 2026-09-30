import { Router } from "express";
import { ObjectId } from "mongodb";

export default function createProfileRoutes(db) {
  const router = Router();

  router.post("/editsendername", async (req, res) => {
    const { name, senderid } = req.body;
    try {
      await db.collection("users").updateOne(
        { _id: new ObjectId(senderid) },
        { $set: { name } }
      );
      res.status(201).json({ message: "Name Edited" });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
