import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export default function createAuthRoutes(db, hashMap) {
  const router = Router();

  router.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;
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
    try {
      const user = await db.collection("users").findOne({ email });
      if (!user) {
        return res.status(400).json({ message: "No such user" });
      }
      const userId = user._id.toString();

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid password" });
      }

      if (hashMap.has(userId)) {
        return res.status(400).json({ message: "Multiple logins are not allowed. This account is already in use." });
      }

      const token = jwt.sign(
        { id: userId, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({ message: "Login successful", userid: userId, name: user.name, email: user.email, token });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  router.post("/findifexist", async (req, res) => {
    const { member } = req.body;
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
