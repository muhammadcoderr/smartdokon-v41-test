const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const StockSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    minThreshold: {
      type: Number,
      default: 5,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Har bir filialda har bir mahsulotdan faqat bitta stock yozuvi bo'lishi kerak
StockSchema.index({ product: 1, branch: 1 }, { unique: true });

const Stock = mongoose.models.Stock || mongoose.model("Stock", StockSchema);
module.exports = Stock;
module.exports.StockSchema = StockSchema;
