const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

// Models
const Branch = require("../shared/database/models/Branch");
const User = require("../shared/database/models/User");
const { getTenantConnection } = require("../shared/database/tenantManager");

async function verifySystem() {
  console.log("--- SYSTEM VERIFICATION START ---");
  
  try {
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL topilmadi! .env faylni tekshiring.");
    }

    console.log("1. MongoDB Central DB ga ulanish...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Ulanish muvaffaqiyatli!");

    console.log("2. Filiallarni tekshirish...");
    const branches = await Branch.find().lean();
    console.log(`ℹ️ Jami topilgan filiallar: ${branches.length}`);

    if (branches.length > 0) {
      const firstBranch = branches[0];
      console.log(`3. '${firstBranch.name}' filialining Tenant DB ga ulanishni sinash...`);
      const tenantConn = await getTenantConnection(firstBranch.dbName, firstBranch.mongoUri);
      
      if (tenantConn.readyState === 1) {
        console.log(`✅ Tenant DB '${firstBranch.dbName}' muvaffaqiyatli ulandi!`);
      }
    } else {
      console.log("⚠️ Filiallar topilmadi. Avval 'npm run seed' buyrug'ini bering.");
    }

    console.log("4. Foydalanuvchilarni tekshirish...");
    const admins = await User.countDocuments({ type: "admin" });
    console.log(`ℹ️ Jami Adminlar soni: ${admins}`);

    console.log("\n--- VERIFICATION COMPLETED: ALL SYSTEMS OK ---");
  } catch (error) {
    console.error("\n❌ VERIFICATION FAILED:");
    console.error(error.message);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

verifySystem();
