const { Router } = require("express");
const BonusSettings = require("../Models/BonusSettings");
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");

const router = Router();

router.get("/config", authenticateToken, async (req, res) => {
    try {
        const settings = await BonusSettings.getSettings();
        res.json({
            cashback: settings.cashback,
            referral: settings.referral
        });
    } catch (error) {
        console.error("Error reading bonus config:", error);
        res.status(500).json({ message: "Konfiguratsiyani o'qishda xatolik." });
    }
});

router.post("/config", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { cashback, referral } = req.body;
        const settings = await BonusSettings.getSettings();

        if (cashback !== undefined) {
            settings.cashback = Number(cashback) || 0;
        }

        if (referral) {
            settings.referral = {
                referrerBonus: Number(referral?.referrerBonus) || 0,
                newUserBonus: Number(referral?.newUserBonus) || 0
            };
        }

        await settings.save();

        res.json({ message: "Sozlamalar saqlandi!" });
    } catch (error) {
        console.error("Error saving bonus config:", error);
        res.status(500).json({ message: "Sozlamalarni saqlashda xatolik." });
    }
});

module.exports = router;
