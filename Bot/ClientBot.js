require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const User = require('../Models/Bot/Users');
const Client = require('../Models/Client');
const Payment = require('../Models/Payment');
const Debts = require('../Models/Debts');
const BonusSettings = require('../Models/BonusSettings');
const { default: mongoose } = require('mongoose');
const bcrypt = require('bcryptjs');

function formatDate(value, fallback = 'Kiritilmagan') {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('uz-UZ');
}

class ClientBot {
    constructor(token) {
        const botToken = token || process.env.BOT_TOKEN_CLIENT;
        if (!botToken) {
            console.error("Client Bot token is missing.");
            return;
        }
        this.bot = new TelegramBot(botToken, { polling: true });
        this.userStates = new Map();
        this.initializeBot();
    }

    initializeBot() {
        this.bot.onText(/\/start(.*)/, async (msg, match) => {
            await this.handleStart(msg, match[1]);
        });

        this.bot.on('callback_query', async (callbackQuery) => {
            await this.handleCallbackQuery(callbackQuery);
        });

        this.bot.on('message', async (msg) => {
            if (!msg.text || msg.text.startsWith('/')) return;
            await this.handleTextMessage(msg);
        });

        console.log('Client bot is running...');
    }

    async handleStart(msg, referralCode = '') {
        const chatId = msg.chat.id;
        const firstName = msg.chat.first_name || 'Foydalanuvchi';

        try {
            const existingBotUser = await User.findOne({ chatId });

            if (!existingBotUser) {
                const newBotUser = new User({
                    chatId,
                    username: msg.chat.username || `NoUsername_${chatId}`,
                    firstName: msg.chat.first_name || 'Ismi yo\'q',
                    lastName: msg.chat.last_name || 'Familiyasi yo\'q',
                    role: 'client',
                    isClientBotUser: true
                });
                await newBotUser.save();
            } else if (!existingBotUser.isClientBotUser) {
                existingBotUser.isClientBotUser = true;
                await existingBotUser.save();
            }

            let existingClient = null;

            if (existingBotUser && existingBotUser.clientId) {
                existingClient = await Client.findById(existingBotUser.clientId);
            }

            if (existingClient) {
                await this.showMainMenu(chatId, existingClient.firstname);
            } else {
                await this.showWelcomeMenu(chatId, firstName, referralCode.trim());
            }
        } catch (error) {
            console.error('Error in handleStart:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async showWelcomeMenu(chatId, firstName, referralCode = '') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Ro\'yxatdan o\'tish', callback_data: `register_${referralCode}` }],
                    [{ text: '🔐 Kirish', callback_data: 'login' }]
                ]
            }
        };

        const message = `Assalomu alaykum, ${firstName}! 👋\n\n` +
            `Bizning xizmatimizdan foydalanish uchun ro'yxatdan o'ting yoki tizimga kiring.\n\n` +
            `${referralCode ? `🎁 Sizda taklif kodi bor: ${referralCode}` : ''}`;

        await this.bot.sendMessage(chatId, message, keyboard);
    }

    async showMainMenu(chatId, firstName) {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Mening ma\'lumotlarim', callback_data: 'my_info' }],
                    [{ text: '🎁 Bonuslarim', callback_data: 'my_bonuses' }],
                    [{ text: '📦 Oxirgi buyurtmalarim', callback_data: 'my_orders' }],
                    [{ text: '💳 Qarzlarim', callback_data: 'my_debts' }],
                    [{ text: '📞 Yordam', callback_data: 'help' }]
                ]
            }
        };

        const message = `Xush kelibsiz, ${firstName}! 🏪\n\n` +
            `Kerakli bo'limni tanlang:`;

        await this.bot.sendMessage(chatId, message, keyboard);
    }

    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;

        try {
            await this.bot.answerCallbackQuery(callbackQuery.id);
            const user = await User.findOne({ chatId });
            if (!user) {
                await this.bot.sendMessage(chatId, 'Foydalanuvchi topilmadi. Iltimos, /start buyrug\'ini yuboring.');
                return;
            }

            if (data === 'contact_support') {
                await this.bot.sendMessage(chatId,
                    `📞 Iltimos, biz bilan bog'lanish uchun quyidagi raqamga qo'ng'iroq qiling: +998901234567\n` +
                    `Yoki Telegram orqali aloqaga chiqish uchun @SupportBot ga yozing.`
                );
            } else if (data.startsWith('register_')) {
                const referralCode = data.replace('register_', '');
                await this.startRegistration(chatId, referralCode);
            } else if (data === 'login') {
                await this.startLogin(chatId);
            } else if (data === 'my_info') {
                await this.showClientInfo(chatId);
            } else if (data === 'my_bonuses') {
                await this.showClientBonuses(chatId);
            } else if (data === 'my_orders') {
                await this.showClientOrders(chatId);
            } else if (data.startsWith('my_orders_page_')) {
                const page = parseInt(data.replace('my_orders_page_', ''));
                await this.showClientOrders(chatId, page);
            } else if (data === 'my_debts') {
                await this.showClientDebts(chatId);
            } else if (data.startsWith('my_debts_page_')) {
                const page = parseInt(data.replace('my_debts_page_', ''));
                await this.showClientDebts(chatId, page);
            } else if (data === 'help') {
                await this.showHelp(chatId);
            } else if (data === 'set_birthday') {
                await this.startSetBirthday(chatId);
            } else if (data === 'share_referral') {
                await this.showReferralLink(chatId);
            } else if (data === 'back_to_menu') {
                const client = user?.clientId ? await Client.findById(user.clientId) : null;
                await this.showMainMenu(chatId, client?.firstname || 'Foydalanuvchi');
            }
        } catch (error) {
            console.error('Error in handleCallbackQuery:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async startRegistration(chatId, referralCode) {
        this.userStates.set(chatId, {
            state: 'REGISTRATION_NAME',
            referralCode
        });

        await this.bot.sendMessage(chatId,
            '📝 Ro\'yxatdan o\'tish\n\n' +
            'Iltimos, ismingizni kiriting:'
        );
    }

    async startLogin(chatId) {
        this.userStates.set(chatId, { state: 'LOGIN_USERNAME' });

        await this.bot.sendMessage(chatId,
            '🔐 Tizimga kirish\n\n' +
            'Iltimos, loginigizni kiriting:'
        );
    }

    async startSetBirthday(chatId) {
        this.userStates.set(chatId, { state: 'SET_BIRTHDAY' });

        await this.bot.sendMessage(chatId,
            '🎂 Tug\'ilgan kuningizni kiriting\n\n' +
            'Format: DD.MM.YYYY (Masalan: 31.12.1990):'
        );
    }

    async handleTextMessage(msg) {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userState = this.userStates.get(chatId);

        if (!userState) return;

        try {
            switch (userState.state) {
                case 'REGISTRATION_NAME':
                    await this.handleRegistrationName(chatId, text, userState);
                    break;
                case 'REGISTRATION_PHONE':
                    await this.handleRegistrationPhone(chatId, text, userState);
                    break;
                case 'REGISTRATION_LOGIN':
                    await this.handleRegistrationLogin(chatId, text, userState);
                    break;
                case 'REGISTRATION_PASSWORD':
                    await this.handleRegistrationPassword(chatId, text, userState);
                    break;
                case 'REGISTRATION_ADDRESS':
                    await this.handleRegistrationAddress(chatId, text, userState);
                    break;
                case 'LOGIN_USERNAME':
                    await this.handleLoginUsername(chatId, text, userState);
                    break;
                case 'LOGIN_PASSWORD':
                    await this.handleLoginPassword(chatId, text, userState);
                    break;
                case 'SET_BIRTHDAY':
                    await this.handleSetBirthday(chatId, text);
                    break;
            }
        } catch (error) {
            console.error('Error in handleTextMessage:', error);
            await this.bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
        }
    }

    async handleRegistrationName(chatId, name, userState) {
        userState.firstname = name;
        userState.state = 'REGISTRATION_PHONE';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId,
            'Iltimos, telefon raqamingizni kiriting (Masalan: 998901234567):'
        );
    }

    async handleRegistrationPhone(chatId, phone, userState) {
        const phoneNumber = parseInt(phone);
        if (isNaN(phoneNumber) || !/^998\d{9}$/.test(phone)) {
            return this.bot.sendMessage(chatId, 'Noto\'g\'ri format. 998XXXXXXXXX ko\'rinishida kiriting:');
        }

        const existing = await Client.findOne({ phone: phoneNumber });
        if (existing) {
            return this.bot.sendMessage(chatId, 'Bu telefon raqami band. Boshqa raqam kiriting:');
        }

        userState.phone = phoneNumber;
        userState.state = 'REGISTRATION_LOGIN';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId, 'Iltimos, bot uchun login yarating:');
    }

    async handleRegistrationLogin(chatId, login, userState) {
        if (login.length < 3) {
            return this.bot.sendMessage(chatId, 'Login juda qisqa. Kamida 3 ta belgi bo\'lsin:');
        }

        const existing = await Client.findOne({ login });
        if (existing) {
            return this.bot.sendMessage(chatId, 'Bu login band. Boshqa login kiriting:');
        }

        userState.login = login;
        userState.state = 'REGISTRATION_PASSWORD';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId, 'Iltimos, parol yarating:');
    }

    async handleRegistrationPassword(chatId, password, userState) {
        if (password.length < 4) {
            return this.bot.sendMessage(chatId, 'Parol juda qisqa. Kamida 4 ta belgi bo\'lsin:');
        }

        userState.password = await bcrypt.hash(password, 10);
        userState.state = 'REGISTRATION_ADDRESS';
        this.userStates.set(chatId, userState);

        await this.bot.sendMessage(chatId, 'Iltimos, manzilingizni kiriting:');
    }

    async handleRegistrationAddress(chatId, address, userState) {
        try {
            const newClient = new Client({
                firstname: userState.firstname,
                phone: userState.phone,
                login: userState.login,
                password: userState.password,
                address: address,
                bonus: 0,
                referralCode: this.generateReferralCode()
            });

            if (userState.referralCode) {
                const referrer = await Client.findOne({ referralCode: userState.referralCode });
                if (referrer) {
                    const bonusSettings = await BonusSettings.getSettings();
                    const referrerBonus = bonusSettings.referral?.referrerBonus || 50000;
                    const newUserBonus = bonusSettings.referral?.newUserBonus || 25000;

                    referrer.bonus = (referrer.bonus || 0) + referrerBonus;
                    await referrer.save();
                    newClient.bonus = newUserBonus;

                    // Referal egasini xabardor qilish
                    try {
                        const referrerUser = await User.findOne({ clientId: referrer._id });
                        if (referrerUser && referrerUser.chatId) {
                            const notificationMessage = `🎁 <b>Yangi bonus!</b>\n\n` +
                                `Sizning taklif kodingiz orqali <b>${userState.firstname}</b> ro'yxatdan o'tdi.\n` +
                                `Sizga <b>${referrerBonus.toLocaleString()} so'm</b> bonus berildi! ✅`;
                            await this.bot.sendMessage(referrerUser.chatId, notificationMessage, { parse_mode: 'HTML' });
                        }
                    } catch (notifyError) {
                        console.error('Error notifying referrer:', notifyError);
                    }
                }
            }

            await newClient.save();
            await User.updateOne({ chatId }, { clientId: newClient._id, role: 'client' });
            this.userStates.delete(chatId);

            await this.bot.sendMessage(chatId, `✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!\nLogin: ${userState.login}\nBonus: ${newClient.bonus} so'm`);
            this.showMainMenu(chatId, userState.firstname);
        } catch (e) {
            console.error(e);
            this.bot.sendMessage(chatId, 'Xatolik yuz berdi.');
        }
    }

    async handleLoginUsername(chatId, login, userState) {
        userState.login = login;
        userState.state = 'LOGIN_PASSWORD';
        this.userStates.set(chatId, userState);
        await this.bot.sendMessage(chatId, 'Parolingizni kiriting:');
    }

    async handleLoginPassword(chatId, password, userState) {
        try {
            const client = await Client.findOne({ login: userState.login });
            if (!client || !client.password) {
                this.userStates.delete(chatId);
                return this.bot.sendMessage(chatId, 'Login yoki parol noto\'g\'ri.');
            }

            const isMatch = await bcrypt.compare(password, client.password);
            if (!isMatch) {
                this.userStates.delete(chatId);
                return this.bot.sendMessage(chatId, 'Login yoki parol noto\'g\'ri.');
            }

            await User.updateOne({ chatId }, { clientId: client._id, role: 'client' });
            this.userStates.delete(chatId);

            await this.bot.sendMessage(chatId, `✅ Xush kelibsiz, ${client.firstname}!`);
            this.showMainMenu(chatId, client.firstname);
        } catch (e) {
            console.error(e);
            this.bot.sendMessage(chatId, 'Xatolik yuz berdi.');
        }
    }

    async handleSetBirthday(chatId, dateStr) {
        try {
            const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
            if (!dateRegex.test(dateStr)) {
                return this.bot.sendMessage(chatId, 'Noto\'g\'ri format. Iltimos, DD.MM.YYYY ko\'rinishida kiriting (Masalan: 31.12.1990):');
            }

            const [day, month, year] = dateStr.split('.').map(Number);
            const date = new Date(year, month - 1, day);

            if (isNaN(date.getTime())) {
                return this.bot.sendMessage(chatId, 'Noto\'g\'ri sana. Iltimos, haqiqiy sanani kiriting:');
            }

            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                return this.bot.sendMessage(chatId, 'Foydalanuvchi topilmadi.');
            }

            await Client.findByIdAndUpdate(user.clientId, { birthday: date });
            this.userStates.delete(chatId);

            await this.bot.sendMessage(chatId, '✅ Tug\'ilgan kuningiz muvaffaqiyatli saqlandi!');
            await this.showClientInfo(chatId);
        } catch (e) {
            console.error(e);
            this.bot.sendMessage(chatId, 'Xatolik yuz berdi.');
        }
    }

    async showClientInfo(chatId) {
        try {
            const user = await User.findOne({ chatId: Number(chatId) });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi. Iltimos, /start buyrug\'ini yuboring.');
                return;
            }
            const client = await Client.findById(user.clientId);
            if (!client) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎂 Tug\'ilgan kunni o\'zgartirish', callback_data: 'set_birthday' }],
                        [{ text: '🔗 Taklif kodini ulashish', callback_data: 'share_referral' }],
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                    ]
                }
            };
            const birthDate = formatDate(client.birthday);
            const message = `👤 Sizning ma'lumotlaringiz:\n\n` +
                `📝 Ism: ${client.firstname}\n` +
                `📞 Telefon: ${client.phone}\n` +
                `📍 Manzil: ${client.address || 'Kiritilmagan'}\n` +
                `🎂 Tug'ilgan kun: ${birthDate}\n` +
                `🔗 Taklif kodingiz: ${client.referralCode || 'Mavjud emas'}\n\n` +
                `💡 Taklif kodingizni do'stlaringiz bilan ulashing va bonus oling!`;
            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing client info:', error);
            await this.bot.sendMessage(chatId, 'Ma\'lumotlarni yuklashda xatolik yuz berdi.');
        }
    }

    async showClientBonuses(chatId) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const client = await Client.findById(user.clientId);
            if (!client) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                    ]
                }
            };

            const message = `🎁 Sizning bonuslaringiz:\n\n` +
                `💰 Joriy bonus: ${(client.bonus || 0).toLocaleString()} so'm\n\n` +
                `💡 Ko'proq bonus olish uchun do'stlaringizni taklif qiling!`;

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing bonuses:', error);
            await this.bot.sendMessage(chatId, 'Bonus ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showClientOrders(chatId, page = 1) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const limit = 5;
            const skip = (page - 1) * limit;

            const totalOrders = await Payment.countDocuments({ clientId: user.clientId.toString() });
            const totalPages = Math.ceil(totalOrders / limit);

            const recentOrders = await Payment.find({ clientId: user.clientId.toString() })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const keyboard = {
                reply_markup: {
                    inline_keyboard: []
                }
            };

            const navButtons = [];
            if (page > 1) {
                navButtons.push({ text: '⬅️ Oldingi', callback_data: `my_orders_page_${page - 1}` });
            }
            if (page < totalPages) {
                navButtons.push({ text: 'Keyingi ➡️', callback_data: `my_orders_page_${page + 1}` });
            }
            if (navButtons.length > 0) {
                keyboard.reply_markup.inline_keyboard.push(navButtons);
            }
            keyboard.reply_markup.inline_keyboard.push([{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]);

            let message = `📦 Buyurtmalaringiz (Sahifa ${page}/${totalPages || 1}):\n\n`;

            if (recentOrders.length === 0) {
                message += `Hali buyurtmalar yo'q.\n\n`;
            } else {
                recentOrders.forEach((order, index) => {
                    const orderDate = order.date || formatDate(order.createdAt);
                    message += `${skip + index + 1}. 📅 ${orderDate}\n`;
                    message += `   💰 Summa: ${(order.totalPrice || 0).toLocaleString()} so'm\n\n`;
                });
            }

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing orders:', error);
            await this.bot.sendMessage(chatId, 'Buyurtmalar ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showClientDebts(chatId, page = 1) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const client = await Client.findById(user.clientId);
            if (!client) {
                await this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
                return;
            }

            const allDebts = (client.debts || []).filter(d => d.amount > 0);
            const limit = 5;
            const totalPages = Math.ceil(allDebts.length / limit);
            const startIndex = (page - 1) * limit;
            const paginatedDebts = allDebts.slice(startIndex, startIndex + limit);

            const keyboard = {
                reply_markup: {
                    inline_keyboard: []
                }
            };

            const navButtons = [];
            if (page > 1) {
                navButtons.push({ text: '⬅️ Oldingi', callback_data: `my_debts_page_${page - 1}` });
            }
            if (page < totalPages) {
                navButtons.push({ text: 'Keyingi ➡️', callback_data: `my_debts_page_${page + 1}` });
            }
            if (navButtons.length > 0) {
                keyboard.reply_markup.inline_keyboard.push(navButtons);
            }
            keyboard.reply_markup.inline_keyboard.push([{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]);

            let message = `💳 Qarzlaringiz (Sahifa ${page}/${totalPages || 1}):\n\n`;
            let totalDebt = allDebts.reduce((sum, d) => sum + d.amount, 0);

            if (allDebts.length === 0) {
                message += `✅ Sizda qarz yo'q! Ajoyib!\n\n`;
            } else {
                paginatedDebts.forEach((debt, index) => {
                    message += `${startIndex + index + 1}. 📅 ${debt.date}\n`;
                    message += `   💰 Summa: ${debt.amount.toLocaleString()} so'm\n\n`;
                });

                message += `🔴 Jami qarz: ${totalDebt.toLocaleString()} so'm\n\n`;
            }

            await this.bot.sendMessage(chatId, message, keyboard);
        } catch (error) {
            console.error('Error showing debts:', error);
            await this.bot.sendMessage(chatId, 'Qarz ma\'lumotlarini yuklashda xatolik yuz berdi.');
        }
    }

    async showHelp(chatId) {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]
                ]
            }
        };

        const message = `📞 Yordam va aloqa:\n\n🏪 Do'kon nomi: Smart Dokon\n📍 Manzil: Andijon\n\nQanday yordam bera olamiz?`;
        await this.bot.sendMessage(chatId, message, keyboard);
    }

    async showReferralLink(chatId) {
        try {
            const user = await User.findOne({ chatId });
            if (!user || !user.clientId) {
                return this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
            }

            const client = await Client.findById(user.clientId);
            if (!client) {
                return this.bot.sendMessage(chatId, 'Mijoz ma\'lumotlari topilmadi.');
            }

            const botInfo = await this.bot.getMe();
            const referralLink = `https://t.me/${botInfo.username}?start=${client.referralCode}`;

            const bonusSettings = await BonusSettings.getSettings();
            const referrerBonus = bonusSettings.referral?.referrerBonus || 50000;
            const newUserBonus = bonusSettings.referral?.newUserBonus || 25000;

            const message = `🎁 <b>Sizning taklif kodingiz:</b> <code>${client.referralCode}</code>\n\n` +
                `🔗 <b>Sizning maqsadli havolangiz:</b>\n${referralLink}\n\n` +
                `💡 Ushbu havolani do'stlaringizga yuboring. Ular ro'yxatdan o'tishsa, sizga ${referrerBonus.toLocaleString()} so'm, ularga esa ${newUserBonus.toLocaleString()} so'm bonus beriladi!`;

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Orqaga', callback_data: 'my_info' }]
                    ]
                }
            });
        } catch (error) {
            console.error('Error showing referral link:', error);
            await this.bot.sendMessage(chatId, 'Havolani yaratishda xatolik yuz berdi.');
        }
    }

    generateReferralCode() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }
}

module.exports = ClientBot;
