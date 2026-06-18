require("dotenv").config(); // .env fayldan o'qish uchun
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const User = require("../Models/Bot/Users"); // Foydalanuvchi modeli
const { generateButtons } = require("./Button.js"); // Tugmalar moduli
const initAdminPanel = require("./Admin"); // Admin.js fayli
const initKassa = require("./Kassa.js");
const initProduct = require("./Product.js");
const showTodaysCosts = require("./showTodaysCosts.js");
const Costs = require("./Costs.js");
const deleteProduct = require("./deletedProduct.js");
const monitorStock = require("./monitorStock.js");
const productNumber = require("./ProductNumber.js");
const DebtNotification = require("./DebtNotification.js");
const Summary = require("./Summary.js");
const Broadcast = require("./Broadcast.js");

// Foydalanuvchini bazaga saqlash yoki yangilash funksiyasi
async function saveUserToDatabase(msg) {
  const chatId = msg.chat.id;
  const username = msg.chat.username || `NoUsername_${chatId}`;
  const firstName = msg.chat.first_name || "Ismi yo'q";
  const lastName = msg.chat.last_name || "Familiyasi yo'q";

  // Default roli - "user"
  const role = "user";

  try {
    // Foydalanuvchi bazada bormi yoki yo'qmi, tekshirish
    const existingUser = await User.findOne({ chatId });

    if (!existingUser) {
      const newUser = new User({
        chatId,
        username,
        firstName,
        lastName,
        role, // Default rol
      });

      await newUser.save();
      console.log(`Foydalanuvchi saqlandi: ${username}`);
      return role;
    } else {
      console.log(`Foydalanuvchi allaqachon bazada: ${chatId}`);
      return existingUser.role; // Bazadagi foydalanuvchining rolini qaytarish
    }
  } catch (err) {
    console.error("Foydalanuvchini saqlashda xatolik:", err.message);
    return null;
  }
}

// /start buyrug'iga ishlov berish
function Start(token) {
  if (!token) {
    console.error("Admin Bot token is missing.");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  initAdminPanel(bot);
  initKassa(bot);
  initProduct(bot);
  showTodaysCosts(bot);
  Costs.setBot(bot);
  deleteProduct.setBot(bot);
  monitorStock.setBot(bot);
  productNumber.setBot(bot);
  DebtNotification.setBot(bot);
  Summary.setBot(bot);
  Broadcast.setBot(bot);
  Broadcast.init();

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name || "Foydalanuvchi";
    const ownerId = process.env.OWNER_ID;

    // Foydalanuvchini bazaga saqlash va uning rolini olish
    const role = await saveUserToDatabase(msg);
    const isOwner = chatId.toString() === ownerId;

    // Helper to escape HTML characters
    const escapeHtml = (unsafe) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const safeFirstName = escapeHtml(firstName);

    if (role === "admin" || isOwner) {
      // Agar foydalanuvchi admin yoki owner bo'lsa, tegishli tugmalarni yuborish
      const buttons = generateButtons(role, isOwner);
      bot.sendMessage(
        chatId,
        `Assalomu alaykum, <b>${safeFirstName}</b>!\nSmart-Dokon boshqaruv tizimiga xush kelibsiz!`,
        { parse_mode: 'HTML', ...buttons }
      );
    } else if (role == "user") {
      bot.sendMessage(
        chatId,
        `Assalomu alaykum, ${safeFirstName}! \n\n⚠️ <b>Ogohlantirish:</b> Siz ushbu botdan foydalanish huquqiga ega emassiz. Bu bot faqat do'kon ma'muriyati uchun.`,
        { parse_mode: 'HTML' }
      );
    } else {
      bot.sendMessage(
        chatId,
        "Kechirasiz, tizimda xatolik yuz berdi. Qayta urinib ko'ring."
      );
    }
  });

  bot.onText(/📊 Dashboard/, async (msg) => {
    const chatId = msg.chat.id;
    const ownerId = process.env.OWNER_ID;
    const user = await User.findOne({ chatId });

    if (chatId.toString() !== ownerId && (!user || user.role !== 'admin')) return;

    bot.sendMessage(chatId, "📊 <b>Hisobot davrini tanlang:</b>", {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 Bugun", callback_data: "report_today" }, { text: "📆 Kecha", callback_data: "report_yesterday" }],
          [{ text: "🗓 Shu oy", callback_data: "report_month" }]
        ]
      }
    });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('report_')) {
      const period = data.split('_')[1];
      await bot.answerCallbackQuery(query.id);
      await Summary.sendManualSummary(chatId, period);
    }
  });

  bot.onText(/🔙 Orqaga/, async (msg) => {
    const chatId = msg.chat.id;
    const ownerId = process.env.OWNER_ID;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === ownerId;

    if (isOwner || (user && user.role === 'admin')) {
      const buttons = generateButtons(user?.role || 'admin', isOwner);
      bot.sendMessage(chatId, "Asosiy menyu:", buttons);
    }
  });

  console.log("Admin bot ishlamoqda...");

  return bot; // Return instance for manager
}

module.exports = Start;
