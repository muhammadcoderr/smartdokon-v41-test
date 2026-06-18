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
      unique: true,
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
      unique: true,
    },
    address: {
      type: String,
    },
    bonus: {
      type: Number,
      min: 0,
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
  }
);

ClientSchema.plugin(mongoosePaginate);
ClientSchema.index({ firstname: 1 });

module.exports = mongoose.model("Client", ClientSchema);
