require("dotenv").config();
const healthAssistantService = require("./src/services/healthAssistantService");

async function testPerformance() {
  console.log("Testing Health Assistant Performance...\n");

  // Test 1: First message (with health check)
  console.log("Test 1: First message (dengan health check)");
  console.time("First message");
  const result1 = await healthAssistantService.chat(
    "Apa obat untuk sakit kepala?",
    []
  );
  console.timeEnd("First message");
  console.log("Success:", result1.success);
  console.log("Response length:", result1.response.length);
  console.log("\n---\n");

  // Test 2: Follow-up message (skip health check)
  console.log("Test 2: Follow-up message (tanpa health check - lebih cepat)");
  const history = [
    { role: "user", content: "Apa obat untuk sakit kepala?" },
    {
      role: "assistant",
      content:
        "Untuk sakit kepala, Anda bisa menggunakan paracetamol atau ibuprofen.",
    },
  ];

  console.time("Follow-up message");
  const result2 = await healthAssistantService.chat(
    "Apa efek sampingnya?",
    history
  );
  console.timeEnd("Follow-up message");
  console.log("Success:", result2.success);
  console.log("Response length:", result2.response.length);
  console.log("\n---\n");

  // Test 3: Non-health question
  console.log("Test 3: Non-health question (should reject)");
  console.time("Non-health question");
  const result3 = await healthAssistantService.chat(
    "Siapa presiden Indonesia?",
    []
  );
  console.timeEnd("Non-health question");
  console.log("Success:", result3.success);
  console.log("Is health related:", result3.isHealthRelated);
  console.log("Response:", result3.response.substring(0, 100) + "...");
}

testPerformance().catch(console.error);
