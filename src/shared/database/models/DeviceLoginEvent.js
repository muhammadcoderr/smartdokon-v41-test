const mongoose = require("mongoose");

const deviceLoginEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: "",
    },
    userLogin: {
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

module.exports = mongoose.models.DeviceLoginEvent || mongoose.model("DeviceLoginEvent", deviceLoginEventSchema);
