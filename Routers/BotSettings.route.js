const express = require('express');
const router = express.Router();
const BotSettings = require('../Models/BotSettings');
const BotManager = require('../Bot/BotManager');
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");

const maskToken = (token) => {
    if (!token) return '';
    if (token.length < 10) return '*'.repeat(token.length);
    return token.substring(0, 5) + '*'.repeat(token.length - 10) + token.substring(token.length - 5);
};

router.get('/config', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const settings = await BotSettings.getSettings();
        const subscription = process.env.SUBSCRIPTION || 'STANDARD';

        res.json({
            subscription,
            isAdminBotActive: settings.isAdminBotActive,
            isClientBotActive: settings.isClientBotActive,
            botToken: maskToken(settings.botToken),
            clientBotToken: maskToken(settings.clientBotToken),
            hasBotToken: !!settings.botToken,
            hasClientBotToken: !!settings.clientBotToken,
            adminBotStatus: BotManager.isAdminPolling ? 'online' : 'offline',
            clientBotStatus: BotManager.isClientPolling ? 'online' : 'offline'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/update', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (process.env.SUBSCRIPTION !== 'PRO') {
            return res.status(403).json({ message: "Sizning tarifingizda bu funksiya mavjud emas." });
        }

        const { botToken, clientBotToken } = req.body;
        const settings = await BotSettings.getSettings();

        if (botToken && !botToken.includes('***')) {
            settings.botToken = botToken;
            // If active, restart admin bot to apply new token
            if (settings.isAdminBotActive) {
                await BotManager.stopAdminBot();
                await BotManager.startAdminBot(botToken);
            }
        }
        if (clientBotToken && !clientBotToken.includes('***')) {
            settings.clientBotToken = clientBotToken;
            // If active, restart client bot to apply new token
            if (settings.isClientBotActive) {
                await BotManager.stopClientBot();
                await BotManager.startClientBot(clientBotToken);
            }
        }

        await settings.save();
        res.json({ message: "Sozlamalar yangilandi!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Update error' });
    }
});

router.post('/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (process.env.SUBSCRIPTION !== 'PRO') {
            return res.status(403).json({ message: "Sizning tarifingizda bu funksiya mavjud emas." });
        }

        const { type, isActive } = req.body; // type: 'admin' | 'client'
        const settings = await BotSettings.getSettings();

        if (type === 'admin') {
            settings.isAdminBotActive = isActive;
            if (isActive) {
                await BotManager.startAdminBot(settings.botToken);
            } else {
                await BotManager.stopAdminBot();
            }
        } else if (type === 'client') {
            settings.isClientBotActive = isActive;
            if (isActive) {
                await BotManager.startClientBot(settings.clientBotToken);
            } else {
                await BotManager.stopClientBot();
            }
        }

        await settings.save();

        res.json({
            message: isActive ? `${type === 'admin' ? 'Admin' : 'Mijoz'} boti ishga tushirildi!` : `${type === 'admin' ? 'Admin' : 'Mijoz'} boti to'xtatildi.`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Toggle error' });
    }
});

module.exports = router;
