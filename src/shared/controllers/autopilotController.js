const { generateAutopilotInsights, generateAutopilotRoadmap } = require("../ai/autopilot");
const { getModel } = require("../helpers/modelFactory");
const SmartRoadmapProgress = require("../database/models/SmartRoadmapProgress"); // Standard import for schema reference

/**
 * Autopilot uchun tahliliy ma'lumotlarni yig'ish
 */
const getAutopilotData = async (user, dbConnection, filters = {}) => {
  const { windowDays = 30 } = filters;

  if (!dbConnection) {
    throw new Error("Ma'lumotlar bazasiga ulanish topilmadi.");
  }

  try {
    const insights = await generateAutopilotInsights({
      windowDays: parseInt(windowDays),
      dbConnection: dbConnection,
      branchId: user.branchId
    });

    return insights;
  } catch (err) {
    console.error(`Autopilot insights error:`, err.message);
    throw err;
  }
};

/**
 * Autopilot Roadmap yaratish
 */
const getAutopilotRoadmap = async (user, dbConnection, filters = {}) => {
    const { year = new Date().getFullYear() } = filters;

    if (!dbConnection) {
        throw new Error("Ma'lumotlar bazasiga ulanish topilmadi.");
    }

    try {
        const ProgressModel = getModel(dbConnection, "SmartRoadmapProgress", SmartRoadmapProgress.schema);
        
        // Fetch progress from tenant DB
        const progressDocs = await ProgressModel.find({ year: parseInt(year) }).lean();
        const progressByMonth = {};
        progressDocs.forEach(p => {
            progressByMonth[p.month] = p;
        });

        const roadmap = await generateAutopilotRoadmap({
            year: parseInt(year),
            dbConnection: dbConnection,
            branchId: user.branchId,
            progressByMonth
        });

        return roadmap;
    } catch (err) {
        console.error(`Autopilot roadmap error:`, err.message);
        throw err;
    }
};

module.exports = {
  getAutopilotData,
  getAutopilotRoadmap
};
