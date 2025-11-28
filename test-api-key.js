require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testApiKey() {
  console.log("Testing Gemini API Key...\n");

  const apiKey = process.env.GEMINI_API_KEY;
  console.log("API Key length:", apiKey ? apiKey.length : 0);
  console.log(
    "API Key (first 20 chars):",
    apiKey ? apiKey.substring(0, 20) + "..." : "NOT FOUND"
  );
  console.log(
    "API Key (last 10 chars):",
    apiKey ? "..." + apiKey.substring(apiKey.length - 10) : ""
  );
  console.log();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    console.log("Sending test prompt...");
    const result = await model.generateContent(
      "Halo, jawab dengan singkat: Apa obat untuk sakit kepala?"
    );
    const response = result.response;
    const text = response.text();

    console.log("✅ API Key valid!");
    console.log("Response:", text);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.message.includes("API key")) {
      console.error("\n🔑 API Key tidak valid atau ada masalah format.");
      console.error("Solusi:");
      console.error("1. Cek apakah API key lengkap (biasanya 39 karakter)");
      console.error(
        "2. Generate API key baru di: https://aistudio.google.com/app/apikey"
      );
      console.error("3. Pastikan tidak ada spasi atau karakter tambahan");
    }
  }
}

testApiKey();
