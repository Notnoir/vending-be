const { supabase } = require("./src/config/supabase");

async function insertSampleData() {
  console.log("📦 Inserting sample data to Supabase...\n");

  try {
    // 1. Insert Machine
    console.log("1️⃣ Creating machine VM01...");
    const { data: machine, error: machineError } = await supabase
      .from("machines")
      .upsert(
        {
          id: "VM01",
          name: "Vending Machine 01",
          location: "Lobby Utama",
          status: "ONLINE",
          token: "test-token-vm01-2025",
          config: {
            temperature: 25,
            version: "1.0",
          },
        },
        {
          onConflict: "id",
        }
      )
      .select();

    if (machineError) {
      console.error("  ❌ Error creating machine:", machineError.message);
      throw machineError;
    }
    console.log("  ✅ Machine VM01 created/updated");

    // 2. Get product IDs
    console.log("\n2️⃣ Getting product IDs...");
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("id, name")
      .order("id");

    if (prodError || !products || products.length === 0) {
      console.error("  ❌ No products found!");
      throw new Error("Products not found. Run schema SQL first.");
    }

    console.log(`  ✅ Found ${products.length} products`);
    products.forEach((p) => console.log(`     - ID ${p.id}: ${p.name}`));

    // 3. Insert Slots
    console.log("\n3️⃣ Creating slots...");

    const slots = [
      {
        machine_id: "VM01",
        slot_number: 1,
        product_id: products[0].id,
        capacity: 10,
        current_stock: 5,
      },
      {
        machine_id: "VM01",
        slot_number: 2,
        product_id: products[1].id,
        capacity: 15,
        current_stock: 10,
      },
      {
        machine_id: "VM01",
        slot_number: 3,
        product_id: products[2].id,
        capacity: 12,
        current_stock: 7,
      },
      {
        machine_id: "VM01",
        slot_number: 4,
        product_id: products[3].id,
        capacity: 8,
        current_stock: 3,
      },
      {
        machine_id: "VM01",
        slot_number: 5,
        product_id: products[4].id,
        capacity: 10,
        current_stock: 6,
      },
    ];

    for (const slot of slots) {
      const { error: slotError } = await supabase.from("slots").upsert(slot, {
        onConflict: "machine_id,slot_number",
      });

      if (slotError) {
        console.error(
          `  ❌ Error creating slot ${slot.slot_number}:`,
          slotError.message
        );
      } else {
        const product = products.find((p) => p.id === slot.product_id);
        console.log(
          `  ✅ Slot ${slot.slot_number}: ${product.name} (stock: ${slot.current_stock})`
        );
      }
    }

    // 4. Verify
    console.log("\n4️⃣ Verifying data...");
    const { data: slotsData, error: verifyError } = await supabase
      .from("slots")
      .select(
        `
        slot_number,
        current_stock,
        capacity,
        is_active,
        product:products(name, price)
      `
      )
      .eq("machine_id", "VM01")
      .order("slot_number");

    if (verifyError) {
      console.error("  ❌ Verification error:", verifyError.message);
    } else {
      console.log("\n📊 Final Inventory:");
      console.log("Slot | Product        | Stock | Price  | Status");
      console.log("-----|----------------|-------|--------|----------");
      slotsData.forEach((s) => {
        const status =
          s.is_active && s.current_stock > 0 ? "✅ Available" : "❌ Empty";
        console.log(
          `  ${s.slot_number}  | ${s.product.name.padEnd(14)} | ${
            s.current_stock
          }/${s.capacity}   | Rp ${s.product.price} | ${status}`
        );
      });
    }

    console.log("\n✅ Sample data inserted successfully!\n");
    console.log("🎯 Next steps:");
    console.log("1. Restart backend: npm run dev");
    console.log(
      "2. Test API: curl http://localhost:3001/api/products/available"
    );
    console.log("3. Check frontend: http://localhost:3000\n");
  } catch (error) {
    console.error("\n❌ Failed to insert sample data:", error.message);
    process.exit(1);
  }
}

insertSampleData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
