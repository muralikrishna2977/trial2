import { Router } from "express";
import { ObjectId } from "mongodb";

// Mounted behind requireAuth; users can only rename themselves.
export default function createProfileRoutes(db) {
  const router = Router();

  router.post("/editsendername", async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ message: "Name cannot be empty" });

    try {
      await db.collection("users").updateOne(
        { _id: new ObjectId(req.userId) },
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
