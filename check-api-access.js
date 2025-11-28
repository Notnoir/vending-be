require("dotenv").config();
const axios = require("axios");

async function checkApiAccess() {
  console.log("Checking Gemini API access...\n");

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(
    "API Key:",
    apiKey ? `${apiKey.substring(0, 15)}...` : "NOT FOUND"
  );

  try {
    // Try to list available models
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    console.log("\nFetching available models...");

    const response = await axios.get(url);

    console.log("\n✅ API Access OK!");
    console.log("\nAvailable models:");

    if (response.data.models) {
      response.data.models.forEach((model) => {
        console.log(`- ${model.name}`);
        console.log(`  Display name: ${model.displayName}`);
        console.log(
          `  Supported methods: ${model.supportedGenerationMethods?.join(", ")}`
        );
        console.log();
      });
    }
  } catch (error) {
    console.error(
      "❌ Error:",
      error.response?.status,
      error.response?.statusText
    );
    console.error(
      "Message:",
      error.response?.data?.error?.message || error.message
    );

    if (error.response?.status === 403) {
      console.error(
        "\n🔒 API Key mungkin tidak memiliki akses atau belum diaktifkan."
      );
      console.error("Solusi:");
      console.error(
        "1. Pastikan API key sudah dibuat di https://aistudio.google.com/app/apikey"
      );
      console.error("2. Tunggu beberapa menit untuk propagasi API key");
      console.error("3. Coba generate API key baru");
    } else if (error.response?.status === 400) {
      console.error("\n❌ API Key tidak valid.");
      console.error(
        "Generate API key baru di: https://aistudio.google.com/app/apikey"
      );
    }
  }
}

checkApiAccess();
