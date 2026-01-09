// Quick test script to verify backend setup
import admin from "./src/config/firebase.js";

console.log("🧪 Testing Firebase Configuration...\n");

try {
  const app = admin.app();
  console.log("✅ Firebase Admin initialized successfully");
  console.log(`   Project ID: ${app.options.projectId || "Not set"}`);
  console.log(`   Storage Bucket: ${app.options.storageBucket || "Not set"}\n`);

  console.log("✅ Backend configuration looks good!");
  console.log("\n📝 Next steps:");
  console.log("   1. Make sure you've configured Firebase credentials in .env");
  console.log("   2. Run: bun run dev");
  console.log("   3. Test: http://localhost:3000/health\n");

  process.exit(0);
} catch (error) {
  console.error("❌ Firebase configuration error:", error.message);
  console.error("\n📝 Please check:");
  console.error("   1. .env file exists with correct Firebase credentials");
  console.error(
    "   2. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set"
  );
  console.error(
    "   3. Or GOOGLE_APPLICATION_CREDENTIALS points to your service account JSON\n"
  );
  process.exit(1);
}
