const bcrypt = require("bcryptjs");
const User = require("../../shared/database/models/User");
const Cashbox = require("../../shared/database/models/Cashbox");

const BCRYPT_ROUNDS = 10;

async function seedDefaultUsers() {
  try {
    // Check for default admin
    const adminExists = await User.findOne({ login: "admin" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin", BCRYPT_ROUNDS);
      await User.create({
        firstname: "Admin",
        login: "admin",
        password: hashedPassword,
        type: "admin",
        status: "active",
      });
      console.log("Default admin created successfully with hashed password.");
    }

    // Check for default user
    const userExists = await User.findOne({ login: "user" });
    if (!userExists) {
      const hashedPassword = await bcrypt.hash("user", BCRYPT_ROUNDS);
      await User.create({
        firstname: "Foydalanuvchi",
        login: "user",
        password: hashedPassword,
        type: "user",
        status: "active",
      });
      console.log("Default user created successfully with hashed password.");
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
