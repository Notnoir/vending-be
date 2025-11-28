require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
  console.log("Listing available Gemini models...\n");

  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try different model names
    const modelsToTry = [
      "gemini-pro",
      "gemini-1.5-pro",
      "gemini-1.0-pro",
      "models/gemini-pro",
    ];

    for (const modelName of modelsToTry) {
      try {
        console.log(`Testing model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(
          "Halo, jawab singkat: 1+1=?"
        );
        const text = result.response.text();

        console.log(`✅ Model "${modelName}" WORKS!`);
        console.log(`Response: ${text}\n`);
      } catch (error) {
        console.log(`❌ Model "${modelName}" failed: ${error.message}\n`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

listModels();
