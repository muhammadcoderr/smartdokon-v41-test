const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });
const bcrypt = require("bcryptjs");

// Central Models
const Branch = require("../../shared/database/models/Branch");
const User = require("../../shared/database/models/User");

// Tenant Models (Schemas)
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const { ClientSchema } = require("../../shared/database/models/Client");

// Managers
const { getTenantConnection } = require("../../shared/database/tenantManager");
const { getModel } = require("../../shared/helpers/modelFactory");

const BCRYPT_ROUNDS = 10;

const runBasicSeed = async () => {
  try {
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL is not defined in .env file");
    }

    console.log("Connecting to Central MongoDB...");
    await mongoose.connect(process.env.MONGO_URL);
    const centralDbName = mongoose.connection.name;
    console.log(`Connected to Central DB: ${centralDbName}`);

    // 1. Asosiy filialni tekshirish yoki yaratish
    let mainBranch = await Branch.findOne({ isMainBranch: true });
    if (!mainBranch) {
      mainBranch = await Branch.create({
        name: "Asosiy Filial",
        location: "Toshkent",
        isMainBranch: true,
        code: "MAIN-001",
        status: "active",
        dbName: centralDbName,
      });
      console.log("✅ Asosiy filial yaratildi");
    } else {
      console.log(`ℹ️ Asosiy filial mavjud: ${mainBranch.name}`);
    }

    // 2. Admin yaratish yoki yangilash (Asosiy filialga bog'lash)
    const hashedPassword = await bcrypt.hash("admin", BCRYPT_ROUNDS);
    let admin = await User.findOne({ login: "admin" });
    
    if (!admin) {
      admin = await User.create({
        firstname: "Admin",
        login: "admin",
        password: hashedPassword,
        type: "admin",
        status: "active",
        branchId: mainBranch._id,
      });
      console.log("✅ Yangi Admin yaratildi va Asosiy filialga bog'landi");
    } else {
      admin.branchId = mainBranch._id; // Majburiy bog'lash
      admin.type = "admin";
      await admin.save();
      console.log("✅ Mavjud Admin Asosiy filialga qayta bog'landi");
    }

    // 3. User yaratish yoki yangilash
    let user = await User.findOne({ login: "user" });
    const userPassword = await bcrypt.hash("user", BCRYPT_ROUNDS);
    if (!user) {
      await User.create({
        firstname: "Foydalanuvchi",
        login: "user",
        password: userPassword,
        type: "user",
        status: "active",
        branchId: mainBranch._id,
      });
      console.log("✅ Foydalanuvchi yaratildi");
    } else {
      user.branchId = mainBranch._id;
      await user.save();
      console.log("✅ Foydalanuvchi yangilandi");
    }

    // --- Tenant DB Logic ---
    console.log(`\nAsosiy filial bazasini sozlash: ${mainBranch.dbName}...`);
    const tenantConn = await getTenantConnection(mainBranch.dbName);
    const Cashbox = getModel(tenantConn, "Cashbox", CashboxSchema);
    
    const cashboxExists = await Cashbox.findOne();
    if (!cashboxExists) {
      await Cashbox.create({
        branchId: mainBranch._id,
        cashBalance: 0,
        cardBalance: 0,
        bankBalance: 0,
        transactions: [],
      });
      console.log("✅ Kassa yaratildi");
    }

    console.log("\nSeed yakunlandi. O'zgarishlar kuchga kirishi uchun bir marta LOGOUT qilib qayta LOGIN qiling.");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
};

runBasicSeed();
