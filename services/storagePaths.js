const os = require("os");
const path = require("path");

const isVercel = process.env.VERCEL === "1";

const resolveUploadsDir = () =>
  isVercel ? path.join(os.tmpdir(), "uploads") : path.join(__dirname, "..", "uploads");

module.exports = {
  resolveUploadsDir,
};
