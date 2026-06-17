const moment = require('moment');
const { notifyAdmins, setBot } = require('../shared/helpers/botHelper');

const notifyCreditSale = async (paymentData, clientData) => {
    const date = moment().format('YYYY-MM-DD HH:mm:ss');
    let message = `⚠️ <b>DIQQAT! Qarzga savdo qilindi:</b>\n\n`;
    message += `👤 Mijoz: ${clientData.firstname}\n`;
    message += `📞 Telefon: ${clientData.phone}\n`;
    message += `💰 Qarz miqdori: ${paymentData.indebtedness.toLocaleString('uz-UZ')} so'm\n`;
    message += `🛒 Jami summa: ${paymentData.totalPrice.toLocaleString('uz-UZ')} so'm\n`;
    message += `📅 Sana: ${date}\n`;

    await notifyAdmins(message);
};

module.exports = { setBot, notifyCreditSale };
