require('dotenv').config();
const axios = require('axios'); // API bilan ishlash uchun
const Product = require('../Models/Product'); // to‘liq yo‘lni yozing
const User = require('../Models/Bot/Users');


// Faol xabarlarni o'chirish uchun massiv
let activeMessages = {};

// Eski xabarlarni o'chirish funksiyasi
function clearPreviousMessages(bot, chatId) {
  if (activeMessages[chatId]) {
    activeMessages[chatId].forEach((messageId) => {
      bot.deleteMessage(chatId, messageId).catch((err) => {
        console.error(`Xabarni o'chirishda xatolik: ${err.message}`);
      });
    });
    activeMessages[chatId] = [];
  }
}

// Mahsulotlar/Ombor bo'limi tugmasi funksiyasi
function initProduct(bot) {
  const showProductMenu = (chatId) => {
    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "🚫 Tugayotganlar" }, { text: "🏆 Top Mahsulotlar" }],
          [{ text: "🕒 Sotilmaganlar" }, { text: "🚫 Tugaganlar" }],
          [{ text: "🔙 Orqaga" }],
        ],
        resize_keyboard: true,
      },
    };
    bot.sendMessage(chatId, "📉 <b>Ombor holati:</b>", { parse_mode: 'HTML', ...keyboard });
  };

  bot.onText(/🛒 Mahsulotlar|📦 Ombor/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    showProductMenu(chatId);
  });

  // Tugayotgan mahsulotlar (minimumStock dan kam)
  bot.onText(/🚫 Tugayotganlar/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    try {
      const products = await Product.find({ $expr: { $lt: ["$avialable", "$minimumStock"] }, avialable: { $gt: 0 } });
      if (products.length === 0) {
        return bot.sendMessage(chatId, "✅ Hozirda tugayotgan mahsulotlar yo'q.");
      }
      let message = "⚠️ <b>Tugayotgan mahsulotlar:</b>\n\n";
      products.forEach((p, i) => {
        message += `${i + 1}. ${p.name} - <b>${p.avialable}</b> ${p.unit} (Min: ${p.minimumStock})\n`;
      });
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      bot.sendMessage(chatId, "Xatolik yuz berdi.");
    }
  });

  // Top mahsulotlar
  bot.onText(/🏆 Top Mahsulotlar/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    try {
      const products = await Product.find().sort({ totalSold: -1 }).limit(10);
      let message = "🏆 <b>Eng ko'p sotilgan mahsulotlar:</b>\n\n";
      products.forEach((p, i) => {
        message += `${i + 1}. ${p.name} - <b>${p.totalSold}</b> marta\n`;
      });
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      bot.sendMessage(chatId, "Xatolik yuz berdi.");
    }
  });

  // Sotilmaganlar (Qolib ketganlar)
  bot.onText(/🕒 Sotilmaganlar/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    bot.sendMessage(chatId, "Necha oy davomida sotilmagan mahsulotlarni ko'rmoqchisiz? (Misol: 3)", {
      reply_markup: { force_reply: true }
    }).then(sent => {
      bot.onReplyToMessage(chatId, sent.message_id, async (reply) => {
        const months = parseInt(reply.text);
        if (isNaN(months) || months < 1) return bot.sendMessage(chatId, "Noto'g'ri raqam.");

        const now = new Date();
        const products = await Product.find();
        const filtered = products.filter(p => {
          const updatedAt = new Date(p.updatedAt);
          const diff = (now.getFullYear() - updatedAt.getFullYear()) * 12 + (now.getMonth() - updatedAt.getMonth());
          return diff >= months && p.avialable > 0;
        });

        if (filtered.length === 0) return bot.sendMessage(chatId, "Bunday mahsulotlar topilmadi.");
        let message = `📦 <b>${months} oy davomida sotilmaganlar:</b>\n\n`;
        filtered.slice(0, 30).forEach((p, i) => {
          message += `${i + 1}. ${p.name} - ${p.avialable} ${p.unit}\n`;
        });
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      });
    });
  });

  // Tugagan mahsulotlar
  bot.onText(/🚫 Tugaganlar/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    try {
      const products = await Product.find({ avialable: { $lte: 0 } });
      if (products.length === 0) return bot.sendMessage(chatId, "Hozircha tugagan mahsulotlar yo'q.");
      let message = "🚫 <b>Tugagan mahsulotlar:</b>\n\n";
      products.forEach((p, i) => {
        message += `${i + 1}. ${p.name}\n`;
      });
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      bot.sendMessage(chatId, "Xatolik yuz berdi.");
    }
  });
}

module.exports = initProduct;
