const mongoose = require('mongoose');
const moment = require('moment'); // Sanani formatlash uchun

let bot = null; // Bot obyektini saqlash uchun

// Botni sozlash funksiyasi
const setBot = (botInstance) => {
  bot = botInstance;
};

// Monitor Stock funksiyasini sozlash
const Costs = async (data) => {
  if (!bot) {
    console.error("Bot hali o‘rnatilmagan!");
    return;
  }

  try {
    // 1. Adminlarni olish
    const admins = await mongoose.connection.collection('users').find({ role: 'admin' }).toArray();
    if (!admins || admins.length === 0) {
      console.log("Adminlar topilmadi.");
      return;
    }

    const updatedAtFormatted = moment(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
    
    // Xarajat turi
    
    const paymentTypeText = 
    data.paymentMethod === 'cash' ? '💵 Naqd' : 
    data.paymentMethod === 'card' ? '💳 Karta' : 
    data.paymentMethod === 'bank' ? '🏦 Bank' : '❓ Noma’lum';
  
    let message = `➕ Yangi xarajat qo'shildi:\n\n`;
    message += `👤 Sotuvchi: ${data.sellername}\n`;
    message += `🎯 Izoh: ${data.description}\n`;
    message += `💰 Qiymati: ${data.amount} UZS\n`;
    message += `💳 To‘lov turi: ${paymentTypeText}\n`;
    message += `⏳ Oxirgi yangilanish: ${updatedAtFormatted}`;

    for (const admin of admins) {
      if (admin.chatId) {
        await bot.sendMessage(admin.chatId, message).catch((err) => {
          console.error(`Admin (${admin.username}) uchun xabar yuborishda xatolik:`, err.message);
        });
      }
    }
  } catch (error) {
    console.error("Monitoring funksiyasida xatolik:", error.message);
  }
};

module.exports = { setBot, Costs };