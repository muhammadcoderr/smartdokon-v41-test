const bcrypt = require("bcryptjs");
const Seller = require("../Models/Seller");
const Cashbox = require("../Models/Cashbox");

const BCRYPT_ROUNDS = 10;

async function seedDefaultUsers() {
  try {
    // Check for default admin
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
      console.log("Default admin created successfully with hashed password.");
    }

    // Check for default seller
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
      console.log("Default seller created successfully with hashed password.");
    }

    // Initialize default Cashbox
    const cashboxExists = await Cashbox.findOne();
    if (!cashboxExists) {
      await Cashbox.create({
        cashBalance: 0,
        cardBalance: 0,
        bankBalance: 0,
        transactions: [],
      });
      console.log("Default Cashbox initialized successfully.");
    }
  } catch (error) {
    console.error("Error seeding default users:", error);
  }
}

module.exports = seedDefaultUsers;