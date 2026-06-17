const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { CheckSettingSchema } = require("../../shared/database/models/CheckSetting");
const { getModel } = require("../../shared/helpers/modelFactory");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const upload = require("../../shared/middlewares/upload");
const fs = require("fs");
const path = require("path");

const getCheckSettingModel = (req) => getModel(req.db || mongoose.connection, "CheckSetting", CheckSettingSchema);

// Get Settings (Scoped to Tenant DB)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const CheckSetting = getCheckSettingModel(req);
    let setting = await CheckSetting.findOne();
    if (!setting) {
      setting = await CheckSetting.create({});
    }
    res.json(setting);
  } catch (error) {
    next(error);
  }
});

// Update Settings (Scoped to Tenant DB)
router.put("/", authenticateToken, async (req, res, next) => {
  try {
    const { brandName, headerText, footerText, showDebt } = req.body;
    if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin ruxsati kerak" });

    const CheckSetting = getCheckSettingModel(req);
    let setting = await CheckSetting.findOne();
    if (!setting) setting = new CheckSetting();

    if (brandName) setting.brandName = brandName;
    if (headerText) setting.headerText = headerText;
    if (footerText) setting.footerText = footerText;
    if (showDebt !== undefined) setting.showDebt = showDebt;

    await setting.save();
    res.json(setting);
  } catch (error) {
    next(error);
  }
});

// Upload Images (Scoped to Tenant DB)
router.post("/upload", authenticateToken, upload.single('image'), async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: "Admin ruxsati kerak" });
        if (!req.file) return res.status(400).json({ message: "Rasm tanlanmadi" });

        const type = req.body.type;
        const imageUrl = `/uploads/${req.file.filename}`;
        
        const CheckSetting = getCheckSettingModel(req);
        let setting = await CheckSetting.findOne();
        if (!setting) setting = new CheckSetting();

        const oldUrl = type === 'logo' ? setting.logoUrl : setting.qrUrl;
        if (oldUrl && oldUrl.startsWith('/uploads/')) {
             const oldPath = path.join(__dirname, '../' + oldUrl);
             if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        if (type === 'logo') setting.logoUrl = imageUrl;
        else setting.qrUrl = imageUrl;

        await setting.save();
        res.json({ message: "Muvaffaqiyatli yuklandi", setting });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
