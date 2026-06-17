const TelegramBot = require('node-telegram-bot-api');
const BotSettings = require('../shared/database/models/BotSettings');
const StartBot = require('./Start');
const ClientBot = require('./ClientBot');

class BotManager {
    constructor() {
        this.adminBot = null;
        this.clientBot = null;
        this.isAdminPolling = false;
        this.isClientPolling = false;
    }

    async init() {
        try {
            if (process.env.SUBSCRIPTION !== 'PRO') {
                console.log('Subscription is not PRO. Bots are disabled.');
                await this.stopAdminBot();
                await this.stopClientBot();
                return;
            }

            const settings = await BotSettings.getSettings();

            // Agar tokenlar env faylda bo'lsa, ularni bazaga yozib qo'yamiz (birinchi marta uchun)
            if (!settings.botToken && process.env.BOT_TOKEN) {
                settings.botToken = process.env.BOT_TOKEN;
                await settings.save();
            }
            if (!settings.clientBotToken && process.env.BOT_TOKEN_CLIENT) {
                settings.clientBotToken = process.env.BOT_TOKEN_CLIENT;
                await settings.save();
            }

            if (settings.isAdminBotActive && settings.botToken) {
                await this.startAdminBot(settings.botToken);
            } else {
                console.log('Admin Bot is inactive.');
            }

            if (settings.isClientBotActive && settings.clientBotToken) {
                await this.startClientBot(settings.clientBotToken);
            } else {
                console.log('Client Bot is inactive.');
            }

        } catch (error) {
            console.error('Error initializing BotManager:', error);
        }
    }

    async startAdminBot(token) {
        if (this.isAdminPolling) return;
        if (!token) return console.error('Admin Bot token missing');

        try {
            process.env.BOT_TOKEN = token;
            console.log('Starting Admin Bot...');
            this.adminBotInstance = StartBot(token);
            this.isAdminPolling = true;
            console.log('Admin Bot started.');
        } catch (error) {
            console.error('Failed to start Admin Bot:', error);
        }
    }

    async startClientBot(token) {
        if (this.isClientPolling) return;
        if (!token) return console.error('Client Bot token missing');

        try {
            process.env.BOT_TOKEN_CLIENT = token;
            console.log('Starting Client Bot...');
            this.clientBotInstance = new ClientBot(token);
            this.isClientPolling = true;
            console.log('Client Bot started.');
        } catch (error) {
            console.error('Failed to start Client Bot:', error);
        }
    }

    async stopAdminBot() {
        if (!this.isAdminPolling) return;
        try {
            if (this.adminBotInstance && this.adminBotInstance.stopPolling) {
                await this.adminBotInstance.stopPolling();
            }
            this.adminBotInstance = null;
            this.isAdminPolling = false;
            console.log('Admin Bot stopped.');
        } catch (e) {
            console.error('Error stopping Admin Bot:', e);
        }
    }

    async stopClientBot() {
        if (!this.isClientPolling) return;
        try {
            if (this.clientBotInstance && this.clientBotInstance.bot && this.clientBotInstance.bot.stopPolling) {
                await this.clientBotInstance.bot.stopPolling();
            }
            this.clientBotInstance = null;
            this.isClientPolling = false;
            console.log('Client Bot stopped.');
        } catch (e) {
            console.error('Error stopping Client Bot:', e);
        }
    }

    async restart() {
        await this.stopAdminBot();
        await this.stopClientBot();
        await this.init();
    }
}

module.exports = new BotManager();
