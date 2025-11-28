const axios = require("axios");

async function testChat() {
  try {
    console.log("Testing health assistant API...\n");

    const response = await axios.post(
      "http://localhost:3001/api/health-assistant/chat",
      {
        message: "Apa obat untuk sakit kepala?",
      }
    );

    console.log("✅ Success!");
    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Status:", error.response.status);
    }
  }
}

testChat();
