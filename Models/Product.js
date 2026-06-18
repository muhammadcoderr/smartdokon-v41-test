const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const mongoosePaginate = require("mongoose-paginate-v2");

let ProductSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    sellername: {
      type: String,
      trim: true,
    },
    // Add supplier reference
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true, // Denormalized for faster queries
    },
    arrivalprice: {
      type: Number,
      min: 0,
      required: true,
    },
    sellingprice: {
      type: Number,
      min: 0,
      required: true,
    },
    avialable: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      trim: true,
    },
    barcode: {
      type: String,
      unique: true,
    },
    barcodes: {
      type: [String],
      default: [],
    },
    type: {
      type: String,
      trim: true,
    },
    // Additional supplier-related fields
    supplierProductCode: {
      type: String,
      trim: true,
    },
    minimumStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: "Dona",
    },
    // Purchase tracking
    lastPurchaseDate: {
      type: Date,
    },
    lastPurchasePrice: {
      type: Number,
    },
    totalPurchased: {
      type: Number,
      default: 0,
    },
    totalSold: {
      type: Number,
      default: 0,
    },
    lastSoldDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ProductSchema.index({ supplierId: 1 });
ProductSchema.index({ supplierName: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ updatedAt: -1 });
ProductSchema.index({ category: 1, updatedAt: -1 });
ProductSchema.index({ name: 1 });
ProductSchema.index({ barcodes: 1 });

ProductSchema.virtual("profitMargin").get(function () {
  if (this.arrivalprice > 0) {
    return (
      ((this.sellingprice - this.arrivalprice) / this.arrivalprice) *
      100
    ).toFixed(2);
  }
  return 0;
});

ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Product", ProductSchema);
