const { loadAutopilotData } = require("./dataProvider");
const { analyzeAutopilotData } = require("./analysisEngine");
const { buildAutopilotRoadmap } = require("./roadmapEngine");

async function generateAutopilotInsights(options = {}) {
  const data = await loadAutopilotData({
    now: options.now || new Date(),
    windowDays: options.windowDays || 30,
  });
  return analyzeAutopilotData(data);
}

async function generateAutopilotRoadmap(options = {}) {
  const now = options.now || new Date();
  const year = Number(options.year || now.getFullYear());
  const insights = await generateAutopilotInsights({
    now,
    windowDays: options.windowDays || 90,
  });
  return buildAutopilotRoadmap({
    insights,
    year,
    now,
    progressByMonth: options.progressByMonth || {},
  });
}

module.exports = {
  generateAutopilotInsights,
  generateAutopilotRoadmap,
};
