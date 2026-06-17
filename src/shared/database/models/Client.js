const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

let ClientSchema = new Schema(
  {
    firstname: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: Number,
      required: true,
    },
    login: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
    },
    avatar: {
      type: String,
    },
    banner: {
      type: String,
    },
    birthday: {
      type: Date,
    },
    referralCode: {
      type: String,
    },
    address: {
      type: String,
    },
    gender: {
      type: String,
      enum: ['Erkak', 'Ayol', ''],
      default: ''
    },
    bonus: {
      type: Number,
      min: 0,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    debts: [
      {
        description: {
          type: String,
          required: true,
        },
        date: {
          type: String,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
      },
    ],
    paymentHistory: [
      {
        // Yangi maydon qo'shildi
        amount: {
          type: Number,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        description: {
          type: String,
        },
      },
    ],
  },
  {
    collection: "clients",
    timestamps: true,
  }
);

ClientSchema.plugin(mongoosePaginate);
ClientSchema.index({ firstname: 1 });
// Har bir filialda telefon va referal kod noyob bo'lishi kerak
ClientSchema.index({ phone: 1, branchId: 1 }, { unique: true });
ClientSchema.index({ referralCode: 1, branchId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Client || mongoose.model("Client", ClientSchema);
module.exports.ClientSchema = ClientSchema;
