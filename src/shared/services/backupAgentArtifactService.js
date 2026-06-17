const fs = require("fs/promises");
const path = require("path");

const ARTIFACT_FILE_NAMES = ["SmartDokon-Setup.exe", "SmartDokon-Windows.exe"];
const ARTIFACT_DIR_NAME = "win";

const resolveAgentArtifactPath = (fileName) =>
  path.join(__dirname, "..", "downloads", ARTIFACT_DIR_NAME, fileName);

const statAgentArtifact = async () => {
  for (const fileName of ARTIFACT_FILE_NAMES) {
    const artifactPath = resolveAgentArtifactPath(fileName);

    try {
      const stats = await fs.stat(artifactPath);

      if (!stats.isFile()) {
        continue;
      }

      return {
        artifactPath,
        fileName,
        size: stats.size,
        updatedAt: stats.mtime,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return null;
};

module.exports = {
  ARTIFACT_DIR_NAME,
  ARTIFACT_FILE_NAMES,
  resolveAgentArtifactPath,
  statAgentArtifact,
};
