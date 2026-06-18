const mongoose = require("mongoose");

const deviceLoginEventSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    sellerName: {
      type: String,
      default: "",
    },
    sellerLogin: {
      type: String,
      default: "",
    },
    deviceId: {
      type: String,
      default: "",
      index: true,
    },
    deviceName: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      enum: ["web", "agent"],
      default: "web",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("DeviceLoginEvent", deviceLoginEventSchema);
