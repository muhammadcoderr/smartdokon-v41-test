const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(process.cwd(), "logs");

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Log types and their corresponding file names
 */
const LogType = {
  ERROR: "error.log",
  ACCESS: "access.log",
  INFO: "info.log",
  AUTH: "auth.log",
  BACKUP: "backup.log"
};

/**
 * Core logging function
 * @param {string} type - The type of log (from LogType)
 * @param {string} message - The message to log
 * @param {Object} metadata - Optional additional data
 */
const writeLog = (type, message, metadata = {}) => {
  const fileName = LogType[type] || "general.log";
  const filePath = path.join(LOGS_DIR, fileName);
  
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: type,
    message,
    ...metadata
  };

  const logString = JSON.stringify(logEntry) + "\n";

  // Append to file
  fs.appendFile(filePath, logString, (err) => {
    if (err) {
      console.error(`Failed to write to log file ${filePath}:`, err);
    }
  });

  // Also output to console in development
  if (process.env.NODE_ENV !== "production") {
    const consoleMethod = type === "ERROR" ? "error" : "log";
    console[consoleMethod](`[${timestamp}] ${type}: ${message}`, metadata);
  }
};

const logger = {
  error: (message, metadata) => writeLog("ERROR", message, metadata),
  access: (message, metadata) => writeLog("ACCESS", message, metadata),
  info: (message, metadata) => writeLog("INFO", message, metadata),
  auth: (message, metadata) => writeLog("AUTH", message, metadata),
  backup: (message, metadata) => writeLog("BACKUP", message, metadata),
};

/**
 * Prune logs older than a specific number of days
 * @param {number} daysToKeep - Number of days to keep logs for
 */
const pruneLogs = async (daysToKeep = 30) => {
  const files = await fs.promises.readdir(LOGS_DIR);
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const threshold = now - daysToKeep * msPerDay;

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file);
    const stats = await fs.promises.stat(filePath);

    if (stats.mtimeMs < threshold) {
      await fs.promises.unlink(filePath);
      console.log(`Pruned old log file: ${file}`);
    }
  }
};

module.exports = {
  ...logger,
  pruneLogs
};
