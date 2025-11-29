const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const QRCode = require("qrcode");
const prescriptionScanService = require("../services/prescriptionScanService");
const supabase = require("../config/supabase");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/prescriptions/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "prescription-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only .png, .jpg and .jpeg format allowed!"));
    }
  },
});

/**
 * @route   POST /api/prescription-scan/create-session
 * @desc    Create new scan session and generate QR code
 * @access  Public
 */
router.post("/create-session", async (req, res) => {
  try {
    // Create new session
    const sessionId = prescriptionScanService.createSession();

    // Generate QR code URL (points to mobile upload page)
    const backendUrl =
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const uploadUrl = `${backendUrl}/api/prescription-scan/upload?session=${sessionId}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(uploadUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return res.json({
      success: true,
      sessionId,
      qrCode: qrCodeDataUrl,
      uploadUrl,
      expiresIn: 600, // 10 minutes
    });
  } catch (error) {
    console.error("Error creating scan session:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create scan session",
    });
  }
});

/**
 * @route   GET /api/prescription-scan/status/:sessionId
 * @desc    Check scan session status
 * @access  Public
 */
router.get("/status/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = prescriptionScanService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    return res.json({
      success: true,
      status: session.status,
      result: session.result,
      error: session.error,
    });
  } catch (error) {
    console.error("Error checking session status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check session status",
    });
  }
});

/**
 * @route   GET /api/prescription-scan/upload
 * @desc    Mobile upload page (HTML form)
 * @access  Public
 */
router.get("/upload", (req, res) => {
  const { session } = req.query;

  if (!session) {
    return res.status(400).send("Session ID required");
  }

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Upload Resep Dokter</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 30px;
          max-width: 500px;
          width: 100%;
        }
        h1 {
          color: #667eea;
          text-align: center;
          margin-bottom: 10px;
          font-size: 24px;
        }
        p {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
          line-height: 1.6;
        }
        .upload-area {
          border: 3px dashed #667eea;
          border-radius: 15px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
          margin-bottom: 20px;
        }
        .upload-area:hover {
          background: #f8f9ff;
          border-color: #764ba2;
        }
        .upload-area.dragover {
          background: #f0f4ff;
          border-color: #764ba2;
        }
        .upload-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        input[type="file"] {
          display: none;
        }
        button {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .preview {
          margin: 20px 0;
          text-align: center;
        }
        .preview img {
          max-width: 100%;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .status {
          margin-top: 20px;
          padding: 15px;
          border-radius: 10px;
          text-align: center;
          font-weight: bold;
        }
        .status.success {
          background: #d4edda;
          color: #155724;
        }
        .status.error {
          background: #f8d7da;
          color: #721c24;
        }
        .status.loading {
          background: #fff3cd;
          color: #856404;
        }
        .tips {
          background: #f8f9fa;
          border-radius: 10px;
          padding: 15px;
          margin-top: 20px;
        }
        .tips h3 {
          color: #667eea;
          font-size: 16px;
          margin-bottom: 10px;
        }
        .tips ul {
          margin-left: 20px;
          color: #666;
          font-size: 14px;
        }
        .tips li {
          margin-bottom: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📋 Upload Resep Dokter</h1>
        <p>Ambil foto resep dokter Anda dan upload di sini. Pastikan foto jelas dan dapat terbaca.</p>
        
        <div class="upload-area" id="uploadArea">
          <div class="upload-icon">📸</div>
          <p><strong>Klik atau Drag & Drop</strong><br>untuk upload foto resep</p>
          <input type="file" id="fileInput" accept="image/jpeg,image/jpg,image/png" capture="environment">
        </div>

        <div class="preview" id="preview" style="display: none;">
          <img id="previewImg" src="" alt="Preview">
        </div>

        <button id="uploadBtn" disabled>Upload Resep</button>

        <div id="status"></div>

        <div class="tips">
          <h3>💡 Tips untuk foto yang bagus:</h3>
          <ul>
            <li>Pastikan pencahayaan cukup terang</li>
            <li>Foto dari atas (tegak lurus)</li>
            <li>Pastikan semua teks terlihat jelas</li>
            <li>Hindari bayangan pada resep</li>
            <li>Gunakan latar belakang kontras</li>
          </ul>
        </div>
      </div>

      <script>
        const sessionId = '${session}';
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const preview = document.getElementById('preview');
        const previewImg = document.getElementById('previewImg');
        const statusDiv = document.getElementById('status');
        let selectedFile = null;

        // Click to select file
        uploadArea.addEventListener('click', () => fileInput.click());

        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
          uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          const files = e.dataTransfer.files;
          if (files.length > 0) {
            handleFile(files[0]);
          }
        });

        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
          }
        });

        function handleFile(file) {
          if (!file.type.match('image/jpeg|image/jpg|image/png')) {
            showStatus('error', 'Hanya file JPG, JPEG, atau PNG yang diizinkan!');
            return;
          }

          if (file.size > 10 * 1024 * 1024) {
            showStatus('error', 'Ukuran file maksimal 10MB!');
            return;
          }

          selectedFile = file;
          
          // Show preview
          const reader = new FileReader();
          reader.onload = (e) => {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
          };
          reader.readAsDataURL(file);

          uploadBtn.disabled = false;
          statusDiv.innerHTML = '';
        }

        uploadBtn.addEventListener('click', async () => {
          if (!selectedFile) return;

          const formData = new FormData();
          formData.append('prescription', selectedFile);

          uploadBtn.disabled = true;
          showStatus('loading', '⏳ Mengupload dan memproses resep...');

          try {
            const response = await fetch('/api/prescription-scan/upload?session=' + sessionId, {
              method: 'POST',
              body: formData
            });

            const data = await response.json();

            if (data.success) {
              showStatus('success', '✅ Resep berhasil diupload! Sedang memproses...');
              setTimeout(() => {
                showStatus('success', '✅ Selesai! Silakan kembali ke layar vending machine.');
              }, 2000);
            } else {
              showStatus('error', '❌ ' + (data.message || 'Upload gagal'));
              uploadBtn.disabled = false;
            }
          } catch (error) {
            console.error('Upload error:', error);
            showStatus('error', '❌ Terjadi kesalahan. Silakan coba lagi.');
            uploadBtn.disabled = false;
          }
        });

        function showStatus(type, message) {
          statusDiv.className = 'status ' + type;
          statusDiv.textContent = message;
          statusDiv.style.display = 'block';
        }
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

/**
 * @route   POST /api/prescription-scan/upload
 * @desc    Upload prescription image from mobile
 * @access  Public
 */
router.post("/upload", upload.single("prescription"), async (req, res) => {
  try {
    const { session } = req.query;

    if (!session) {
      return res.status(400).json({
        success: false,
        message: "Session ID required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // Process prescription asynchronously
    prescriptionScanService
      .processPrescription(session, req.file.path)
      .catch((err) => {
        console.error("Error processing prescription:", err);
      });

    return res.json({
      success: true,
      message: "Prescription uploaded successfully. Processing...",
      sessionId: session,
    });
  } catch (error) {
    console.error("Error uploading prescription:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload prescription",
    });
  }
});

/**
 * @route   GET /api/prescription-scan/find-products/:sessionId
 * @desc    Find matching products from scanned prescription
 * @access  Public
 */
router.get("/find-products/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = prescriptionScanService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    if (session.status !== "completed") {
      return res.json({
        success: false,
        message: "Prescription not yet processed",
        status: session.status,
      });
    }

    // Get available products
    const machineId = process.env.MACHINE_ID || "VM01";
    const { data: products, error } = await supabase.supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        price,
        category,
        image_url,
        slots!inner (
          id,
          slot_number,
          current_stock,
          capacity,
          price_override,
          is_active
        )
      `
      )
      .eq("is_active", true)
      .eq("slots.machine_id", machineId)
      .eq("slots.is_active", true)
      .gt("slots.current_stock", 0);

    if (error) throw error;

    const availableProducts = (products || []).map((product) => {
      const slot = product.slots[0];
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: slot?.price_override || product.price,
        category: product.category,
        image_url: product.image_url,
        slot_id: slot?.id,
        slot_number: slot?.slot_number,
        current_stock: slot?.current_stock,
        final_price: slot?.price_override || product.price,
      };
    });

    // Find matching products
    const medications =
      session.result.prescription.medications ||
      session.result.prescription.rawText ||
      [];
    const matches = await prescriptionScanService.findMatchingProducts(
      Array.isArray(medications) ? medications : [],
      availableProducts
    );

    return res.json({
      success: true,
      prescription: session.result.prescription,
      matches,
      totalMatches: matches.length,
    });
  } catch (error) {
    console.error("Error finding products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to find matching products",
    });
  }
});

module.exports = router;
