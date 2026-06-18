const mongoose = require("mongoose");

const CashboxSchema = new mongoose.Schema({
  cashBalance: { type: Number, required: true, default: 0 }, // Naqd pul
  cardBalance: { type: Number, required: true, default: 0 }, // Karta raqam
  bankBalance: { type: Number, required: true, default: 0 }, // Bank hisobi
  transactions: [
    {
      type: { type: String, enum: ["income", "expense"], required: true }, // Kirim yoki chiqim
      amount: { type: Number, required: true }, // Pul miqdori
      paymentMethod: { type: String, enum: ["cash", "card", "bank"], required: true }, // Naqd, karta yoki bank orqali
      description: { type: String }, // Nima uchun ishlatilgani
      date: { type: Date, default: Date.now }, // Vaqt
      relatedClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    },
  ],
});

const Cashbox = mongoose.model("Cashbox", CashboxSchema);
module.exports = Cashbox;
