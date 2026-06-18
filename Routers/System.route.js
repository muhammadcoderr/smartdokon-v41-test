const express = require("express");
const jwt = require("jsonwebtoken");

const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");
const DeviceLoginEvent = require("../Models/DeviceLoginEvent");
const BackupSettings = require("../Models/BackupSettings");
const MeasurementUnitSettings = require("../Models/MeasurementUnitSettings");
const {
  getClientIp,
} = require("../services/deviceTrackingService");
const {
  isDeviceOnline,
  markBackupFailure,
  markBackupSuccess,
  resolveBackupOverview,
  resolveStoredBackupDeviceKey,
  shouldRunScheduledBackup,
  updateBackupSettings,
  upsertBackupDevice,
} = require("../services/backupAutomationService");
const { statAgentArtifact } = require("../services/backupAgentArtifactService");
const { createBackupExportArchive, cleanupBackupExport, streamBackupExport } = require("../services/backupService");

const router = express.Router();
const WINDOWS_APP_DOWNLOAD_PATH = "/api/system/apps/windows/download";
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const resolveAbsoluteUrl = (req, relativePath) => {
  const host = req.get("host");
  if (!host) {
    return relativePath;
  }

  return `${req.protocol}://${host}${relativePath}`;
};

const authenticateWindowsDownload = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const headerToken = authHeader && authHeader.split(" ")[1];
  const queryToken = String(req.query.accessToken || "").trim();
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ message: "Authentication token missing" });
  }

  jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      if (err.name === "JsonWebTokenError") {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ message: "Token expired" });
      }
      return res.status(403).json({ message: "Failed to authenticate token" });
    }

    req.user = {
      userId: decoded.sellerId,
      role: decoded.role || "seller",
    };

    next();
  });
};

const requireBackupDeviceKey = async (req, res, next) => {
  try {
    const settings = await BackupSettings.getSettings();
    const expectedKey = resolveStoredBackupDeviceKey(settings);

    if (!expectedKey) {
      return res.status(503).json({
        message: "Backup device key hali yaratilmagan. Avval backup sozlamalarini saqlang.",
      });
    }

    const providedKey = req.header("x-backup-device-key");
    if (!providedKey || providedKey !== expectedKey) {
      return res.status(403).json({ message: "Backup device key noto'g'ri." });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: "Backup device key tekshirishda xatolik.", error: error.message });
  }
};

router.get("/devices", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const events = await DeviceLoginEvent.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const loginDevicesMap = new Map();

    for (const event of events) {
      const lookupKey = event.deviceId || `${event.deviceName || "unknown"}:${event.userAgent || ""}`;
      const existingDevice = loginDevicesMap.get(lookupKey);

      if (existingDevice) {
        existingDevice.loginCount += 1;
        existingDevice.history.push(event);
        continue;
      }

      loginDevicesMap.set(lookupKey, {
        deviceId: event.deviceId,
        deviceName: event.deviceName || "Noma'lum qurilma",
        userAgent: event.userAgent || "",
        ipAddress: event.ipAddress || "",
        sellerName: event.sellerName || "",
        sellerLogin: event.sellerLogin || "",
        lastLoginAt: event.createdAt,
        loginCount: 1,
        history: [event],
      });
    }

    const loginDevices = Array.from(loginDevicesMap.values()).sort(
      (left, right) => new Date(right.lastLoginAt).getTime() - new Date(left.lastLoginAt).getTime()
    );

    const { devices } = await resolveBackupOverview();
    const backupDevices = devices.map((device) => ({
      ...device,
      isOnline: isDeviceOnline(device),
    }));

    res.json({
      loginEvents: events,
      loginDevices,
      backupDevices,
    });
  } catch (error) {
    res.status(500).json({ message: "Qurilmalarni yuklashda xatolik.", error: error.message });
  }
});

router.get("/backup/settings", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { settings, devices, assignedDevice } = await resolveBackupOverview();
    const backupDeviceKey = resolveStoredBackupDeviceKey(settings);
    const agentArtifact = await statAgentArtifact();

    res.json({
      settings,
      assignedDevice,
      devices: devices.map((device) => ({
        ...device,
        isOnline: isDeviceOnline(device),
      })),
      hasBackupDeviceKey: Boolean(backupDeviceKey),
      backupDeviceKey,
      agentDownloadAvailable: Boolean(agentArtifact),
      agentUpdatedAt: agentArtifact?.updatedAt || null,
      windowsApp: {
        available: Boolean(agentArtifact),
        fileName: agentArtifact?.fileName || "SmartDokon-Setup.exe",
        updatedAt: agentArtifact?.updatedAt || null,
        downloadPath: WINDOWS_APP_DOWNLOAD_PATH,
        downloadUrl: resolveAbsoluteUrl(req, WINDOWS_APP_DOWNLOAD_PATH),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Backup sozlamalarini yuklashda xatolik.", error: error.message });
  }
});

router.get("/units", authenticateToken, async (req, res) => {
  try {
    const settings = await MeasurementUnitSettings.getSettings();

    res.json({
      units: settings.units || [],
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "O'lchov birliklarini yuklashda xatolik.", error: error.message });
  }
});

router.put("/units", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const submittedUnits = Array.isArray(req.body.units) ? req.body.units : [];
    const normalizedUnits = submittedUnits
      .map((unit) => String(unit).trim())
      .filter(Boolean);
    const uniqueUnits = Array.from(new Set(normalizedUnits));

    if (uniqueUnits.length === 0) {
      return res.status(400).json({ message: "Kamida bitta o'lchov birligi kerak." });
    }

    const settings = await MeasurementUnitSettings.getSettings();
    settings.units = uniqueUnits;
    settings.updatedBy = req.user.userId;
    await settings.save();

    res.json({
      message: "O'lchov birliklari saqlandi.",
      units: settings.units,
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "O'lchov birliklarini saqlashda xatolik.", error: error.message });
  }
});

router.put("/backup/settings", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { autoBackupEnabled, frequency, assignedDeviceId } = req.body;
    const requestDeviceId = String(req.headers["x-device-id"] || assignedDeviceId || "").trim();
    const requestDeviceName = String(req.headers["x-device-name"] || "Ushbu qurilma").trim();
    const resolvedAssignedDeviceId = autoBackupEnabled ? requestDeviceId : "";

    if (!["daily", "weekly", "monthly"].includes(String(frequency || ""))) {
      return res.status(400).json({ message: "Backup davri noto'g'ri." });
    }

    if (autoBackupEnabled && !resolvedAssignedDeviceId) {
      return res.status(400).json({ message: "Doimiy backup uchun joriy qurilma aniqlanmadi." });
    }

    if (resolvedAssignedDeviceId) {
      await upsertBackupDevice({
        deviceId: resolvedAssignedDeviceId,
        name: requestDeviceName,
        platform: req.get("user-agent") || "",
        ipAddress: getClientIp(req),
      });
    }

    const settings = await updateBackupSettings({
      autoBackupEnabled,
      frequency,
      assignedDeviceId: resolvedAssignedDeviceId,
      ensureBackupDeviceKey: Boolean(autoBackupEnabled),
      updatedBy: req.user.userId,
    });

    res.json({
      message: "Backup sozlamalari saqlandi.",
      settings,
      backupDeviceKey: resolveStoredBackupDeviceKey(settings),
    });
  } catch (error) {
    res.status(500).json({ message: "Backup sozlamalarini saqlashda xatolik.", error: error.message });
  }
});

router.get("/backup/export", authenticateToken, requireAdmin, async (req, res) => {
  try {
    await streamBackupExport(res, {
      reason: "manual-admin-export",
      requestedBy: req.user.userId,
    });
  } catch (error) {
    console.error("Backup export error:", error);

    if (!res.headersSent) {
      return res.status(500).json({ message: "Backup exportda xatolik yuz berdi." });
    }

    res.destroy(error);
  }
});

const downloadWindowsApp = async (req, res) => {
  try {
    const agentArtifact = await statAgentArtifact();

    if (!agentArtifact) {
      return res.status(404).json({
        message: "Windows dastur hali serverga joylanmagan. Avval Windows build tayyorlang.",
      });
    }

    return res.download(agentArtifact.artifactPath, agentArtifact.fileName);
  } catch (error) {
    return res.status(500).json({ message: "Windows dasturini yuklab olishda xatolik.", error: error.message });
  }
};

router.get("/apps/windows/download", authenticateWindowsDownload, requireAdmin, downloadWindowsApp);
router.get("/backup/agent/download", authenticateToken, requireAdmin, downloadWindowsApp);

router.post("/backup/devices/register", requireBackupDeviceKey, async (req, res) => {
  try {
    const { deviceId, name, platform, outputDir, appVersion } = req.body || {};

    if (!deviceId || !name) {
      return res.status(400).json({ message: "deviceId va name majburiy." });
    }

    const device = await upsertBackupDevice({
      deviceId,
      name,
      platform,
      outputDir,
      appVersion,
      ipAddress: getClientIp(req),
    });

    res.json({
      message: "Backup qurilma muvaffaqiyatli biriktirildi.",
      device,
    });
  } catch (error) {
    res.status(500).json({ message: "Backup qurilmani ro'yxatdan o'tkazishda xatolik.", error: error.message });
  }
});

router.get("/backup/agent/export", requireBackupDeviceKey, async (req, res) => {
  const deviceId = String(req.query.deviceId || "").trim();
  const force = String(req.query.force || "").toLowerCase() === "true";

  if (!deviceId) {
    return res.status(400).json({ message: "deviceId majburiy." });
  }

  try {
    const settings = await BackupSettings.getSettings();

    if (!shouldRunScheduledBackup(settings, deviceId, force)) {
      await upsertBackupDevice({
        deviceId,
        name: String(req.query.deviceName || "Backup Device"),
        platform: String(req.query.platform || ""),
        outputDir: String(req.query.outputDir || ""),
        appVersion: String(req.query.appVersion || ""),
        ipAddress: getClientIp(req),
      });

      return res.status(204).end();
    }

    const bundle = await createBackupExportArchive({
      reason: force ? "forced-agent-export" : "scheduled-agent-export",
      requestedBy: deviceId,
    });

    res.setHeader("Content-Type", bundle.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${bundle.fileName}"`);
    res.setHeader("X-Backup-Created-At", bundle.manifest.createdAt);

    const { createReadStream } = require("fs");
    const archiveStream = createReadStream(bundle.archivePath);
    let completed = false;

    archiveStream.on("error", async (error) => {
      await markBackupFailure({ deviceId, message: error.message });
      await cleanupBackupExport([bundle.workspaceRoot, bundle.archivePath]).catch(() => {});
      if (!res.headersSent) {
        res.status(500).json({ message: "Backup arxivini yuborishda xatolik." });
        return;
      }

      res.destroy(error);
    });

    res.on("finish", async () => {
      if (completed) {
        return;
      }

      completed = true;
      await markBackupSuccess({ settings, deviceId, fileName: bundle.fileName }).catch(() => {});
      await cleanupBackupExport([bundle.workspaceRoot, bundle.archivePath]).catch(() => {});
    });

    res.on("close", async () => {
      if (completed) {
        return;
      }

      await cleanupBackupExport([bundle.workspaceRoot, bundle.archivePath]).catch(() => {});
    });

    archiveStream.pipe(res);
  } catch (error) {
    await markBackupFailure({ deviceId, message: error.message }).catch(() => {});
    return res.status(500).json({ message: "Agent backup eksportida xatolik.", error: error.message });
  }
});

module.exports = router;
