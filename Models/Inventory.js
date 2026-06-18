const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const mongoosePaginate = require("mongoose-paginate-v2");

const InventorySchema = new Schema(
  {
    checker: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    checkerName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    notes: {
      type: String,
    },
    items: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        expectedQuantity: {
          type: Number,
          required: true,
        },
        actualQuantity: {
          type: Number,
          required: true,
        },
        difference: {
          type: Number,
          required: true,
        },
        arrivalPrice: {
          type: Number,
          required: true,
        },
        sellingPrice: {
          type: Number,
          required: true,
        },
      },
    ],
    totalDiscrepancyValue: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

InventorySchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Inventory", InventorySchema);
