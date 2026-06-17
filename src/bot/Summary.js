const mongoose = require('mongoose');
const moment = require('moment');
const cron = require('node-cron');
const Payment = require('../shared/database/models/Payment');
const Costs = require('../shared/database/models/Costs');
const Cashbox = require('../shared/database/models/Cashbox');

let bot = null;

const setBot = (botInstance) => {
    bot = botInstance;
};

const getSummaryData = async (startDate, endDate) => {
    // Payments (Income)
    const payments = await Payment.find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'success'
    });

    let totalIncome = 0;
    let totalProfit = 0;
    let totalCard = 0;
    let totalCash = 0;
    let totalDebtGenerated = 0;
    const productStats = {}; // To track Top Products

    // Valid products IDs to fetch names
    const productIds = new Set();
    payments.forEach(p => {
        if (p.products) {
            p.products.forEach(prod => {
                if (prod.productId) productIds.add(prod.productId);
            });
        }
    });

    const productsMap = {};
    if (productIds.size > 0) {
        const Product = require('../shared/database/models/Product');
        const productsList = await Product.find({ _id: { $in: Array.from(productIds) } });
        productsList.forEach(prod => {
            productsMap[prod._id.toString()] = prod.name;
        });
    }

    payments.forEach(p => {
        totalIncome += (p.totalPrice || 0);
        totalCash += (p.cash || 0);
        totalCard += (p.terminal || 0);
        totalDebtGenerated += (p.indebtedness || 0);

        if (p.products) {
            p.products.forEach(prod => {
                const arrival = prod.arrivalprice || 0;
                const selling = prod.sellingprice || 0;
                const qty = prod.quantity || 0;
                totalProfit += (selling - arrival) * qty;

                // Track product sales for Top Products
                const pName = productsMap[prod.productId] || prod.name || 'Noma\'lum';
                if (!productStats[pName]) {
                    productStats[pName] = { qty: 0, total: 0 };
                }
                productStats[pName].qty += qty;
                productStats[pName].total += (selling * qty);
            });
        }
    });

    // Costs (Expenses)
    const costs = await Costs.find({
        createdAt: { $gte: startDate, $lte: endDate }
    });

    let totalExpenses = 0;
    costs.forEach(c => {
        totalExpenses += (c.amount || 0);
    });

    const netProfit = totalProfit - totalExpenses;

    // Sort product stats to get Top 5
    const topProducts = Object.entries(productStats)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5);

    return {
        totalIncome,
        totalProfit,
        totalExpenses,
        netProfit,
        totalCash,
        totalCard,
        totalDebtGenerated,
        topProducts
    };
};

const formatSummaryMessage = (data, title, cashbox = null) => {
    let message = `📊 <b>${title}</b>\n\n`;
    message += `💰 <b>Savdo:</b> ${data.totalIncome.toLocaleString('uz-UZ')} so'm\n`;
    message += `📈 <b>Foyda (savdodan):</b> ${data.totalProfit.toLocaleString('uz-UZ')} so'm\n`;
    message += `❌ <b>Xarajatlar:</b> ${data.totalExpenses.toLocaleString('uz-UZ')} so'm\n`;
    message += `💵 <b>Sof Daromad:</b> ${data.netProfit.toLocaleString('uz-UZ')} so'm\n\n`;

    message += `💳 <b>To'lov turlari:</b>\n`;
    message += `• Naqd: ${data.totalCash.toLocaleString('uz-UZ')} so'm\n`;
    message += `• Karta: ${data.totalCard.toLocaleString('uz-UZ')} so'm\n`;
    message += `• Qarz: ${data.totalDebtGenerated.toLocaleString('uz-UZ')} so'm\n\n`;

    if (data.topProducts.length > 0) {
        message += `🏆 <b>Top 5 Mahsulot:</b>\n`;
        data.topProducts.forEach(([name, stats], index) => {
            message += `${index + 1}. ${name} (${stats.qty} ta)\n`;
        });
        message += `\n`;
    }

    if (cashbox) {
        message += `🏦 <b>Kassa Holati:</b>\n`;
        message += `• Naqd: ${cashbox.cashBalance.toLocaleString('uz-UZ')} so'm\n`;
        message += `• Karta: ${cashbox.cardBalance.toLocaleString('uz-UZ')} so'm\n`;
        message += `• Bank: ${cashbox.bankBalance.toLocaleString('uz-UZ')} so'm\n`;
    }

    return message;
};

const sendDailySummary = async () => {
    if (!bot) return;
    try {
        const startOfDay = moment().startOf('day').toDate();
        const endOfDay = moment().endOf('day').toDate();
        const data = await getSummaryData(startOfDay, endOfDay);
        const cashbox = await Cashbox.findOne();
        const dateStr = moment().format('DD.MM.YYYY');
        const message = formatSummaryMessage(data, `KUNLIK HISOBOT (${dateStr})`, cashbox);

        const ownerId = process.env.OWNER_ID;
        const BotUser = require('../shared/database/models/Bot/BotUser');
        const admins = await BotUser.find({ role: 'admin' }).lean();
        const adminChatIds = new Set();
        if (ownerId) adminChatIds.add(Number(ownerId));
        admins.forEach(admin => { if (admin.chatId) adminChatIds.add(admin.chatId); });

        for (const chatId of adminChatIds) {
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch(e => console.error(e));
        }
    } catch (error) {
        console.error("Error in sendDailySummary:", error.message);
    }
};

const sendManualSummary = async (chatId, period) => {
    if (!bot) return;
    try {
        let startDate, endDate, title;
        const now = moment();

        if (period === 'today') {
            startDate = now.clone().startOf('day').toDate();
            endDate = now.clone().endOf('day').toDate();
            title = `BUGUNGI HISOBOT (${now.format('DD.MM.YYYY')})`;
        } else if (period === 'yesterday') {
            startDate = now.clone().subtract(1, 'day').startOf('day').toDate();
            endDate = now.clone().subtract(1, 'day').endOf('day').toDate();
            title = `KECHAGI HISOBOT (${now.clone().subtract(1, 'day').format('DD.MM.YYYY')})`;
        } else if (period === 'month') {
            startDate = now.clone().startOf('month').toDate();
            endDate = now.clone().endOf('day').toDate();
            title = `SHU OYLIK HISOBOT (${now.format('MMMM')})`;
        }

        const data = await getSummaryData(startDate, endDate);
        const message = formatSummaryMessage(data, title);
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error("Error in sendManualSummary:", error.message);
        bot.sendMessage(chatId, "Hisobotni tayyorlashda xatolik yuz berdi.");
    }
};

cron.schedule('59 23 * * *', async () => {
    await sendDailySummary();
});

module.exports = { setBot, sendDailySummary, sendManualSummary };
