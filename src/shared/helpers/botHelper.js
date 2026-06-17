const mongoose = require('mongoose');

let bot = null;
let activeMessages = {}; // Har bir chat uchun faol xabarlarni saqlash

const setBot = (botInstance) => {
  bot = botInstance;
};

const getBot = () => bot;

/**
 * Faol xabarlarni o'chirish funksiyasi.
 */
function clearPreviousMessages(chatId) {
  if (!bot) return;
  if (activeMessages[chatId]) {
    activeMessages[chatId].forEach((messageId) => {
      bot.deleteMessage(chatId, messageId).catch(() => {});
    });
    activeMessages[chatId] = [];
  }
}

/**
 * Yangi yuborilgan xabarni "faol" deb belgilash (keyinchalik o'chirish uchun).
 */
function trackMessage(chatId, messageId) {
  if (!activeMessages[chatId]) activeMessages[chatId] = [];
  activeMessages[chatId].push(messageId);
}

/**
 * Tizimdagi barcha adminlarga xabar yuborish.
 * Bu funksiya OWNER_ID va 'admin' rolidagi foydalanuvchilarni qamrab oladi.
 */
const notifyAdmins = async (message, options = {}) => {
  if (!bot) {
    console.error("Bot hali o‘rnatilmagan!");
    return;
  }

  try {
    const ownerId = process.env.OWNER_ID;
    const BotUser = require('../database/models/Bot/BotUser');
    const admins = await BotUser.find({ role: 'admin' }).lean();

    const adminChatIds = new Set();
    if (ownerId) adminChatIds.add(Number(ownerId));
    admins.forEach(admin => {
      if (admin.chatId) adminChatIds.add(Number(admin.chatId));
    });

    const sendPromises = Array.from(adminChatIds).map(chatId => 
      bot.sendMessage(chatId, message, { parse_mode: 'HTML', ...options })
        .catch(err => console.error(`Admin (${chatId}) uchun xabar yuborishda xatolik:`, err.message))
    );

    await Promise.all(sendPromises);
  } catch (error) {
    console.error("notifyAdmins xatolik:", error.message);
  }
};

module.exports = { setBot, getBot, notifyAdmins };
