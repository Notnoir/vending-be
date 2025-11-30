const express = require("express");
const router = express.Router();
const multer = require("multer");
const QRCode = require("qrcode");
const prescriptionScanService = require("../services/prescriptionScanService");
const supabase = require("../config/supabase");

// Configure multer for memory storage (no disk write)
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory buffer instead of disk
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
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
router.get("/status/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = prescriptionScanService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    let products = [];
    let unavailableCount = 0;

    // If completed, find matching products
    if (session.status === "completed" && session.result?.prescription) {
      try {
        // Get available products from database
        const machineId = process.env.MACHINE_ID || "VM01";
        const { data: productsData, error } = await supabase.supabase
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

        if (!error && productsData) {
          const availableProducts = productsData.map((product) => {
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
          const medications = session.result.prescription.medications || [];
          console.log(
            "🔍 Searching for medications:",
            medications.map((m) => m.name)
          );

          const matches = await prescriptionScanService.findMatchingProducts(
            medications,
            availableProducts
          );

          console.log("✅ Found matches:", matches.length);
          matches.forEach((match) => {
            console.log(
              `  - ${match.medication.name}: ${match.products.length} product(s)`
            );
          });

          // Extract all matched products (flatten the array since each match can have multiple products)
          products = matches.flatMap((m) => m.products || []);
          console.log("📦 Total products to return:", products.length);

          // Count unique medications that were matched vs total medications
          const matchedMedications = new Set(
            matches.map((m) => m.medication.name)
          );
          unavailableCount = medications.length - matchedMedications.size;
          console.log(
            `📊 Matched: ${matchedMedications.size}/${medications.length}, Unavailable: ${unavailableCount}`
          );
        }
      } catch (error) {
        console.error("Error finding products:", error);
        // Continue without products on error
      }
    }

    return res.json({
      success: true,
      status: session.status,
      result: {
        ...session.result,
        products,
        unavailableCount,
      },
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

  // Set Content Security Policy to allow inline scripts
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
  );

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
      <title>Upload Resep</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #667eea;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          background: white;
          border-radius: 15px;
          padding: 25px;
          max-width: 500px;
          margin: 0 auto;
        }
        h1 {
          color: #667eea;
          font-size: 22px;
          margin-bottom: 8px;
          text-align: center;
        }
        .subtitle {
          color: #666;
          font-size: 14px;
          text-align: center;
          margin-bottom: 25px;
        }
        .file-input-wrapper {
          position: relative;
          margin-bottom: 15px;
        }
        input[type="file"] {
          width: 100%;
          padding: 15px;
          border: 2px solid #667eea;
          border-radius: 10px;
          font-size: 16px;
          cursor: pointer;
          background: white;
        }
        input[type="file"]::file-selector-button {
          background: #667eea;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-right: 10px;
        }
        .preview {
          margin: 15px 0;
          text-align: center;
          display: none;
        }
        .preview img {
          max-width: 100%;
          max-height: 300px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        button {
          width: 100%;
          padding: 15px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 15px;
        }
        button:active {
          background: #5568d3;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .status {
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          font-size: 14px;
          display: none;
          margin-bottom: 15px;
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
          border-radius: 8px;
          padding: 12px;
          font-size: 13px;
        }
        .tips h3 {
          color: #667eea;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .tips ul {
          margin-left: 18px;
          color: #666;
        }
        .tips li {
          margin-bottom: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📋 Upload Resep Dokter</h1>
        <p class="subtitle">Pilih foto resep dari galeri atau ambil foto baru</p>
        
        <div class="file-input-wrapper">
          <input type="file" id="fileInput" accept="image/*">
        </div>

        <div class="preview" id="preview">
          <img id="previewImg" alt="Preview">
        </div>

        <div id="status" class="status"></div>

        <button id="uploadBtn" disabled>Upload Resep</button>

        <div class="tips">
          <h3>💡 Tips Foto Bagus:</h3>
          <ul>
            <li>Pencahayaan terang</li>
            <li>Foto tegak lurus dari atas</li>
            <li>Semua teks terlihat jelas</li>
            <li>Tidak ada bayangan</li>
          </ul>
        </div>
      </div>

      <script>
        const sessionId = '${session}';
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const preview = document.getElementById('preview');
        const previewImg = document.getElementById('previewImg');
        const statusDiv = document.getElementById('status');

        fileInput.addEventListener('change', (e) => {
          console.log('File input changed');
          const file = e.target.files[0];
          
          if (!file) {
            console.log('No file selected');
            uploadBtn.disabled = true;
            return;
          }

          console.log('File selected:', file.name, file.type, file.size);

          if (!file.type.startsWith('image/')) {
            console.log('Invalid file type');
            showStatus('error', '❌ Hanya file gambar yang diizinkan!');
            uploadBtn.disabled = true;
            fileInput.value = '';
            return;
          }

          if (file.size > 10 * 1024 * 1024) {
            console.log('File too large');
            showStatus('error', '❌ Ukuran file maksimal 10MB!');
            uploadBtn.disabled = true;
            fileInput.value = '';
            return;
          }

          console.log('File valid, enabling button');
          
          // Enable button immediately after validation
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload Resep';
          uploadBtn.style.background = '#667eea';
          uploadBtn.style.cursor = 'pointer';
          statusDiv.style.display = 'none';
          
          // Show preview (optional, button already enabled)
          const reader = new FileReader();
          reader.onload = (e) => {
            console.log('Preview loaded');
            previewImg.src = e.target.result;
            preview.style.display = 'block';
          };
          reader.onerror = (e) => {
            console.error('FileReader error:', e);
          };
          reader.readAsDataURL(file);
        });

        uploadBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          console.log('Upload button clicked');
          
          const file = fileInput.files[0];
          if (!file) {
            console.log('No file to upload');
            showStatus('error', '❌ Pilih foto terlebih dahulu!');
            return;
          }

          console.log('Preparing to upload:', file.name);

          const formData = new FormData();
          formData.append('prescription', file);

          uploadBtn.disabled = true;
          uploadBtn.textContent = 'Mengupload...';
          uploadBtn.style.cursor = 'not-allowed';
          showStatus('loading', '⏳ Mengupload...');

          try {
            const response = await fetch('/api/prescription-scan/upload?session=' + sessionId, {
              method: 'POST',
              body: formData
            });

            const data = await response.json();

            if (data.success) {
              showStatus('success', '✅ Upload berhasil! Silakan kembali ke vending machine.');
              uploadBtn.textContent = 'Upload Berhasil ✓';
              uploadBtn.style.background = '#28a745';
              fileInput.disabled = true;
            } else {
              showStatus('error', '❌ Upload gagal: ' + (data.message || 'Coba lagi'));
              uploadBtn.disabled = false;
              uploadBtn.textContent = 'Coba Upload Lagi';
              uploadBtn.style.background = '#dc3545';
            }
          } catch (error) {
            console.error('Upload error:', error);
            showStatus('error', '❌ Koneksi gagal. Coba lagi.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Coba Upload Lagi';
            uploadBtn.style.background = '#dc3545';
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

    // Check if session exists and is valid
    const sessionData = prescriptionScanService.getSession(session);
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired",
      });
    }

    // Check if session already completed (prevent re-upload)
    if (sessionData.status === "completed") {
      return res.status(400).json({
        success: false,
        message:
          "Session already completed. Please scan QR again for new upload.",
      });
    }

    // Check upload count (max 3 attempts per session)
    if (sessionData.uploadCount >= sessionData.maxUploads) {
      return res.status(429).json({
        success: false,
        message: "Maximum upload attempts reached. Please scan QR again.",
      });
    }

    // Increment upload count
    sessionData.uploadCount++;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // Process prescription from memory buffer (no disk storage)
    prescriptionScanService
      .processPrescriptionFromBuffer(
        session,
        req.file.buffer,
        req.file.mimetype
      )
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
