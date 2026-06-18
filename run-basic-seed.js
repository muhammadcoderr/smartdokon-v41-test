const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const bcrypt = require("bcryptjs");
const Seller = require("./Models/Seller");
const Cashbox = require("./Models/Cashbox");
const Client = require("./Models/Client");

const BCRYPT_ROUNDS = 10;

const runBasicSeed = async () => {
  try {
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL is not defined in .env file");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    console.log("Running basic seed function...");

    // 1. Admin yaratish
    const adminExists = await Seller.findOne({ login: "admin" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin", BCRYPT_ROUNDS);
      await Seller.create({
        firstname: "Admin",
        login: "admin",
        password: hashedPassword,
        type: "admin",
        status: "active",
      });
      console.log("✅ Admin yaratildi");
    } else {
      console.log("ℹ️ Admin allaqachon mavjud");
    }

    // 2. Sotuvchi yaratish
    const sellerExists = await Seller.findOne({ login: "seller" });
    if (!sellerExists) {
      const hashedPassword = await bcrypt.hash("seller", BCRYPT_ROUNDS);
      await Seller.create({
        firstname: "Sotuvchi",
        login: "seller",
        password: hashedPassword,
        type: "sotuvchi",
        status: "active",
      });
      console.log("✅ Sotuvchi yaratildi");
    } else {
      console.log("ℹ️ Sotuvchi allaqachon mavjud");
    }

    // 3. Kassa boshlang'ich holatini yaratish
    const cashboxExists = await Cashbox.findOne();
    if (!cashboxExists) {
      await Cashbox.create({
        cashBalance: 0,
        cardBalance: 0,
        bankBalance: 0,
        transactions: [],
      });
      console.log("✅ Kassa boshlang'ich holati yaratildi");
    } else {
      console.log("ℹ️ Kassa allaqachon mavjud");
    }

    // 4. Bitta mijoz yaratish
    const clientExists = await Client.findOne();
    if (!clientExists) {
      await Client.create({
        firstname: "Test Mijoz",
        phone: 900000001,
        bonus: 0,
        debts: [],
        paymentHistory: []
      });
      console.log("✅ Bitta test mijoz yaratildi");
    } else {
      console.log("ℹ️ Mijozlar allaqachon mavjud");
    }

    console.log("Basic seeding process completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Basic seeding failed:", error);
    process.exit(1);
  }
};

runBasicSeed();