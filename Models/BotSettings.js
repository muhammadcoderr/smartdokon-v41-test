const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
    botToken: { type: String, default: '' },
    clientBotToken: { type: String, default: '' },
    isAdminBotActive: { type: Boolean, default: false },
    isClientBotActive: { type: Boolean, default: false },
}, { timestamps: true });

// Ensure only one settings document exists
botSettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('BotSettings', botSettingsSchema);
