const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../config/supabase");

class HealthAssistantService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.availableProducts = [];
    this.initialize();
    this.loadProducts();
  }

  initialize() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY not found in environment variables");
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
        },
      });
      console.log(
        "✅ Health Assistant Service initialized successfully (using gemini-2.5-flash)"
      );
    } catch (error) {
      console.error(
        "Failed to initialize Health Assistant Service:",
        error.message
      );
    }
  }

  async loadProducts() {
    try {
      // Get products with slot information for current machine
      const machineId = process.env.MACHINE_ID || "VM01";

      const { data, error } = await supabase.supabase
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
        .gt("slots.current_stock", 0)
        .order("name");

      if (error) throw error;

      // Flatten the nested slot data
      this.availableProducts = (data || []).map((product) => {
        const slot = product.slots[0]; // Get first slot (should only be one per machine)
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
          capacity: slot?.capacity,
          final_price: slot?.price_override || product.price,
        };
      });

      console.log(
        `✅ Loaded ${this.availableProducts.length} products with stock info for AI recommendations`
      );
    } catch (error) {
      console.error("Failed to load products:", error.message);
      this.availableProducts = [];
    }
  }

  getSystemPrompt() {
    const productList =
      this.availableProducts.length > 0
        ? `\n\nPRODUK TERSEDIA DI VENDING MACHINE:\n${this.availableProducts
            .map(
              (p) =>
                `- ${p.name}: ${p.description} (Rp ${p.price.toLocaleString()})`
            )
            .join("\n")}`
        : "";

    return `Anda adalah asisten kesehatan virtual untuk vending machine apotek. Anda adalah ahli di bidang:
- Kesehatan umum dan gaya hidup sehat
- Obat-obatan (nama, kegunaan, dosis umum, efek samping)
- Penyakit umum dan gejalanya
- Rekomendasi obat untuk keluhan ringan (batuk, flu, demam, sakit kepala, dll)
- Vitamin dan suplemen kesehatan
- Pertolongan pertama untuk kondisi ringan
${productList}

ATURAN PENTING:
1. Berikan jawaban yang informatif, jelas, dan mudah dipahami dalam Bahasa Indonesia
2. Untuk kondisi serius, selalu sarankan untuk berkonsultasi dengan dokter atau apoteker
3. Jangan memberikan diagnosis medis yang pasti - hanya informasi umum
4. JIKA menanyakan rekomendasi obat, PRIORITASKAN produk yang tersedia di vending machine kami
5. Sebutkan produk yang tersedia dengan format: "Kami memiliki [PRODUCT:nama_produk] yang bisa membantu..."
6. Jika pertanyaan di luar topik kesehatan/obat/penyakit, jawab dengan sopan: "Maaf, pertanyaan tersebut di luar dari kemampuan saya. Saya hanya dapat membantu menjawab pertanyaan seputar kesehatan, obat-obatan, penyakit, dan rekomendasi perawatan kesehatan."

Gunakan bahasa yang ramah, empatik, dan profesional.`;
  }

  async chat(userMessage, conversationHistory = []) {
    try {
      if (!this.model) {
        throw new Error(
          "Health Assistant Service not initialized. Please check GEMINI_API_KEY."
        );
      }

      // Skip health check if there's conversation history (follow-up questions)
      // Only check for first message or standalone questions
      let isHealthRelated = true;

      if (conversationHistory.length === 0) {
        // Only check for first message
        isHealthRelated = await this.isHealthRelatedQuestion(
          userMessage,
          conversationHistory
        );

        if (!isHealthRelated) {
          return {
            success: true,
            response:
              "Maaf, pertanyaan tersebut di luar dari kemampuan saya. Saya hanya dapat membantu menjawab pertanyaan seputar kesehatan, obat-obatan, penyakit, dan rekomendasi perawatan kesehatan. Apakah ada yang bisa saya bantu terkait kesehatan Anda?",
            isHealthRelated: false,
          };
        }
      }

      // Build conversation context
      let prompt = this.getSystemPrompt() + "\n\n";

      // Add conversation history
      if (conversationHistory.length > 0) {
        prompt += "Riwayat percakapan:\n";
        conversationHistory.forEach((msg) => {
          prompt += `${msg.role === "user" ? "Pengguna" : "Asisten"}: ${
            msg.content
          }\n`;
        });
        prompt += "\n";
      }

      prompt += `Pengguna: ${userMessage}\nAsisten:`;

      // Generate response
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Extract recommended products from response
      const recommendedProducts = this.extractRecommendedProducts(text);

      return {
        success: true,
        response: text,
        isHealthRelated: true,
        recommendedProducts: recommendedProducts,
      };
    } catch (error) {
      console.error("Error in health assistant chat:", error);

      if (error.message.includes("API key")) {
        return {
          success: false,
          error: "Service configuration error. Please contact administrator.",
          response:
            "Maaf, layanan asisten kesehatan sedang tidak tersedia. Silakan coba lagi nanti.",
        };
      }

      return {
        success: false,
        error: error.message,
        response: "Maaf, terjadi kesalahan. Silakan coba lagi.",
      };
    }
  }

  async isHealthRelatedQuestion(question, conversationHistory = []) {
    try {
      // If there's conversation history, check the context
      let contextInfo = "";
      if (conversationHistory.length > 0) {
        // Get last few messages for context
        const recentMessages = conversationHistory.slice(-4);
        contextInfo = "\n\nKonteks percakapan sebelumnya:\n";
        recentMessages.forEach((msg) => {
          contextInfo += `${
            msg.role === "user" ? "Pengguna" : "Asisten"
          }: ${msg.content.substring(0, 200)}...\n`;
        });
      }

      const checkPrompt = `Tentukan apakah pertanyaan berikut berkaitan dengan kesehatan, obat-obatan, penyakit, gejala, atau rekomendasi medis.
${contextInfo}
Pertanyaan terbaru: "${question}"

PENTING: 
- Jika pertanyaan adalah lanjutan dari percakapan tentang kesehatan (seperti "apa penyebabnya?", "bagaimana cara mengobatinya?", "beritahu saya lebih lanjut"), maka itu TETAP topik kesehatan.
- Pertanyaan tindak lanjut seperti "kenapa?", "apa penyebabnya?", "bagaimana cara mencegahnya?" dalam konteks kesehatan adalah RELEVAN.

Jawab hanya dengan "YA" jika pertanyaan berkaitan dengan topik kesehatan/medis/obat (termasuk pertanyaan lanjutan), atau "TIDAK" jika pertanyaan jelas tentang topik lain yang tidak ada hubungannya dengan kesehatan.

Contoh pertanyaan RELEVAN:
- Apa obat untuk sakit kepala?
- Bagaimana cara mengatasi flu?
- Apa penyebabnya? (jika sebelumnya membahas penyakit)
- Beritahu saya lebih lanjut (dalam konteks kesehatan)
- Bagaimana cara mencegahnya?
- Apa efek sampingnya?

Contoh pertanyaan TIDAK RELEVAN:
- Siapa presiden Indonesia?
- Bagaimana cara membuat kopi?
- Apa itu cryptocurrency?
- Kapan Indonesia merdeka?

Jawaban:`;

      const result = await this.model.generateContent(checkPrompt);
      const response = result.response.text().trim().toUpperCase();

      return response.includes("YA");
    } catch (error) {
      console.error("Error checking health-related question:", error);
      // Default to true to avoid blocking legitimate questions
      return true;
    }
  }

  extractRecommendedProducts(responseText) {
    const products = [];

    // Find products mentioned in response using [PRODUCT:name] format
    const productMatches = responseText.match(/\[PRODUCT:([^\]]+)\]/g);

    if (productMatches) {
      productMatches.forEach((match) => {
        const productName = match.replace(/\[PRODUCT:([^\]]+)\]/, "$1");
        const product = this.availableProducts.find(
          (p) =>
            p.name.toLowerCase().includes(productName.toLowerCase()) ||
            productName.toLowerCase().includes(p.name.toLowerCase())
        );

        if (product && !products.find((p) => p.id === product.id)) {
          products.push(product);
        }
      });
    }

    // Also search for product names directly mentioned in text
    if (products.length === 0) {
      this.availableProducts.forEach((product) => {
        const regex = new RegExp(`\\b${product.name}\\b`, "gi");
        if (regex.test(responseText)) {
          if (!products.find((p) => p.id === product.id)) {
            products.push(product);
          }
        }
      });
    }

    return products;
  }

  async getProductRecommendations(symptoms) {
    try {
      if (!this.model) {
        throw new Error("Health Assistant Service not initialized");
      }

      const prompt = `${this.getSystemPrompt()}

Berdasarkan gejala berikut: "${symptoms}"

Berikan rekomendasi obat-obatan yang umum digunakan untuk mengatasi gejala tersebut. Format jawaban dalam JSON array dengan struktur:
[
  {
    "productName": "nama obat",
    "description": "kegunaan singkat",
    "dosage": "dosis umum",
    "notes": "catatan penting"
  }
]

Berikan 3-5 rekomendasi obat yang relevan.`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // Try to parse JSON response
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const recommendations = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            recommendations,
          };
        }
      } catch (parseError) {
        // If JSON parsing fails, return raw text
        return {
          success: true,
          text: text,
          recommendations: [],
        };
      }

      return {
        success: true,
        text: text,
        recommendations: [],
      };
    } catch (error) {
      console.error("Error getting product recommendations:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const healthAssistantService = new HealthAssistantService();

module.exports = healthAssistantService;
