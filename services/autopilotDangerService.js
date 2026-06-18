const Notification = require("../Models/Notification");
const { generateAutopilotInsights } = require("../ai/autopilot");
const BotManager = require("../Bot/BotManager");
const BotUser = require("../Models/Bot/Users");

const DEDUPE_HOURS = Number(process.env.AUTOPILOT_DANGER_DEDUPE_HOURS || 12);

function buildDangerCandidates(insights) {
  const candidates = [];
  const criticalAnomalies = (insights.anomalies || []).filter((item) => item.severity === "critical");

  criticalAnomalies.forEach((item) => {
    candidates.push({
      code: `autopilot-anomaly-${item.id}`,
      message: `DANGER: ${item.title}. ${item.summary} Amal: ${item.action}`,
      severity: "critical",
    });
  });

  const criticalInventory = (insights.inventoryForecast || []).filter((item) => item.status === "critical");
  if (criticalInventory.length > 0) {
    const topNames = criticalInventory
      .slice(0, 3)
      .map((item) => item.name)
      .join(", ");

    candidates.push({
      code: "autopilot-inventory-critical",
      message: `DANGER: ${criticalInventory.length} ta mahsulot zaxirasi tez tugashi mumkin. Eng muhimlari: ${topNames}.`,
      severity: "critical",
    });
  }

  const criticalCosts = (insights.costCategoryAlerts || []).filter((item) => item.severity === "critical");
  if (criticalCosts.length > 0) {
    candidates.push({
      code: "autopilot-cost-critical",
      message: `DANGER: Xarajat bosimi oshgan. ${criticalCosts[0].category} kategoriyasi ${criticalCosts[0].changePercent}% ga o'zgargan va ulushi ${criticalCosts[0].sharePercent}%.`,
      severity: "critical",
    });
  }

  const criticalCollection = (insights.collectionSegments || []).find((item) => item.id === "critical" && item.count > 0);
  if (criticalCollection) {
    candidates.push({
      code: "autopilot-collection-critical",
      message: `DANGER: ${criticalCollection.count} ta mijoz zudlik bilan undirish segmentiga tushdi. ${criticalCollection.action}`,
      severity: "critical",
    });
  }

  return candidates;
}

async function ensureDangerNotification(candidate) {
  const since = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000);
  const exists = await Notification.findOne({
    type: "danger",
    code: candidate.code,
    createdAt: { $gte: since },
  }).lean();

  if (exists) {
    return null;
  }

  const notification = await Notification.create({
    type: "danger",
    code: candidate.code,
    severity: candidate.severity || "critical",
    message: candidate.message,
    relatedModel: null,
  });

  await sendDangerToTelegram(notification).catch((error) => {
    console.error("Error sending autopilot danger to Telegram:", error.message);
  });

  return notification;
}

async function sendDangerToTelegram(notification) {
  const bot = BotManager.adminBotInstance;
  if (!bot || typeof bot.sendMessage !== "function") {
    return;
  }

  const ownerId = process.env.OWNER_ID;
  const admins = await BotUser.find({ role: "admin" }).lean();
  const adminChatIds = new Set();

  if (ownerId) {
    adminChatIds.add(Number(ownerId));
  }

  admins.forEach((admin) => {
    if (admin.chatId) {
      adminChatIds.add(admin.chatId);
    }
  });

  if (adminChatIds.size === 0) {
    return;
  }

  const message = [
    "🚨 <b>Smart Avtopilot Danger</b>",
    "",
    notification.message,
    "",
    "Panel: /smart-autopilot",
  ].join("\n");

  for (const chatId of adminChatIds) {
    await bot.sendMessage(chatId, message, { parse_mode: "HTML" }).catch((error) => {
      console.error(`Error sending autopilot danger to ${chatId}:`, error.message);
    });
  }
}

async function syncAutopilotDangerNotifications(options = {}) {
  const insights = await generateAutopilotInsights({ windowDays: options.windowDays || 30 });
  const candidates = buildDangerCandidates(insights);
  const created = [];

  for (const candidate of candidates) {
    const notification = await ensureDangerNotification(candidate);
    if (notification) {
      created.push(notification);
    }
  }

  return {
    createdCount: created.length,
    totalCandidates: candidates.length,
    created,
  };
}

module.exports = {
  syncAutopilotDangerNotifications,
};
