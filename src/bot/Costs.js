const moment = require('moment');
const { notifyAdmins, setBot } = require('../shared/helpers/botHelper');

const Costs = async (data) => {
  const updatedAtFormatted = moment(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
  
  const paymentTypeText = 
    data.paymentMethod === 'cash' ? '💵 Naqd' : 
    data.paymentMethod === 'card' ? '💳 Karta' : 
    data.paymentMethod === 'bank' ? '🏦 Bank' : '❓ Noma’lum';

  let message = `➕ <b>Yangi xarajat qo'shildi:</b>\n\n`;
  message += `👤 Sotuvchi: ${data.sellername}\n`;
  message += `🎯 Izoh: ${data.description}\n`;
  message += `💰 Qiymati: ${data.amount.toLocaleString('uz-UZ')} so'm\n`;
  message += `💳 To‘lov turi: ${paymentTypeText}\n`;
  message += `⏳ Vaqt: ${updatedAtFormatted}`;

  await notifyAdmins(message);
};

module.exports = { setBot, Costs };
