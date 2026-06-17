const mongoose = require("mongoose");

const backupSettingsSchema = new mongoose.Schema(
  {
    autoBackupEnabled: {
      type: Boolean,
      default: false,
    },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "daily",
    },
    assignedDeviceId: {
      type: String,
      default: "",
    },
    backupDeviceKey: {
      type: String,
      default: "",
    },
    nextBackupAt: {
      type: Date,
      default: null,
    },
    lastSuccessfulBackupAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

backupSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }

  return settings;
};

module.exports = mongoose.models.BackupSettings || mongoose.model("BackupSettings", backupSettingsSchema);
