const express = require("express");
const upload = require("../config/upload");
const path = require("path");

const router = express.Router();

// Upload single image
router.post("/image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    // Return the file URL
    const fileUrl = `/uploads/products/${req.file.filename}`;

    res.json({
      message: "File uploaded successfully",
      filename: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Failed to upload file",
    });
  }
});

// Delete image
router.delete("/image/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const fs = require("fs");
    const filePath = path.join(__dirname, "../../uploads/products", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "File not found",
      });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      error: "Failed to delete file",
    });
  }
});

module.exports = router;
