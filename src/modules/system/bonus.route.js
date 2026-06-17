const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { BonusSettingsSchema } = require("../../shared/database/models/BonusSettings");
const { getModel } = require("../../shared/helpers/modelFactory");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");

const getBonusSettingsModel = (req) => getModel(req.db || mongoose.connection, "BonusSettings", BonusSettingsSchema);

router.get("/config", authenticateToken, async (req, res, next) => {
    try {
        const BonusSettings = getBonusSettingsModel(req);
        // Using static method replacement since it's now a dynamic model
        let settings = await BonusSettings.findOne();
        if (!settings) settings = await BonusSettings.create({ cashback: 0, referral: { referrerBonus: 50000, newUserBonus: 25000 } });
        
        res.json({
            cashback: settings.cashback,
            referral: settings.referral
        });
    } catch (error) {
        next(error);
    }
});

router.post("/config", authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const { cashback, referral } = req.body;
        const BonusSettings = getBonusSettingsModel(req);
        let settings = await BonusSettings.findOne();
        if (!settings) settings = new BonusSettings();

        if (cashback !== undefined) settings.cashback = Number(cashback) || 0;
        if (referral) {
            settings.referral = {
                referrerBonus: Number(referral?.referrerBonus) || 0,
                newUserBonus: Number(referral?.newUserBonus) || 0
            };
        }

        await settings.save();
        res.json({ message: "Sozlamalar saqlandi!" });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
