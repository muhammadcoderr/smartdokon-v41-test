const TelegramBot = require("node-telegram-bot-api");
const BotUser = require("../shared/database/models/Bot/BotUser");
require("dotenv").config();

let bot;
const clientBot = new TelegramBot(process.env.BOT_TOKEN_CLIENT, { polling: false });
const adminStates = new Map();

const setBot = (adminBot) => {
    bot = adminBot;
};

const getMediaInfo = async (msg) => {
    let type = 'text';
    let fileId = null;
    let text = msg.text || msg.caption || "";
    let entities = msg.entities || msg.caption_entities || [];

    if (msg.photo) {
        type = 'photo';
        fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.video) {
        type = 'video';
        fileId = msg.video.file_id;
    } else if (msg.animation) {
        type = 'animation';
        fileId = msg.animation.file_id;
    } else if (msg.document) {
        type = 'document';
        fileId = msg.document.file_id;
    } else if (msg.audio) {
        type = 'audio';
        fileId = msg.audio.file_id;
    } else if (msg.voice) {
        type = 'voice';
        fileId = msg.voice.file_id;
    }

    let fileUrl = null;
    if (fileId) {
        const file = await bot.getFile(fileId);
        fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    }

    return { type, fileUrl, text, entities };
};

const sendToClient = async (chatId, mediaInfo) => {
    const options = {
        parse_mode: 'HTML',
        caption: mediaInfo.text,
        caption_entities: mediaInfo.entities
    };

    switch (mediaInfo.type) {
        case 'text':
            return clientBot.sendMessage(chatId, mediaInfo.text, { entities: mediaInfo.entities });
        case 'photo':
            return clientBot.sendPhoto(chatId, mediaInfo.fileUrl, options);
        case 'video':
            return clientBot.sendVideo(chatId, mediaInfo.fileUrl, options);
        case 'animation':
            return clientBot.sendAnimation(chatId, mediaInfo.fileUrl, options);
        case 'document':
            return clientBot.sendDocument(chatId, mediaInfo.fileUrl, options);
        case 'audio':
            return clientBot.sendAudio(chatId, mediaInfo.fileUrl, options);
        case 'voice':
            return clientBot.sendVoice(chatId, mediaInfo.fileUrl, options);
        default:
            throw new Error("Unsupported media type");
    }
};

const init = () => {
    if (!bot) return;

    bot.onText(/📢 Reklama/, async (msg) => {
        const chatId = msg.chat.id;
        const ownerId = process.env.OWNER_ID;
        const user = await BotUser.findOne({ chatId });

        if (chatId.toString() !== ownerId && (!user || user.role !== 'admin')) return;

        adminStates.set(chatId, { step: 'WAITING_FOR_MESSAGE' });

        bot.sendMessage(chatId, "📢 <b>Reklama bo'limiga xush kelibsiz!</b>\n\nIltimos, mijozlarga yubormoqchi bo'lgan xabaringizni yozing yoki boshqa kanaldan <b>forward</b> qiling. Xabar rasm, video yoki oddiy matn bo'lishi mumkin.", {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [[{ text: "❌ Bekor qilish" }]],
                resize_keyboard: true
            }
        });
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = adminStates.get(chatId);

        if (!state) return;

        if (msg.text === "❌ Bekor qilish") {
            adminStates.delete(chatId);
            const { generateButtons } = require("./Button.js");
            const user = await BotUser.findOne({ chatId });
            const isOwner = chatId.toString() === process.env.OWNER_ID;
            return bot.sendMessage(chatId, "Reklama bekor qilindi.", generateButtons(user?.role || 'admin', isOwner));
        }

        if (state.step === 'WAITING_FOR_MESSAGE') {
            bot.sendMessage(chatId, "⏳ <b>Xabar qayta ishlanmoqda...</b>", { parse_mode: 'HTML' });

            try {
                const mediaInfo = await getMediaInfo(msg);
                adminStates.set(chatId, {
                    step: 'CONFIRMING',
                    mediaInfo
                });

                bot.sendMessage(chatId, "✅ <b>Xabar tayyor!</b>\n\nUni barcha mijozlarga yuborishni tasdiqlaysizmi?", {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ Tasdiqlash", callback_data: "broadcast_confirm" }, { text: "❌ Bekor qilish", callback_data: "broadcast_cancel" }]
                        ]
                    }
                });
            } catch (error) {
                console.error("Error processing message:", error);
                bot.sendMessage(chatId, "❌ Xabarni qayta ishlashda xatolik yuz berdi. Iltimos boshqa xabar yuborib ko'ring.");
            }
        }
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const state = adminStates.get(chatId);

        if (data === "broadcast_confirm") {
            if (!state || state.step !== 'CONFIRMING') {
                return bot.answerCallbackQuery(query.id, { text: "Xatolik: Ma'lumot topilmadi." });
            }

            await bot.answerCallbackQuery(query.id, { text: "Yuborish boshlandi..." });
            await bot.deleteMessage(chatId, query.message.message_id);

            const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Reklama yuborilmoqda...</b>", { parse_mode: 'HTML' });

            try {
                const clients = await BotUser.find({ isClientBotUser: true });
                let successCount = 0;
                let failCount = 0;

                for (const client of clients) {
                    try {
                        await sendToClient(client.chatId, state.mediaInfo);
                        successCount++;
                    } catch (err) {
                        failCount++;
                        console.error(`Error sending to ${client.chatId}:`, err.message);
                    }
                }

                adminStates.delete(chatId);
                const { generateButtons } = require("./Button.js");
                const user = await BotUser.findOne({ chatId });
                const isOwner = chatId.toString() === process.env.OWNER_ID;

                await bot.editMessageText(`📢 <b>Reklama yakunlandi!</b>\n\n✅ Yetkazildi: <b>${successCount}</b> ta\n❌ Xatolik: <b>${failCount}</b> ta`, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'HTML'
                });

                bot.sendMessage(chatId, "Asosiy menyuga qaytdik:", generateButtons(user?.role || 'admin', isOwner));
            } catch (error) {
                console.error("Broadcast error:", error);
                bot.sendMessage(chatId, "Xabar yuborishda xatolik yuz berdi.");
            }
        } else if (data === "broadcast_cancel") {
            adminStates.delete(chatId);
            await bot.answerCallbackQuery(query.id, { text: "Bekor qilindi" });
            await bot.deleteMessage(chatId, query.message.message_id);

            const { generateButtons } = require("./Button.js");
            const user = await BotUser.findOne({ chatId });
            const isOwner = chatId.toString() === process.env.OWNER_ID;
            bot.sendMessage(chatId, "Reklama bekor qilindi.", generateButtons(user?.role || 'admin', isOwner));
        }
    });
};

module.exports = { setBot, init };
