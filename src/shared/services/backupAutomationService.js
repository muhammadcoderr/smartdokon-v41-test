const BackupSettings = require("../database/models/BackupSettings");
const BackupDevice = require("../database/models/BackupDevice");
const crypto = require("crypto");

const generateBackupDeviceKey = () => crypto.randomBytes(32).toString("hex");

const resolveStoredBackupDeviceKey = (settings) =>
  settings?.backupDeviceKey || process.env.BACKUP_DEVICE_KEY || "";

const addInterval = (baseDate, frequency) => {
  const nextDate = new Date(baseDate);

  if (frequency === "weekly") {
    nextDate.setDate(nextDate.getDate() + 7);
    return nextDate;
  }

  if (frequency === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  nextDate.setDate(nextDate.getDate() + 1);
  return nextDate;
};

const resolveBackupOverview = async () => {
  const settings = await BackupSettings.getSettings();
  const devices = await BackupDevice.find({}).sort({ updatedAt: -1 }).lean();
  const assignedDevice = devices.find((device) => device.deviceId === settings.assignedDeviceId) || null;

  return {
    settings,
    devices,
    assignedDevice,
  };
};

const upsertBackupDevice = async ({
  deviceId,
  name,
  platform,
  outputDir,
  appVersion,
  ipAddress,
}) => {
  const device = await BackupDevice.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        name,
        platform: platform || "",
        outputDir: outputDir || "",
        appVersion: appVersion || "",
        lastSeenAt: new Date(),
        lastIpAddress: ipAddress || "",
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return device;
};

const updateBackupSettings = async ({ autoBackupEnabled, frequency, assignedDeviceId, updatedBy, ensureBackupDeviceKey = false }) => {
  const settings = await BackupSettings.getSettings();

  settings.autoBackupEnabled = Boolean(autoBackupEnabled);
  settings.frequency = frequency || settings.frequency;
  settings.assignedDeviceId = assignedDeviceId || "";
  settings.updatedBy = updatedBy || settings.updatedBy;

  if (ensureBackupDeviceKey && !resolveStoredBackupDeviceKey(settings)) {
    settings.backupDeviceKey = generateBackupDeviceKey();
  }

  if (!settings.autoBackupEnabled || !settings.assignedDeviceId) {
    settings.nextBackupAt = null;
  } else if (!settings.nextBackupAt) {
    settings.nextBackupAt = new Date();
  }

  await settings.save();
  return settings;
};

const isDeviceOnline = (device) => {
  if (!device?.lastSeenAt) {
    return false;
  }

  return Date.now() - new Date(device.lastSeenAt).getTime() <= 1000 * 60 * 60 * 24;
};

const shouldRunScheduledBackup = (settings, deviceId, force = false) => {
  if (!settings?.assignedDeviceId || settings.assignedDeviceId !== deviceId) {
    return false;
  }

  if (force) {
    return true;
  }

  if (!settings.autoBackupEnabled || !settings.nextBackupAt) {
    return false;
  }

  return new Date(settings.nextBackupAt).getTime() <= Date.now();
};

const markBackupSuccess = async ({ settings, deviceId, fileName }) => {
  const completedAt = new Date();

  await BackupDevice.updateOne(
    { deviceId },
    {
      $set: {
        lastSeenAt: completedAt,
        lastBackupAt: completedAt,
        lastBackupStatus: "success",
        lastBackupFileName: fileName || "",
        lastBackupMessage: "Backup muvaffaqiyatli yuklab olindi.",
      },
    }
  );

  settings.lastSuccessfulBackupAt = completedAt;
  settings.nextBackupAt = settings.autoBackupEnabled
    ? addInterval(completedAt, settings.frequency)
    : null;
  await settings.save();
};

const markBackupFailure = async ({ deviceId, message }) => {
  await BackupDevice.updateOne(
    { deviceId },
    {
      $set: {
        lastSeenAt: new Date(),
        lastBackupStatus: "failed",
        lastBackupMessage: message || "Backup xatolik bilan tugadi.",
      },
    }
  );
};

module.exports = {
  generateBackupDeviceKey,
  isDeviceOnline,
  markBackupFailure,
  markBackupSuccess,
  resolveBackupOverview,
  resolveStoredBackupDeviceKey,
  shouldRunScheduledBackup,
  updateBackupSettings,
  upsertBackupDevice,
};
