const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs").promises;
const path = require("path");

class PrescriptionScanService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.sessions = new Map(); // Store active scan sessions
    this.initialize();
  }

  initialize() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY not found for prescription scanning");
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use gemini-2.5-flash which supports both text and vision
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
      });
      console.log(
        "✅ Prescription Scan Service initialized (gemini-2.5-flash with vision)"
      );
    } catch (error) {
      console.error("Failed to initialize Prescription Scan Service:", error);
    }
  }

  // Create new scan session
  createSession() {
    const sessionId = `scan_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.sessions.set(sessionId, {
      status: "waiting", // waiting, processing, completed, error
      createdAt: new Date(),
      result: null,
      error: null,
      uploadCount: 0, // Track upload attempts
      maxUploads: 3, // Max 3 upload attempts per session
    });

    // Auto cleanup after 10 minutes
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 10 * 60 * 1000);

    return sessionId;
  }

  // Get session status
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Process prescription image with OCR
  async processPrescription(sessionId, imagePath) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error("Invalid session ID");
      }

      // Update status to processing
      session.status = "processing";

      if (!this.model) {
        throw new Error("Gemini model not initialized");
      }

      // Read image file
      const imageData = await fs.readFile(imagePath);
      const base64Image = imageData.toString("base64");

      // Prepare prompt for OCR
      const prompt = `Kamu adalah asisten farmasi yang ahli dalam membaca resep dokter.

Analisis gambar resep dokter ini dan ekstrak informasi berikut dalam format JSON:

{
  "doctorName": "Nama dokter",
  "doctorSpecialist": "Spesialisasi dokter",
  "doctorLicense": "Nomor SIP/STR dokter",
  "patientName": "Nama pasien",
  "patientAge": "Usia pasien",
  "date": "Tanggal resep",
  "medications": [
    {
      "name": "Nama obat",
      "dosage": "Dosis (mg/ml)",
      "frequency": "Frekuensi (berapa kali sehari)",
      "duration": "Durasi (berapa hari)",
      "instructions": "Instruksi khusus (sebelum/sesudah makan, dll)",
      "quantity": "Jumlah yang diresepkan"
    }
  ],
  "diagnosis": "Diagnosis atau keluhan pasien",
  "additionalNotes": "Catatan tambahan dari dokter"
}

PENTING:
- Jika ada informasi yang tidak terlihat jelas atau tidak ada di resep, gunakan nilai null
- Fokus pada akurasi informasi obat-obatan karena sangat penting
- Jika tulisan dokter sulit dibaca, berikan best guess dengan catatan [tidak yakin]
- Pastikan dosis, frekuensi, dan durasi akurat

Berikan output dalam format JSON yang valid.`;

      // Call Gemini Vision API
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ]);

      const response = result.response;
      const text = response.text();

      // Parse JSON from response
      let prescriptionData;
      try {
        // Try to extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          prescriptionData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse JSON:", parseError);
        // Return raw text if JSON parsing fails
        prescriptionData = {
          rawText: text,
          parseError: true,
        };
      }

      // Update session with result
      session.status = "completed";
      session.result = {
        prescription: prescriptionData,
        processedAt: new Date(),
        confidence: prescriptionData.parseError ? "low" : "high",
      };

      // Delete uploaded file after processing
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        console.error("Failed to delete uploaded file:", err);
      }

      return session.result;
    } catch (error) {
      console.error("Error processing prescription:", error);

      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = "error";
        session.error = error.message;
      }

      throw error;
    }
  }

  // Find matching products from prescription
  async findMatchingProducts(medications, availableProducts) {
    const matches = [];

    for (const med of medications) {
      if (!med.name) continue;

      const medName = med.name.toLowerCase();

      // Find products that match the medication name
      const matchedProducts = availableProducts.filter((product) => {
        const productName = product.name.toLowerCase();
        return (
          productName.includes(medName) ||
          medName.includes(productName) ||
          this.calculateSimilarity(productName, medName) > 0.7
        );
      });

      if (matchedProducts.length > 0) {
        matches.push({
          medication: med,
          products: matchedProducts,
          matchType: "direct",
        });
      }
    }

    return matches;
  }

  // Calculate string similarity (simple Levenshtein-like)
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  getEditDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Create singleton instance
const prescriptionScanService = new PrescriptionScanService();

module.exports = prescriptionScanService;
