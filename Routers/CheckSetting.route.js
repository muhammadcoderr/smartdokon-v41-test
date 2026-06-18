const express = require("express");
const router = express.Router();
const CheckSetting = require("../Models/CheckSetting");
const authenticateToken = require("../middleware/authenticateToken");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// Get Settings (Create default if not exists)
router.get("/", authenticateToken, async (req, res) => {
  try {
    let setting = await CheckSetting.findOne();
    if (!setting) {
      setting = await CheckSetting.create({});
    }
    res.json(setting);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Update Settings (Text fields)
router.put("/", authenticateToken, async (req, res) => {
  try {
    const { brandName, headerText, footerText, showDebt } = req.body;
    
    // Ensure only admin can update (Double check, though frontend hides it)
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Bu amalni faqat admin bajarishi mumkin!" });
    }

    let setting = await CheckSetting.findOne();
    if (!setting) {
      setting = new CheckSetting();
    }

    if (brandName) setting.brandName = brandName;
    if (headerText) setting.headerText = headerText;
    if (footerText) setting.footerText = footerText;
    if (showDebt !== undefined) setting.showDebt = showDebt;

    await setting.save();
    res.json(setting);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Upload Images (Logo or QR)
router.post("/upload", authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Bu amalni faqat admin bajarishi mumkin!" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Rasm tanlanmadi" });
        }

        const type = req.body.type; // 'logo' or 'qr'
        if (!['logo', 'qr'].includes(type)) {
            return res.status(400).json({ message: "Noto'g'ri rasm turi" });
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        
        let setting = await CheckSetting.findOne();
        if (!setting) {
            setting = new CheckSetting();
        }

        // Delete old image if exists
        const oldUrl = type === 'logo' ? setting.logoUrl : setting.qrUrl;
        if (oldUrl && oldUrl.startsWith('/uploads/')) {
             const oldPath = path.join(__dirname, '../' + oldUrl);
             if (fs.existsSync(oldPath)) {
                 fs.unlinkSync(oldPath);
             }
        }

        if (type === 'logo') {
            setting.logoUrl = imageUrl;
        } else {
            setting.qrUrl = imageUrl;
        }

        await setting.save();

        res.json({ message: "Muvaffaqiyatli yuklandi", setting });

    } catch (error) {
        console.error("Upload error", error);
        res.status(500).json({ message: "Yuklashda xatolik" });
    }
});

module.exports = router;
