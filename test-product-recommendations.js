require("dotenv").config();
const healthAssistantService = require("./src/services/healthAssistantService");

async function testProductRecommendations() {
  console.log("Testing Product Recommendations Feature...\n");

  // Wait for products to load
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(
    `Available products: ${healthAssistantService.availableProducts.length}`
  );
  console.log(
    "Products:",
    healthAssistantService.availableProducts.map((p) => p.name).join(", ")
  );
  console.log("\n---\n");

  // Test 1: Ask for headache medicine
  console.log("Test 1: Meminta rekomendasi obat sakit kepala");
  const result1 = await healthAssistantService.chat(
    "Saya sakit kepala, obat apa yang tersedia?",
    []
  );

  console.log("Response:", result1.response.substring(0, 200) + "...");
  console.log(
    "Recommended Products:",
    result1.recommendedProducts?.map((p) => p.name) || "None"
  );
  console.log("\n---\n");

  // Test 2: Ask for flu medicine
  console.log("Test 2: Meminta rekomendasi obat flu");
  const result2 = await healthAssistantService.chat(
    "Saya flu dan batuk, apa obat yang cocok?",
    []
  );

  console.log("Response:", result2.response.substring(0, 200) + "...");
  console.log(
    "Recommended Products:",
    result2.recommendedProducts?.map((p) => p.name) || "None"
  );
  console.log("\n---\n");

  // Test 3: General question (should not recommend products)
  console.log("Test 3: Pertanyaan umum kesehatan");
  const result3 = await healthAssistantService.chat(
    "Bagaimana cara menjaga kesehatan?",
    []
  );

  console.log("Response:", result3.response.substring(0, 200) + "...");
  console.log(
    "Recommended Products:",
    result3.recommendedProducts?.map((p) => p.name) || "None"
  );
}

testProductRecommendations().catch(console.error);
