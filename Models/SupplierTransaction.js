const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

let SupplierTransactionSchema = new Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    type: {
      type: String,
      enum: ["purchase", "payment", "return", "adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank", "credit"],
      default: "cash",
    },
    description: {
      type: String,
      trim: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    // For purchase transactions
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Invoice details
    invoiceNumber: {
      type: String,
      trim: true,
    },
    invoiceDate: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    // Status
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
    },
  },
  {
    timestamps: true,
  }
);

SupplierTransactionSchema.plugin(mongoosePaginate);

module.exports = mongoose.model(
  "SupplierTransaction",
  SupplierTransactionSchema
);
