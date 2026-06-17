require('dotenv').config();
const moment = require('moment');
const Costs = require('../shared/database/models/Costs');
const BotUser = require('../shared/database/models/Bot/BotUser');
const { clearPreviousMessages, trackMessage } = require('../shared/helpers/botHelper');

let pageTracker = {};

// Bugungi xarajatlarni chiqarish funksiyasi
async function sendPaginatedCosts(bot, chatId, page = 1) {
  try {
    clearPreviousMessages(chatId);

    const todayDate = moment().format('YYYY-MM-DD');
    const startOfDay = moment().startOf('day').toDate();
    const endOfDay = moment().endOf('day').toDate();

    const todayCosts = await Costs.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    if (todayCosts.length === 0) {
      return bot.sendMessage(chatId, `📅 <b>Bugungi sana:</b> ${todayDate}\n❌ <b>Xarajatlar topilmadi!</b>`, {
        parse_mode: 'HTML'
      });
    }

    const itemsPerPage = 5;
    const totalPages = Math.ceil(todayCosts.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginated = todayCosts.slice(startIndex, startIndex + itemsPerPage);

    let totalCosts = 0;
    let message = `📅 <b>Bugungi xarajatlar</b> (${todayDate})\n\n`;

    paginated.forEach((cost, index) => {
      totalCosts += cost.amount;

      const paymentTypeText =
        cost.paymentMethod === 'cash' ? '💵 Naqd' :
          cost.paymentMethod === 'card' ? '💳 Karta' :
            cost.paymentMethod === 'bank' ? '🏦 Bank' : '❓ Noma’lum';

      message += `📌 <b>#${startIndex + index + 1}</b>\n`;
      message += `👤 <b>Sotuvchi:</b> ${cost.sellername}\n`;
      message += `💰 <b>Miqdori:</b> ${cost.amount.toLocaleString('uz-UZ')} so'm\n`;
      message += `💳 <b>To‘lov turi:</b> ${paymentTypeText}\n`;
      message += `📝 <b>Izoh:</b> ${cost.description || 'Yo‘q'}\n\n`;
    });

    message += `📊 <b>Jami xarajatlar:</b> ${totalCosts.toLocaleString('uz-UZ')} so'm\n`;
    message += `📄 <b>Sahifa:</b> ${page}/${totalPages}`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: []
      }
    };

    if (page > 1) {
      keyboard.reply_markup.inline_keyboard.push([{
        text: '⬅️ Oldingi',
        callback_data: `costs_${page - 1}`
      }]);
    }

    if (page < totalPages) {
      keyboard.reply_markup.inline_keyboard.push([{
        text: 'Keyingisi ➡️',
        callback_data: `costs_${page + 1}`
      }]);
    }

    bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      ...keyboard
    }).then((sentMessage) => {
      trackMessage(chatId, sentMessage.message_id);
      pageTracker[chatId] = page;
    });

  } catch (error) {
    console.error("Xarajat ma'lumotlarini olishda xatolik:", error.message);
    bot.sendMessage(chatId, '❌ <b>Xarajat ma\'lumotlarini olishda xatolik yuz berdi!</b>', {
      parse_mode: 'HTML'
    });
  }
}

// Telegram bot komandasi
function showTodaysCosts(bot) {
  // Foydalanuvchi komanda yuborganda
  bot.onText(/❌ Xarajatlar/, async (msg) => {
    const chatId = msg.chat.id;
    const botUser = await BotUser.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!botUser || botUser.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    sendPaginatedCosts(bot, msg.chat.id);
  });

  // Inline tugmalar orqali sahifalash
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    const botUser = await BotUser.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!botUser || botUser.role !== 'admin')) {
      return bot.answerCallbackQuery(query.id, { text: "Sizda ruxsat yo'q!", show_alert: true });
    }

    if (data.startsWith("costs_")) {
      const page = parseInt(data.split("_")[1], 10);
      sendPaginatedCosts(bot, chatId, page);
      bot.answerCallbackQuery(query.id);
    }
  });
}

module.exports = showTodaysCosts;
