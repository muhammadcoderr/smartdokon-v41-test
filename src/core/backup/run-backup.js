const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const mongoose = require("mongoose");
const { runLocalBackup } = require("../../shared/services/backupService");

const main = async () => {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not defined");
  }

  await mongoose.connect(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 5000,
  });

  const result = await runLocalBackup("manual-script");
  console.log(`Backup created: ${result.snapshotDir}`);
  console.log(`Latest snapshot: ${result.latestDir}`);
  console.log(JSON.stringify(result.manifest.collections, null, 2));
};

main()
  .catch((error) => {
    console.error("Backup script failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
