const express = require("express");
const router = express.Router();
const healthAssistantService = require("../services/healthAssistantService");

/**
 * @route   POST /api/health-assistant/chat
 * @desc    Chat with health assistant
 * @access  Public
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Pesan tidak boleh kosong",
      });
    }

    // Validate conversation history format if provided
    if (conversationHistory && !Array.isArray(conversationHistory)) {
      return res.status(400).json({
        success: false,
        message: "Format riwayat percakapan tidak valid",
      });
    }

    // Get response from health assistant
    const result = await healthAssistantService.chat(
      message.trim(),
      conversationHistory || []
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message:
          result.response || "Terjadi kesalahan pada layanan asisten kesehatan",
      });
    }

    return res.json({
      success: true,
      message: result.response,
      isHealthRelated: result.isHealthRelated,
      recommendedProducts: result.recommendedProducts || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in health assistant chat endpoint:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server. Silakan coba lagi.",
    });
  }
});

/**
 * @route   POST /api/health-assistant/recommendations
 * @desc    Get product recommendations based on symptoms
 * @access  Public
 */
router.post("/recommendations", async (req, res) => {
  try {
    const { symptoms } = req.body;

    if (!symptoms || typeof symptoms !== "string" || symptoms.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Gejala harus diisi",
      });
    }

    const result = await healthAssistantService.getProductRecommendations(
      symptoms.trim()
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil rekomendasi produk",
      });
    }

    return res.json({
      success: true,
      recommendations: result.recommendations,
      text: result.text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in product recommendations endpoint:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server. Silakan coba lagi.",
    });
  }
});

/**
 * @route   GET /api/health-assistant/status
 * @desc    Check health assistant service status
 * @access  Public
 */
router.get("/status", (req, res) => {
  const isReady = healthAssistantService.model !== null;

  res.json({
    success: true,
    status: isReady ? "ready" : "not_configured",
    message: isReady
      ? "Health assistant service is ready"
      : "Health assistant service is not configured. Please set GEMINI_API_KEY.",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
