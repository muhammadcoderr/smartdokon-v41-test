require('dotenv').config();
const Cashbox = require('../shared/database/models/Cashbox');
const BotUser = require('../shared/database/models/Bot/BotUser');
const { clearPreviousMessages, trackMessage } = require('../shared/helpers/botHelper');

let transactionsCache = {}; // Tranzaksiya ma'lumotlari uchun cache

function formatDateTime(value) {
  if (!value) return "Kiritilmagan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Kiritilmagan";
  return date.toLocaleString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// Kassa tugmasi funksiyasi
function initKassa(bot) {
  bot.onText(/💰 Kassa/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await BotUser.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.sendMessage(chatId, "⚠️ Ogohlantirish: Siz ushbu botdan foydalanish huquqiga ega emassiz.");
    }

    clearPreviousMessages(chatId);

    try {
      const cashbox = await Cashbox.findOne();
      const { cashBalance, cardBalance, bankBalance, transactions } = cashbox;

      transactionsCache[chatId] = [...transactions].reverse(); // Tranzaksiyalarni cache saqlash

      const message = `
📅 <b>Kassa ma'lumotlari:</b>

💵 <b>Naqd:</b> ${cashBalance.toLocaleString('uz-UZ')} so'm
💳 <b>Karta:</b> ${cardBalance.toLocaleString('uz-UZ')} so'm
🏦 <b>Bank:</b> ${bankBalance.toLocaleString('uz-UZ')} so'm
      `;

      bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📜 Tranzaksiyalar", callback_data: "transactions_0" }],
          ],
        },
      }).then((sentMessage) => {
        trackMessage(chatId, sentMessage.message_id);
      });

    } catch (error) {
      console.error('API dan ma\'lumot olishda xatolik:', error.message);
      bot.sendMessage(chatId, 'Ma\'lumotlarni olishda xatolik yuz berdi.');
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    const user = await BotUser.findOne({ chatId });
    const isOwner = chatId.toString() === process.env.OWNER_ID;

    if (!isOwner && (!user || user.role !== 'admin')) {
      return bot.answerCallbackQuery(query.id, { text: "Sizda ruxsat yo'q!", show_alert: true });
    }

    if (data.startsWith("transactions_")) {
      const page = parseInt(data.split("_")[1]);
      sendTransactions(bot, chatId, page, query.message.message_id);
    }
  });
}

// Tranzaksiyalarni jo'natish
function sendTransactions(bot, chatId, page, messageId) {
  const transactions = transactionsCache[chatId] || [];
  const perPage = 10;
  const start = page * perPage;
  const end = start + perPage;
  const paginated = transactions.slice(start, end);

  if (paginated.length === 0) {
    return bot.answerCallbackQuery(chatId, { text: "Tranzaksiyalar topilmadi!", show_alert: true });
  }

  let message = `📜 Tranzaksiyalar (${start + 1}-${end}):\n\n`;

  paginated.forEach((t) => {
    const typeEmoji = t.type === "income" ? "🟢" : "🔴";
    const date = formatDateTime(t.date);

    message += `📅 ${date}\n${typeEmoji} ${t.amount.toLocaleString('uz-UZ')} so'm (${t.paymentMethod}) - ${t.description}\n\n`;
  });


  let buttons = [];
  if (start > 0) buttons.push({ text: "⬅️ Oldingi", callback_data: `transactions_${page - 1}` });
  if (end < transactions.length) buttons.push({ text: "Keyingi ➡️", callback_data: `transactions_${page + 1}` });

  bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [buttons] },
  }).catch(console.error);
}

module.exports = initKassa;
