const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

let SupplierSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    taxId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    // Financial tracking
    totalDebt: {
      type: Number,
      default: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPurchased: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentTerms: {
      type: Number,
      default: 30,
    },
    creditLimit: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

SupplierSchema.virtual("remainingBalance").get(function () {
  return this.totalPurchased - this.totalPaid;
});

SupplierSchema.set("toJSON", { virtuals: true });

SupplierSchema.plugin(mongoosePaginate);

module.exports = mongoose.models.Supplier || mongoose.model("Supplier", SupplierSchema);
module.exports.SupplierSchema = SupplierSchema;
