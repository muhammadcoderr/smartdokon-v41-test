const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

const ProductBatchSchema = new Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    batchNumber: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    previousQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    newQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    arrivalprice: {
      type: Number,
      required: true,
      min: 0,
    },
    sellingprice: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: "Dona",
    },
    category: {
      type: String,
      trim: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank", "credit"],
      default: "credit",
    },
    note: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

ProductBatchSchema.index({ createdAt: -1 });
ProductBatchSchema.index({ productName: 1 });
ProductBatchSchema.index({ supplierId: 1, createdAt: -1 });

ProductBatchSchema.plugin(mongoosePaginate);

module.exports = mongoose.models.ProductBatch || mongoose.model("ProductBatch", ProductBatchSchema);
module.exports.ProductBatchSchema = ProductBatchSchema;
