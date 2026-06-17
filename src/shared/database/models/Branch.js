const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: false,
      trim: true,
    },
    isMainBranch: {
      type: Boolean,
      default: false,
    },
    parentBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    address: {
      type: String,
      required: false,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    responsiblePerson: {
      type: String,
      required: false,
      trim: true,
    },
    dbName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    mongoUri: {
      type: String,
      required: false,
      trim: true,
    },
    telegramChatId: {
      type: String,
      required: false,
      trim: true,
    },
    telegramBotEnabled: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
  },
  { timestamps: true }
);

// Faqat bitta asosiy filial bo'lishini ta'minlash uchun partial index
branchSchema.index({ isMainBranch: 1 }, { unique: true, partialFilterExpression: { isMainBranch: true } });

module.exports = mongoose.models.Branch || mongoose.model("Branch", branchSchema);
