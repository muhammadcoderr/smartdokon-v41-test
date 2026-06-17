const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const mongoosePaginate = require("mongoose-paginate-v2");

const BranchRevisionSchema = new Schema(
  {
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    branchName: {
      type: String,
      required: true,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },
    productsSummary: {
      addedProductsCount: { type: Number, default: 0 },
      stockInValue: { type: Number, default: 0 }, // Total value of arrived products (arrivalprice * quantity)
    },
    financialSummary: {
      totalRevenue: { type: Number, default: 0 }, // Jami tushum
      totalProfit: { type: Number, default: 0 }, // Sof foyda
      totalCosts: { type: Number, default: 0 }, // Jami xarajatlar
    },
    cashboxSummary: {
      openingBalance: { type: Number, default: 0 },
      closingBalance: { type: Number, default: 0 },
      cashIn: { type: Number, default: 0 },
      terminalIn: { type: Number, default: 0 },
    },
    debtsSummary: {
      givenDebts: { type: Number, default: 0 },
      paidDebts: { type: Number, default: 0 },
    },
    expensesBreakdown: [
      {
        category: { type: String },
        amount: { type: Number, default: 0 },
      },
    ],
    salesByCategory: [
      {
        category: { type: String },
        revenue: { type: Number, default: 0 },
        profit: { type: Number, default: 0 },
      },
    ],
    topProducts: [
      {
        name: { type: String },
        quantity: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
      },
    ],
    fullProductPerformance: [
      {
        name: { type: String },
        quantity: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
        profit: { type: Number, default: 0 },
      }
    ],
    paymentMethodsBreakdown: {
      cash: { type: Number, default: 0 },
      terminal: { type: Number, default: 0 },
      debt: { type: Number, default: 0 },
      bonus: { type: Number, default: 0 },
    },
    comparison: {
      revenueGrowth: { type: Number, default: 0 }, // Percentage
      profitGrowth: { type: Number, default: 0 }, // Percentage
    },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one revision per branch per month
BranchRevisionSchema.index({ branchId: 1, "period.year": 1, "period.month": 1 }, { unique: true });

BranchRevisionSchema.plugin(mongoosePaginate);

module.exports = mongoose.models.BranchRevision || mongoose.model("BranchRevision", BranchRevisionSchema);
