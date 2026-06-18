const mongoose = require("mongoose");

const DEFAULT_UNITS = ["Dona", "KG", "Quti", "Litr", "Metr"];

const measurementUnitSettingsSchema = new mongoose.Schema(
  {
    units: {
      type: [String],
      default: DEFAULT_UNITS,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

measurementUnitSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ units: DEFAULT_UNITS });
  }

  if (!Array.isArray(settings.units) || settings.units.length === 0) {
    settings.units = DEFAULT_UNITS;
    await settings.save();
  }

  return settings;
};

module.exports = mongoose.model("MeasurementUnitSettings", measurementUnitSettingsSchema);
