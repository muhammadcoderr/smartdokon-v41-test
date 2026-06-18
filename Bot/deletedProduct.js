const mongoose = require('mongoose');
const moment = require('moment'); // Sanani formatlash uchun

let bot = null; // Bot obyektini saqlash uchun

// Botni sozlash funksiyasi
const setBot = (botInstance) => {
  bot = botInstance;
};

// O‘chirilgan mahsulot haqida adminlarga xabar yuborish funksiyasi
const deletedProduct = async (data) => {
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
    let message = `🗑 Diqqat! Quyidagi mahsulot o'chirib tashlandi:\n\n`;
    message += `🪫 Mahsulot: ${data.name}\n`;
    message += `🎯 Kategoriyasi: ${data.category}\n`;
    message += `💰 Kelish: ${data.arrivalprice} UZS\n`;
    message += `💰 Sotish: ${data.sellingprice} UZS\n`;
    message += `💡 Qoldi: ${data.avialable}\n`;
    message += `📔 Shtrix kodi: ${data.barcode}\n`;
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

module.exports = { setBot, deletedProduct };
