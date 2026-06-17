const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const mongoosePaginate = require("mongoose-paginate-v2");

const ProductTransferSchema = new Schema(
  {
    fromBranch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    toBranch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    products: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0.01,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    note: {
      type: String,
    },
    transferDate: {
      type: Date,
      default: Date.now,
    },
    receivedDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ProductTransferSchema.plugin(mongoosePaginate);

module.exports = mongoose.models.ProductTransfer || mongoose.model("ProductTransfer", ProductTransferSchema);
