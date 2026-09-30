import { Router } from "express";
import streamifier from "streamifier";
import { cloudinary, upload, MAX_UPLOAD_MB } from "../config/cloudinary.js";

// Mounted behind requireAuth, so only signed-in users can upload.
export default function createUploadRoutes() {
  const router = Router();

  const singleFile = (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: `File is too large (max ${MAX_UPLOAD_MB} MB)` });
      }
      if (err) return res.status(400).json({ message: "Invalid upload" });
      next();
    });

  router.post("/upload", singleFile, async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      const uploadedFile = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto" },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });

      res.status(200).json({ url: uploadedFile.secure_url });
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  return router;
}
