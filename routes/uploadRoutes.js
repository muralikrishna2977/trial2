import { Router } from "express";
import streamifier from "streamifier";
import { cloudinary, upload } from "../config/cloudinary.js";

export default function createUploadRoutes() {
  const router = Router();

  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "auto" },
          (error, uploadedFile) => {
            if (error) reject(error);
            else resolve(uploadedFile);
          }
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });

      const uploadedFile = await uploadPromise;
      res.status(200).json({ url: uploadedFile.secure_url });
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).json({ message: "Server error", error });
    }
  });

  return router;
}
