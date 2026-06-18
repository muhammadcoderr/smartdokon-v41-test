const express = require("express");
const router = express.Router();
const Supplier = require("../Models/Supplier");
const Product = require("../Models/Product");
const SupplierTransaction = require("../Models/SupplierTransaction");
const PaymentSchema = require("../Models/Payment");
const SmartRoadmapProgress = require("../Models/SmartRoadmapProgress");
const requireAdmin = require("../middleware/requireAdmin");
const { checkOverduePayments } = require("../helper/supplierHelpers");
const authenticateToken = require("../middleware/authenticateToken");
const { generateAutopilotInsights, generateAutopilotRoadmap } = require("../ai/autopilot");
const { roadmapTemplate } = require("../ai/autopilot/roadmapEngine");

const dashboardTimezone =
  process.env.APP_TIMEZONE || process.env.CRON_TIMEZONE || "Asia/Tashkent";

const getDateStringInTimezone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

// GET supplier dashboard summary
router.get("/supplier-summary", authenticateToken, async (req, res) => {
  try {
    // Basic counts
    const totalSuppliers = await Supplier.countDocuments({ status: "active" });
    const totalProducts = await Product.countDocuments();

    // Financial summary
    const financialSummary = await Supplier.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: null,
          totalDebt: { $sum: "$totalDebt" },
          totalPaid: { $sum: "$totalPaid" },
          totalPurchased: { $sum: "$totalPurchased" },
        },
      },
    ]);

    // Top suppliers by debt
    const topDebtors = await Supplier.find({
      totalDebt: { $gt: 0 },
      status: "active",
    })
      .sort({ totalDebt: -1 })
      .limit(5)
      .select("name totalDebt totalPurchased");

    // Top suppliers by purchase volume
    const topByVolume = await Supplier.find({ status: "active" })
      .sort({ totalPurchased: -1 })
      .limit(5)
      .select("name totalPurchased totalPaid");

    // Recent transactions
    const recentTransactions = await SupplierTransaction.find()
      .populate("supplierId", "name")
      .populate("createdBy", "firstname")
      .sort({ createdAt: -1 })
      .limit(10);

    // Low stock products with supplier info
    const lowStockProducts = await Product.find({
      $expr: { $lte: ["$avialable", "$minimumStock"] },
    })
      .populate("supplierId", "name phone")
      .limit(10);

    // Check overdue payments
    const overduePayments = await checkOverduePayments();

    res.json({
      success: true,
      data: {
        counts: {
          totalSuppliers,
          totalProducts,
          overdueCount: overduePayments.length,
        },
        financial: financialSummary[0] || {
          totalDebt: 0,
          totalPaid: 0,
          totalPurchased: 0,
        },
        topDebtors,
        topByVolume,
        recentTransactions,
        lowStockProducts,
        overduePayments: overduePayments.slice(0, 5),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching supplier dashboard summary",
      error: error.message,
    });
  }
});

// GET supplier analytics
router.get("/supplier-analytics", authenticateToken, async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Purchase trends
    const purchaseTrends = await SupplierTransaction.aggregate([
      {
        $match: {
          type: "purchase",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Payment trends
    const paymentTrends = await SupplierTransaction.aggregate([
      {
        $match: {
          type: "payment",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
          totalAmount: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Supplier performance (by purchase volume)
    const supplierPerformance = await SupplierTransaction.aggregate([
      {
        $match: {
          type: "purchase",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$supplierId",
          totalPurchases: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          avgTransactionSize: { $avg: "$amount" },
        },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: "$supplier" },
      { $sort: { totalPurchases: -1 } },
      { $limit: 10 },
    ]);

    // Category analysis
    const categoryAnalysis = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          productCount: { $sum: 1 },
          totalStock: { $sum: "$avialable" },
          totalValue: { $sum: { $multiply: ["$avialable", "$arrivalprice"] } },
          avgProfitMargin: {
            $avg: {
              $multiply: [
                {
                  $divide: [
                    { $subtract: ["$sellingprice", "$arrivalprice"] },
                    "$arrivalprice",
                  ],
                },
                100,
              ],
            },
          },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        purchaseTrends,
        paymentTrends,
        supplierPerformance,
        categoryAnalysis,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching supplier analytics",
      error: error.message,
    });
  }
});

// GET overdue payments report
router.get("/overdue-payments", authenticateToken, async (req, res) => {
  try {
    const overduePayments = await checkOverduePayments();

    res.json({
      success: true,
      data: overduePayments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching overdue payments",
      error: error.message,
    });
  }
});

router.get("/autopilot-insights", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requestedWindow = Number(req.query.windowDays || 30);
    const windowDays = Number.isFinite(requestedWindow)
      ? Math.min(Math.max(Math.floor(requestedWindow), 7), 120)
      : 30;

    const insights = await generateAutopilotInsights({ windowDays });
    res.json(insights);
  } catch (error) {
    console.error("Error fetching autopilot insights:", error);
    res.status(500).json({
      success: false,
      message: "Autopilot insightlarni olishda xatolik",
      error: error.message,
    });
  }
});

router.get("/autopilot-roadmap", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const requestedYear = Number(req.query.year || currentYear);
    const year = Number.isFinite(requestedYear)
      ? Math.min(Math.max(Math.floor(requestedYear), 2020), 2100)
      : currentYear;

    const progressDocs = await SmartRoadmapProgress.find({ year }).lean();
    const progressByMonth = progressDocs.reduce((acc, item) => {
      acc[item.month] = {
        completed: Boolean(item.completed),
        note: item.note || "",
        taskProgress: item.taskProgress || {},
        completedAt: item.completedAt || null,
        updatedBy: item.updatedBy || null,
      };
      return acc;
    }, {});

    const roadmap = await generateAutopilotRoadmap({ year, windowDays: 90, progressByMonth });
    res.json(roadmap);
  } catch (error) {
    console.error("Error fetching autopilot roadmap:", error);
    res.status(500).json({
      success: false,
      message: "Autopilot roadmapni olishda xatolik",
      error: error.message,
    });
  }
});

router.put("/autopilot-roadmap/progress", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const requestedYear = Number(req.body.year || currentYear);
    const year = Number.isFinite(requestedYear)
      ? Math.min(Math.max(Math.floor(requestedYear), 2020), 2100)
      : currentYear;

    const requestedMonth = Number(req.body.month);
    const month = Number.isFinite(requestedMonth)
      ? Math.min(Math.max(Math.floor(requestedMonth), 1), 12)
      : 1;

    const completed = Boolean(req.body.completed);
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

    const updateData = {
      completed,
      note,
      taskProgress: completed
        ? Object.fromEntries(
            (roadmapTemplate[month - 1]?.actions || []).map((_, index) => [String(index), true])
          )
        : {},
      completedAt: completed ? new Date() : null,
      updatedBy: req.user.userId || null,
    };

    const progress = await SmartRoadmapProgress.findOneAndUpdate(
      { year, month },
      { $set: updateData },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      progress: {
        year: progress.year,
        month: progress.month,
        completed: progress.completed,
        note: progress.note || "",
        taskProgress: progress.taskProgress || {},
        completedAt: progress.completedAt || null,
        updatedBy: progress.updatedBy || null,
      },
    });
  } catch (error) {
    console.error("Error updating roadmap progress:", error);
    res.status(500).json({
      success: false,
      message: "Roadmap progressni yangilashda xatolik",
      error: error.message,
    });
  }
});

router.put("/autopilot-roadmap/task-progress", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const requestedYear = Number(req.body.year || currentYear);
    const year = Number.isFinite(requestedYear)
      ? Math.min(Math.max(Math.floor(requestedYear), 2020), 2100)
      : currentYear;

    const requestedMonth = Number(req.body.month);
    const month = Number.isFinite(requestedMonth)
      ? Math.min(Math.max(Math.floor(requestedMonth), 1), 12)
      : 1;

    const maxActionIndex = (roadmapTemplate[month - 1]?.actions || []).length - 1;
    const requestedActionIndex = Number(req.body.actionIndex);
    const actionIndex = Number.isFinite(requestedActionIndex)
      ? Math.min(Math.max(Math.floor(requestedActionIndex), 0), Math.max(maxActionIndex, 0))
      : 0;

    const completed = Boolean(req.body.completed);
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

    const existing = await SmartRoadmapProgress.findOne({ year, month }).lean();
    const taskProgress = {
      ...(existing?.taskProgress || {}),
      [String(actionIndex)]: completed,
    };

    const totalActions = (roadmapTemplate[month - 1]?.actions || []).length;
    const completedActions = Object.values(taskProgress).filter(Boolean).length;
    const monthCompleted = totalActions > 0 && completedActions >= totalActions;

    const progress = await SmartRoadmapProgress.findOneAndUpdate(
      { year, month },
      {
        $set: {
          completed: monthCompleted,
          note: note || existing?.note || "",
          taskProgress,
          completedAt: monthCompleted ? new Date() : null,
          updatedBy: req.user.userId || null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      progress: {
        year: progress.year,
        month: progress.month,
        completed: progress.completed,
        note: progress.note || "",
        taskProgress: progress.taskProgress || {},
        completedAt: progress.completedAt || null,
        updatedBy: progress.updatedBy || null,
      },
    });
  } catch (error) {
    console.error("Error updating roadmap task progress:", error);
    res.status(500).json({
      success: false,
      message: "Roadmap task progressni yangilashda xatolik",
      error: error.message,
    });
  }
});

// GET general sales trends (12 months & Today)
router.get("/general-sales-trends", authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    const todayInTimezone = getDateStringInTimezone(today, dashboardTimezone);

    // 1. Last 12 Months Sales
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(today.getMonth() - 11);
    twelveMonthsAgo.setDate(1); // Start from beginning of that month

    const monthlySales = await PaymentSchema.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          // Filter only valid sales if needed, e.g. type: 'pos' or 'sale' depending on schema
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { date: "$createdAt", timezone: dashboardTimezone } },
            month: { $month: { date: "$createdAt", timezone: dashboardTimezone } },
          },
          totalAmount: {
            $sum: {
              $cond: [
                { $ifNull: ["$discountPrice", false] }, // If discountPrice exists and is not null/false
                "$discountPrice",
                "$totalPrice"
              ]
            }
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // 2. Today's Hourly Sales
    const todaySales = await PaymentSchema.aggregate([
      {
        $match: {
          $expr: {
            $eq: [
              {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: dashboardTimezone,
                },
              },
              todayInTimezone,
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            hour: {
              $hour: {
                date: "$createdAt",
                timezone: dashboardTimezone,
              },
            },
          },
          totalAmount: {
            $sum: {
              $cond: [
                { $ifNull: ["$discountPrice", false] },
                "$discountPrice",
                "$totalPrice"
              ]
            }
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.hour": 1 } },
    ]);

    // 3. General Counts (for badges on cards)
    const productCount = await Product.countDocuments();
    const clientCount = await require("../Models/Client").countDocuments();
    const supplierCount = await Supplier.countDocuments({ status: "active" });
    const cashbox = await require("../Models/Cashbox").findOne();

    res.json({
      success: true,
      monthlySales,
      todaySales,
      counts: {
        products: productCount,
        clients: clientCount,
        suppliers: supplierCount,
        cashbox: cashbox ? cashbox.cashBalance + cashbox.cardBalance : 0
      }
    });

  } catch (error) {
    console.error("Error fetching general sales trends:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
