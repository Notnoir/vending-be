const axios = require("axios");

const API_URL = "http://localhost:3001/api";

async function testCreateOrder() {
  console.log("🧪 Testing Create Order...\n");

  try {
    // 1. Get available products first
    console.log("1️⃣ Getting available products...");
    const productsRes = await axios.get(`${API_URL}/products/available`);
    const products = productsRes.data.products;

    if (products.length === 0) {
      console.log("❌ No products available");
      return;
    }

    console.log(`✅ Found ${products.length} products`);
    console.log(
      "   First product:",
      products[0].name,
      "- Slot ID:",
      products[0].slot_id
    );

    // 2. Create order
    console.log("\n2️⃣ Creating order...");
    const orderData = {
      slot_id: products[0].slot_id,
      quantity: 1,
      customer_phone: "081234567890",
    };

    console.log("   Order data:", orderData);

    const orderRes = await axios.post(`${API_URL}/orders`, orderData);
    const order = orderRes.data;

    console.log("✅ Order created successfully!");
    console.log("   Order ID:", order.order_id);
    console.log("   Product:", order.product_name);
    console.log("   Total:", `Rp ${order.total_amount}`);
    console.log("   Status:", order.status);
    console.log("   Payment URL:", order.payment_url);

    // 3. Check order status
    console.log("\n3️⃣ Checking order status...");
    const statusRes = await axios.get(`${API_URL}/orders/${order.order_id}`);
    console.log("✅ Order status retrieved");
    console.log("   Status:", statusRes.data.status);
    console.log(
      "   Payment status:",
      statusRes.data.payment_status || "PENDING"
    );

    console.log("\n✅ Test completed successfully!");
    console.log("\n📝 Summary:");
    console.log(`   Order ID: ${order.order_id}`);
    console.log(`   Product: ${order.product_name}`);
    console.log(`   Amount: Rp ${order.total_amount}`);
    console.log(`   Status: ${order.status}`);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);

    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Error:", error.response.data);
    }

    console.log("\n🔧 Troubleshooting:");
    console.log("1. Make sure backend is running: npm run dev");
    console.log("2. Check if data exists: npm run supabase:check");
    console.log("3. Re-insert sample data: npm run supabase:seed");
  }
}

testCreateOrder()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
