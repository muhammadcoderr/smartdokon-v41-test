const fs = require("fs/promises");
const { createReadStream } = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const Product = require("../database/models/Product");
const Client = require("../database/models/Client");
const Debts = require("../database/models/Debts");
const User = require("../database/models/User");
const Payment = require("../database/models/Payment");
const Costs = require("../database/models/Costs");
const Cashbox = require("../database/models/Cashbox");
const Returned = require("../database/models/Returned");
const Supplier = require("../database/models/Supplier");
const SupplierTransaction = require("../database/models/SupplierTransaction");
const Handover = require("../database/models/Handover");
const BonusSettings = require("../database/models/BonusSettings");
const BotSettings = require("../database/models/BotSettings");
const CheckSetting = require("../database/models/CheckSetting");
const Notification = require("../database/models/Notification");
const { resolveUploadsDir } = require("./storagePaths");

const backupDefinitions = [
  { key: "products", model: Product },
  { key: "clients", model: Client },
  { key: "debts", model: Debts },
  {
    key: "users",
    model: User,
    transform: (docs) =>
      docs.map((doc) => ({
        ...doc,
        refreshToken: null,
      })),
  },
  { key: "payments", model: Payment },
  { key: "costs", model: Costs },
  { key: "cashbox", model: Cashbox },
  { key: "returned", model: Returned },
  { key: "suppliers", model: Supplier },
  { key: "supplier-transactions", model: SupplierTransaction },
  { key: "handovers", model: Handover },
  { key: "bonus-settings", model: BonusSettings },
  { key: "bot-settings", model: BotSettings },
  { key: "check-settings", model: CheckSetting },
  { key: "notifications", model: Notification },
];

const isWindows = process.platform === "win32";
const isVercel = process.env.VERCEL === "1";

const defaultBackupRoot = isWindows
  ? path.join("C:\\", "smartdokon")
  : isVercel
    ? path.join(os.tmpdir(), "backups", "smartdokon")
    : path.join(process.cwd(), "backups", "smartdokon");

const resolveBackupRoot = () =>
  process.env.LOCAL_BACKUP_ROOT_DIR || process.env.BACKUP_ROOT_DIR || defaultBackupRoot;

const getRetentionCount = () => {
  const parsed = Number.parseInt(
    process.env.LOCAL_BACKUP_RETENTION || process.env.BACKUP_RETENTION || "14",
    10
  );

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

const makeTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const ensureDirectory = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const writeJsonFile = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
};

const copyDirectory = async (sourceDir, targetDir) => {
  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
};

const countFilesRecursively = async (sourceDir) => {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const entryPath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursively(entryPath);
      continue;
    }

    count += 1;
  }

  return count;
};

const replaceDirectory = async (sourceDir, targetDir) => {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await replaceDirectory(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
};

const pruneOldBackups = async (backupRoot, keepCount) => {
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const timestampedDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "latest")
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const staleDirectories = timestampedDirectories.slice(keepCount);
  await Promise.all(
    staleDirectories.map((directoryName) =>
      fs.rm(path.join(backupRoot, directoryName), { recursive: true, force: true })
    )
  );
};

const runLocalBackup = async (reason = "manual") => {
  const backupRoot = resolveBackupRoot();
  const timestamp = makeTimestamp();
  const snapshotDir = path.join(backupRoot, timestamp);
  const latestDir = path.join(backupRoot, "latest");
  const counts = {};

  await ensureDirectory(snapshotDir);

  for (const definition of backupDefinitions) {
    const rawDocuments = await definition.model.find({}).lean();
    const documents = definition.transform
      ? definition.transform(rawDocuments)
      : rawDocuments;

    counts[definition.key] = documents.length;
    await writeJsonFile(path.join(snapshotDir, `${definition.key}.json`), documents);
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    backupRoot,
    snapshotDir,
    collections: counts,
  };

  await writeJsonFile(path.join(snapshotDir, "manifest.json"), manifest);
  await replaceDirectory(snapshotDir, latestDir);
  await pruneOldBackups(backupRoot, getRetentionCount());

  return {
    backupRoot,
    snapshotDir,
    latestDir,
    manifest,
  };
};

const createArchiveFromDirectory = async (sourceDir, archivePath) =>
  new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const command = isWindows ? "powershell.exe" : "tar";
    const escapedSourceDir = sourceDir.replace(/'/g, "''");
    const escapedArchivePath = archivePath.replace(/'/g, "''");
    const args = isWindows
      ? [
          "-NoProfile",
          "-Command",
          `Compress-Archive -LiteralPath '${escapedSourceDir}' -DestinationPath '${escapedArchivePath}' -Force`,
        ]
      : ["-czf", archivePath, "-C", path.dirname(sourceDir), path.basename(sourceDir)];

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Archive creation failed with exit code ${code}`));
        return;
      }

      resolve({
        archivePath,
        extension: isWindows ? "zip" : "tar.gz",
        contentType: isWindows ? "application/zip" : "application/gzip",
      });
    });
  });

const createExportWorkspace = async (reason = "manual-export", requestedBy = null) => {
  const timestamp = makeTimestamp();
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "smartdokon-backup-"));
  const exportRoot = path.join(workspaceRoot, `smartdokon_backup_${timestamp}`);
  const databaseDir = path.join(exportRoot, "database");
  const uploadsDir = resolveUploadsDir();
  const stagedUploadsDir = path.join(exportRoot, "uploads");
  const counts = {};

  await fs.mkdir(databaseDir, { recursive: true });

  for (const definition of backupDefinitions) {
    const rawDocuments = await definition.model.find({}).lean();
    const documents = definition.transform
      ? definition.transform(rawDocuments)
      : rawDocuments;

    counts[definition.key] = documents.length;
    await writeJsonFile(path.join(databaseDir, `${definition.key}.json`), documents);
  }

  const uploadsIncluded = await pathExists(uploadsDir);
  let uploadFileCount = 0;

  if (uploadsIncluded) {
    await copyDirectory(uploadsDir, stagedUploadsDir);
    uploadFileCount = await countFilesRecursively(stagedUploadsDir);
  }

  const manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    reason,
    requestedBy,
    collections: counts,
    uploads: {
      included: uploadsIncluded,
      sourcePath: uploadsDir,
      fileCount: uploadFileCount,
    },
  };

  await writeJsonFile(path.join(exportRoot, "manifest.json"), manifest);

  return {
    workspaceRoot,
    exportRoot,
    timestamp,
    manifest,
  };
};

const createBackupExportArchive = async (options = {}) => {
  const workspace = await createExportWorkspace(options.reason, options.requestedBy);
  const archiveBaseName = path.basename(workspace.exportRoot);
  const archivePath = path.join(
    os.tmpdir(),
    `${archiveBaseName}-${process.pid}.${process.platform === "win32" ? "zip" : "tar.gz"}`
  );
  const archive = await createArchiveFromDirectory(workspace.exportRoot, archivePath);

  return {
    ...workspace,
    ...archive,
    fileName: `${archiveBaseName}.${archive.extension}`,
  };
};

const cleanupBackupExport = async (pathsToDelete = []) => {
  await Promise.all(
    pathsToDelete
      .filter(Boolean)
      .map((targetPath) => fs.rm(targetPath, { recursive: true, force: true }))
  );
};

const streamBackupExport = async (res, options = {}) => {
  const exportBundle = await createBackupExportArchive(options);

  res.setHeader("Content-Type", exportBundle.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exportBundle.fileName}"`);
  res.setHeader("X-Backup-Created-At", exportBundle.manifest.createdAt);
  res.setHeader("X-Backup-Uploads-Included", String(exportBundle.manifest.uploads.included));

  const archiveStream = createReadStream(exportBundle.archivePath);

  return await new Promise((resolve, reject) => {
    let settled = false;

    const finish = async (error = null) => {
      if (settled) {
        return;
      }

      settled = true;
      await cleanupBackupExport([exportBundle.workspaceRoot, exportBundle.archivePath]).catch(() => {});

      if (error) {
        reject(error);
        return;
      }

      resolve(exportBundle.manifest);
    };

    archiveStream.on("error", finish);
    res.on("close", () => finish());
    res.on("finish", () => finish());
    archiveStream.pipe(res);
  });
};

const restoreBackupFromDirectory = async (snapshotDir, options = {}) => {
  const dropExisting = options.dropExisting !== false;
  const restoredCounts = {};

  for (const definition of backupDefinitions) {
    const filePath = path.join(snapshotDir, `${definition.key}.json`);
    const fileContents = await fs.readFile(filePath, "utf8");
    const documents = JSON.parse(fileContents);

    if (dropExisting) {
      await definition.model.deleteMany({});
    }

    if (documents.length > 0) {
      await definition.model.bulkWrite(
        documents.map((document) => ({
          replaceOne: {
            filter: { _id: document._id },
            replacement: document,
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }

    restoredCounts[definition.key] = documents.length;
  }

  return restoredCounts;
};

module.exports = {
  backupDefinitions,
  cleanupBackupExport,
  createBackupExportArchive,
  resolveBackupRoot,
  runLocalBackup,
  restoreBackupFromDirectory,
  streamBackupExport,
};
