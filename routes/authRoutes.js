import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, signToken } from "../middleware/auth.js";

// Rejects non-string values so JSON objects like { "$ne": null } can't reach Mongo queries.
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

export default function createAuthRoutes(db, hashMap) {
  const router = Router();

  router.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;
    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    try {
      const userExists = await db.collection("users").findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "User already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.collection("users").insertOne({ name, email, password: hashedPassword });
      res.status(201).json({ message: "User created successfully" });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/signin", async (req, res) => {
    const { email, password } = req.body;
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    try {
      const user = await db.collection("users").findOne({ email });
      // Same message for both cases so the response doesn't reveal which emails exist.
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      const userId = user._id.toString();
      if (hashMap.has(userId)) {
        return res.status(400).json({ message: "Multiple logins are not allowed. This account is already in use." });
      }

      res.json({
        message: "Login successful",
        userid: userId,
        name: user.name,
        email: user.email,
        token: signToken(user),
      });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/findifexist", requireAuth, async (req, res) => {
    const { member } = req.body;
    if (!isNonEmptyString(member)) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const contacts = await db.collection("users").findOne(
        { email: member },
        { projection: { name: 1, _id: 1 } }
      );
      res.status(201).json({ contacts: contacts ? [contacts] : [] });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
}
