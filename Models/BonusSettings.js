const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const bonusSettingsSchema = new mongoose.Schema(
  {
    cashback: {
      type: Number,
      default: 0,
      min: 0,
    },
    referral: {
      referrerBonus: {
        type: Number,
        default: 50000,
        min: 0,
      },
      newUserBonus: {
        type: Number,
        default: 25000,
        min: 0,
      },
    },
  },
  { timestamps: true }
);

bonusSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();

  if (!settings) {
    const bonusPath = path.join(__dirname, "..", "DB", "bonus.txt");
    const referralPath = path.join(__dirname, "..", "DB", "referral.json");

    let cashback = 0;
    let referral = { referrerBonus: 50000, newUserBonus: 25000 };

    try {
      if (fs.existsSync(bonusPath)) {
        cashback = Number(fs.readFileSync(bonusPath, "utf8")) || 0;
      }

      if (fs.existsSync(referralPath)) {
        const legacyReferral = JSON.parse(fs.readFileSync(referralPath, "utf8"));
        referral = {
          referrerBonus: Number(legacyReferral?.referrerBonus) || 50000,
          newUserBonus: Number(legacyReferral?.newUserBonus) || 25000,
        };
      }
    } catch (error) {
      console.error("Error migrating legacy bonus settings:", error);
    }

    settings = await this.create({ cashback, referral });
  }

  return settings;
};

module.exports = mongoose.model("BonusSettings", bonusSettingsSchema);
