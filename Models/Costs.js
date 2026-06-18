const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

let CostsSchema = new Schema(
  {
    sellername: {
      type: String,
    },
    // Add supplier reference for supplier-related costs
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank"],
      default: "cash",
    },
    // Cost category
    category: {
      type: String,
      enum: ["supplier_payment", "operational", "maintenance", "other"],
      default: "other",
    },
    // Reference to supplier transaction if it's a supplier payment
    supplierTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierTransaction",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

CostsSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Costs", CostsSchema);
