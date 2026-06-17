const DeviceLoginEvent = require("../database/models/DeviceLoginEvent");
const MAX_LOGIN_HISTORY_PER_DEVICE = 5;

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
};

const getDeviceMetadataFromRequest = (req) => ({
  deviceId: String(req.headers["x-device-id"] || "").trim(),
  deviceName: String(req.headers["x-device-name"] || "").trim(),
  userAgent: String(req.headers["user-agent"] || "").trim(),
  ipAddress: getClientIp(req),
});

const recordDeviceLoginEvent = async (req, seller, source = "web") => {
  const metadata = getDeviceMetadataFromRequest(req);

  await DeviceLoginEvent.create({
    sellerId: seller._id,
    sellerName: seller.firstname,
    sellerLogin: seller.login,
    deviceId: metadata.deviceId,
    deviceName: metadata.deviceName || metadata.userAgent || "Noma'lum qurilma",
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
    source,
  });

  const baseFilter = {
    sellerId: seller._id,
  };

  const deviceFilter = metadata.deviceId
    ? {
        ...baseFilter,
        deviceId: metadata.deviceId,
      }
    : {
        ...baseFilter,
        deviceName: metadata.deviceName || metadata.userAgent || "Noma'lum qurilma",
        userAgent: metadata.userAgent,
      };

  const staleEvents = await DeviceLoginEvent.find(deviceFilter)
    .sort({ createdAt: -1 })
    .skip(MAX_LOGIN_HISTORY_PER_DEVICE)
    .select("_id")
    .lean();

  if (staleEvents.length > 0) {
    await DeviceLoginEvent.deleteMany({
      _id: { $in: staleEvents.map((event) => event._id) },
    });
  }
};

module.exports = {
  getClientIp,
  getDeviceMetadataFromRequest,
  recordDeviceLoginEvent,
};
