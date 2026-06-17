const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let DebtsSchema = new Schema(
  {
    // Client debts (existing)
    clientname: {
      type: String,
    },
    // Supplier debts (new)
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true,
    },
    debtType: {
      type: String,
      enum: ["client", "supplier"],
      required: true,
      default: "client",
    },
    debtsdesc: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "paid", "overdue", "cancelled"],
      default: "active",
    },
    dueDate: {
      type: Date,
    },
    amount: [
      {
        date: {
          type: Date,
          required: true,
          default: Date.now,
        },
        amount: {
          type: Number,
          required: true,
        },
        type: {
          type: String,
          enum: ["debt", "payment"],
          required: true,
        },
        description: {
          type: String,
        },
      },
    ],
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for remaining balance
DebtsSchema.virtual("balance").get(function () {
  return this.totalAmount - this.paidAmount;
});

DebtsSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.models.Debts || mongoose.model("Debts", DebtsSchema);
module.exports.DebtsSchema = DebtsSchema;
