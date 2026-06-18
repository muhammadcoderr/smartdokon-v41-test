const mongoose = require('mongoose');
const moment = require('moment');

let bot = null;

const setBot = (botInstance) => {
    bot = botInstance;
};

const notifyCreditSale = async (paymentData, clientData) => {
    if (!bot) {
        console.error("Bot is not set for DebtNotification!");
        return;
    }

    try {
        const ownerId = process.env.OWNER_ID;
        const admins = await mongoose.connection.collection('users').find({ role: 'admin' }).toArray();

        const adminChatIds = new Set();
        if (ownerId) adminChatIds.add(Number(ownerId));
        admins.forEach(admin => {
            if (admin.chatId) adminChatIds.add(admin.chatId);
        });

        const date = moment().format('YYYY-MM-DD HH:mm:ss');
        let message = `⚠️ DIQQAT! Qarzga savdo qilindi:\n\n`;
        message += `👤 Mijoz: ${clientData.firstname}\n`;
        message += `📞 Telefon: ${clientData.phone}\n`;
        message += `💰 Qarz miqdori: ${paymentData.indebtedness.toLocaleString('uz-UZ')} so'm\n`;
        message += `🛒 Jami summa: ${paymentData.totalPrice.toLocaleString('uz-UZ')} so'm\n`;
        message += `📅 Sana: ${date}\n`;

        for (const chatId of adminChatIds) {
            await bot.sendMessage(chatId, message).catch(err => console.error(`Error sending debt notification to ${chatId}:`, err.message));
        }
    } catch (error) {
        console.error("Error in notifyCreditSale:", error.message);
    }
};

module.exports = { setBot, notifyCreditSale };
