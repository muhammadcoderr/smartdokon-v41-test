const mongoose = require("mongoose");

const backupDeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      default: "",
    },
    outputDir: {
      type: String,
      default: "",
    },
    appVersion: {
      type: String,
      default: "",
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    lastIpAddress: {
      type: String,
      default: "",
    },
    lastBackupAt: {
      type: Date,
      default: null,
    },
    lastBackupStatus: {
      type: String,
      enum: ["idle", "success", "failed"],
      default: "idle",
    },
    lastBackupFileName: {
      type: String,
      default: "",
    },
    lastBackupMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.BackupDevice || mongoose.model("BackupDevice", backupDeviceSchema);
