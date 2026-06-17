const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CheckSettingSchema = new Schema(
  {
    brandName: {
      type: String,
      default: "Smart Dokon",
    },
    logoUrl: {
      type: String,
      default: "",
    },
    qrUrl: {
      type: String,
      default: "",
    },
    headerText: {
      type: String,
      default: "Xaridingiz uchun rahmat!",
    },
    footerText: {
      type: String,
      default: "Keling, ko'rishamiz!",
    },
    showDebt: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.CheckSetting || mongoose.model("CheckSetting", CheckSettingSchema);
module.exports.CheckSettingSchema = CheckSettingSchema;
