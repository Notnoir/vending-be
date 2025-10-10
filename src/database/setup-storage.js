const { supabase } = require("../config/supabase");

/**
 * Setup Supabase Storage Buckets
 * This script creates necessary storage buckets for the vending machine application
 */

async function setupStorage() {
  console.log("🗄️  Setting up Supabase Storage...\n");

  try {
    // 1. Create product-images bucket
    console.log("Creating product-images bucket...");
    const { data: bucket, error: bucketError } =
      await supabase.storage.createBucket("product-images", {
        public: true, // Make images publicly accessible
        fileSizeLimit: 5242880, // 5MB limit
        allowedMimeTypes: [
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
        ],
      });

    if (bucketError) {
      if (bucketError.message.includes("already exists")) {
        console.log('✅ Bucket "product-images" already exists');
      } else {
        throw bucketError;
      }
    } else {
      console.log('✅ Bucket "product-images" created successfully');
    }

    // 2. List all buckets to verify
    console.log("\n📦 Available storage buckets:");
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets();

    if (listError) throw listError;

    buckets.forEach((b) => {
      console.log(`  - ${b.name} (${b.public ? "Public" : "Private"})`);
    });

    // 3. Setup bucket policies (if needed)
    console.log("\n🔐 Setting up storage policies...");
    console.log("Note: Policies should be configured in Supabase Dashboard:");
    console.log("  1. Go to Storage > Policies");
    console.log('  2. Create policies for "product-images" bucket:');
    console.log("     - SELECT: Allow public access");
    console.log("     - INSERT: Allow authenticated users");
    console.log("     - UPDATE: Allow authenticated users");
    console.log("     - DELETE: Allow authenticated users");

    console.log("\n✅ Storage setup completed!\n");

    // Test upload
    console.log("🧪 Testing file upload...");
    await testUpload();
  } catch (error) {
    console.error("❌ Storage setup failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Make sure SUPABASE_SERVICE_KEY is set in .env");
    console.error("2. Verify your Supabase project is accessible");
    console.error("3. Check if you have necessary permissions");
    process.exit(1);
  }
}

async function testUpload() {
  try {
    // Create a simple test file
    const testContent = "Test image content";
    const testBuffer = Buffer.from(testContent);
    const testFileName = `test-${Date.now()}.txt`;

    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(`test/${testFileName}`, testBuffer, {
        contentType: "text/plain",
        upsert: false,
      });

    if (error) throw error;

    console.log("✅ Test upload successful:", data.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(`test/${testFileName}`);

    console.log("📎 Public URL:", urlData.publicUrl);

    // Clean up test file
    await supabase.storage
      .from("product-images")
      .remove([`test/${testFileName}`]);

    console.log("🧹 Test file cleaned up");
  } catch (error) {
    console.error("❌ Test upload failed:", error.message);
  }
}

// Helper function to get storage info
async function getStorageInfo() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();

    console.log("\n📊 Storage Information:\n");

    for (const bucket of buckets) {
      console.log(`Bucket: ${bucket.name}`);
      console.log(`  ID: ${bucket.id}`);
      console.log(`  Public: ${bucket.public}`);
      console.log(`  Created: ${bucket.created_at}`);

      // List files in bucket
      const { data: files } = await supabase.storage
        .from(bucket.name)
        .list("", { limit: 5 });

      console.log(`  Files: ${files ? files.length : 0}`);
      console.log("");
    }
  } catch (error) {
    console.error("Error getting storage info:", error.message);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupStorage()
    .then(() => {
      console.log("🎉 All done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

module.exports = {
  setupStorage,
  getStorageInfo,
};
