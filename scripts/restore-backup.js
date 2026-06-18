const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const {
  resolveBackupRoot,
  restoreBackupFromDirectory,
} = require("../services/backupService");

const parseArguments = () => {
  const inputPath = process.argv[2];
  const dropExisting = !process.argv.includes("--merge");

  return {
    snapshotDir: inputPath || path.join(resolveBackupRoot(), "latest"),
    dropExisting,
  };
};

const main = async () => {
  const { snapshotDir, dropExisting } = parseArguments();

  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not defined");
  }

  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Backup directory not found: ${snapshotDir}`);
  }

  await mongoose.connect(process.env.MONGO_URL, {
    serverSelectionTimeoutMS: 5000,
  });

  const restoredCounts = await restoreBackupFromDirectory(snapshotDir, {
    dropExisting,
  });

  console.log(`Restore completed from: ${snapshotDir}`);
  console.log(JSON.stringify(restoredCounts, null, 2));
};

main()
  .catch((error) => {
    console.error("Restore script failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
