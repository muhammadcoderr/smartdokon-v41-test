const express = require("express");
const router = express.Router();
const Notification = require("../Models/Notification");
const Client = require("../Models/Client");
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");

// Get all notifications (paginated)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let query = {};

    // Filter logic:
    // Admin sees everything
    // Seller sees all non-system notifications AND their own system notifications
    if (req.user.role !== 'admin') {
        query = {
            $or: [
                { type: { $nin: ['system', 'danger'] } }, // Shared notifications visible to everyone
                { type: 'system', relatedId: req.user.userId } // System notifications only for self
            ]
        };
    }

    const notifications = await Notification.find(query)
      .populate('relatedId') 
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ ...query, read: false });

    res.json({
      data: notifications,
      total,
      unreadCount,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Mark as read
router.put("/:id/read", authenticateToken, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role !== "admin") {
      query.$or = [
        { type: { $nin: ["system", "danger"] } },
        { type: "system", relatedId: req.user.userId },
      ];
    }

    const notification = await Notification.findOneAndUpdate(query, { read: true }, { new: true });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Mark ALL as read
router.put("/read-all", authenticateToken, async (req, res) => {
  try {
    const query = { read: false };
    if (req.user.role !== "admin") {
      query.$or = [
        { type: { $nin: ["system", "danger"] } },
        { type: "system", relatedId: req.user.userId },
      ];
    }

    await Notification.updateMany(query, { read: true });
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Restore deleted client debt from notification action
router.post("/:id/restore-client-debt", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (notification.action !== "restore_client_debt") {
      return res.status(400).json({ message: "Bu xabarda qarzni qaytarish amali mavjud emas" });
    }

    if (notification.actionStatus !== "pending") {
      return res.status(400).json({ message: "Bu qarz allaqachon qaytarilgan yoki amal yopilgan" });
    }

    const clientId = notification.metadata?.clientId;
    const debt = notification.metadata?.debt;

    if (!clientId || !debt?._id) {
      return res.status(400).json({ message: "Qaytarish uchun qarz ma'lumoti topilmadi" });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    const alreadyRestored = client.debts.some((item) => item._id.toString() === debt._id.toString());
    if (!alreadyRestored) {
      client.debts.push({
        _id: debt._id,
        description: debt.description,
        date: debt.date,
        amount: debt.amount,
      });
      await client.save();
    }

    notification.actionStatus = "completed";
    notification.read = true;
    notification.message = `${notification.message} Qarz qaytarildi.`;
    notification.metadata = {
      ...(notification.metadata || {}),
      restoredAt: new Date(),
      restoredBy: req.user.userId,
    };
    await notification.save();

    res.json({ message: "Qarz qaytarildi", notification, client });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete notification
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Sizda o'chirish huquqi yo'q!" });
    }
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
