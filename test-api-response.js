require("dotenv").config();
const axios = require("axios");

async function testAPI() {
  console.log("Testing AI Assistant API with product recommendations...\n");

  try {
    const response = await axios.post(
      "http://localhost:3001/api/health-assistant/chat",
      {
        message: "Saya sakit kepala, obat apa yang tersedia?",
      }
    );

    console.log("✅ API Response:");
    console.log("Success:", response.data.success);
    console.log("Is Health Related:", response.data.isHealthRelated);
    console.log(
      "Message (first 200 chars):",
      response.data.message?.substring(0, 200)
    );
    console.log("\n📦 Recommended Products:");
    console.log(JSON.stringify(response.data.recommendedProducts, null, 2));

    if (
      !response.data.recommendedProducts ||
      response.data.recommendedProducts.length === 0
    ) {
      console.log("\n❌ PROBLEM: No recommended products returned!");
    } else {
      console.log(
        "\n✅ Products found:",
        response.data.recommendedProducts.length
      );
    }
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

testAPI();
