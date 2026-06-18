const cron = require("node-cron");
const Product = require("./Models/Product");
const Notification = require("./Models/Notification");
const { runLocalBackup } = require("./services/backupService");
const { syncAutopilotDangerNotifications } = require("./services/autopilotDangerService");

const initCronJobs = () => {
  const backupEnabled = String(process.env.LOCAL_BACKUP_ENABLED || "false").toLowerCase() === "true";
  const backupSchedule =
    process.env.LOCAL_BACKUP_SCHEDULE || process.env.BACKUP_SCHEDULE || "0 0,12 * * *";
  const cronTimezone = process.env.CRON_TIMEZONE || process.env.TZ || "Asia/Tashkent";
  const autopilotDangerSchedule = process.env.AUTOPILOT_DANGER_SCHEDULE || "*/30 * * * *";

  // Run every 15 days at 00:00
  cron.schedule("0 0 */15 * *", async () => {
    try {
      console.log("Running unsold products check...");
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      // Find products that haven't been sold in the last month
      // AND have stock > 0 (no point notifying if out of stock)
      // AND (lastSoldDate < oneMonthAgo OR (lastSoldDate is null AND createdAt < oneMonthAgo))
      const unsoldProducts = await Product.find({
        avialable: { $gt: 0 },
        $or: [
            { lastSoldDate: { $lt: oneMonthAgo } },
            { lastSoldDate: null, createdAt: { $lt: oneMonthAgo } }
        ]
      });

      if (unsoldProducts.length > 0) {
        // Option 1: Create one summary notification
        // await Notification.create({
        //   type: "unsold_product",
        //   message: `Found ${unsoldProducts.length} products unsold for over 1 month.`,
        // });

        // Option 2: Create notification for each product (might be spammy if too many)
        // Let's do a grouped notification for now to avoid spam
        await Notification.create({
          type: "unsold_product",
          message: `Diqqat! ${unsoldProducts.length} ta mahsulot 1 oydan beri sotilmadi.`,
        });
        
        console.log(`Unsold products check complete. Found ${unsoldProducts.length} items.`);
      } else {
        console.log("No unsold products found.");
      }

    } catch (error) {
      console.error("Error in unsold products cron job:", error);
    }
  });

  if (backupEnabled) {
    cron.schedule(
      backupSchedule,
      async () => {
        try {
          const result = await runLocalBackup("cron");
          console.log(`Local backup completed: ${result.snapshotDir}`);
        } catch (error) {
          console.error("Error in local backup cron job:", error);
        }
      },
      {
        timezone: cronTimezone,
      }
    );
  }

  cron.schedule(
    autopilotDangerSchedule,
    async () => {
      try {
        const result = await syncAutopilotDangerNotifications({ windowDays: 30 });
        if (result.createdCount > 0) {
          console.log(`Autopilot danger notifications created: ${result.createdCount}`);
        }
      } catch (error) {
        console.error("Error in autopilot danger cron job:", error);
      }
    },
    {
      timezone: cronTimezone,
    }
  );

  setTimeout(async () => {
    try {
      const result = await syncAutopilotDangerNotifications({ windowDays: 30 });
      if (result.createdCount > 0) {
        console.log(`Initial autopilot danger notifications created: ${result.createdCount}`);
      }
    } catch (error) {
      console.error("Error in initial autopilot danger check:", error);
    }
  }, 15000);

  console.log("Cron jobs initialized.");
};

module.exports = initCronJobs;
