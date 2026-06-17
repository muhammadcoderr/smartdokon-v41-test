const mongoose = require('mongoose');

// Foydalanuvchi sxemasi
const BotUserSchema = new mongoose.Schema({
  chatId: {
    type: Number,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    default: 'NoUsername',
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'client'],
    default: 'user',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false
  },
  isClientBotUser: {
    type: Boolean,
    default: false
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: false
  }
});

// Model yaratish
const BotUser = mongoose.models.BotUser || mongoose.model('BotUser', BotUserSchema);

module.exports = BotUser;
