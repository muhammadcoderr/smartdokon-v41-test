const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { getAutopilotData, getAutopilotRoadmap } = require("../../shared/controllers/autopilotController");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const Branch = require("../../shared/database/models/Branch");
const Product = require("../../shared/database/models/Product");
const { getModel } = require("../../shared/helpers/modelFactory");
const { SupplierSchema } = require("../../shared/database/models/Supplier");
const SmartRoadmapProgress = require("../../shared/database/models/SmartRoadmapProgress");
const { StockSchema } = require("../../shared/database/models/Stock");
const { getTenantConnection } = require("../../shared/database/tenantManager");

const dashboardTimezone = process.env.APP_TIMEZONE || "Asia/Tashkent";

// GET Autopilot Insights
router.get("/autopilot-insights", authenticateToken, async (req, res, next) => {
  try {
    const insights = await getAutopilotData(req.user, req.db || mongoose.connection, req.query);
    res.json({ success: true, data: insights });
  } catch (error) {
    next(error);
  }
});

// GET Autopilot Roadmap
router.get("/autopilot-roadmap", authenticateToken, async (req, res, next) => {
    try {
        const roadmap = await getAutopilotRoadmap(req.user, req.db || mongoose.connection, req.query);
        res.json({ success: true, data: roadmap });
    } catch (error) {
        next(error);
    }
});

// GET general sales trends (Aggregated for Dashboard)
router.get("/general-sales-trends", authenticateToken, async (req, res, next) => {
    try {
      const isMainAdmin = req.user.role === 'admin' && req.user.isMainBranch;
      const { branchId } = req.query;
  
      let targetBranches = [];
      if (isMainAdmin) {
          // Asosiy admin bo'lsa barcha filiallarni yoki tanlangan filialni oladi
          targetBranches = branchId ? await Branch.find({ _id: branchId }) : await Branch.find({ dbName: { $exists: true } });
      } else {
          // Oddiy filial bo'lsa faqat o'zini oladi
          targetBranches = [await Branch.findById(req.user.branchId)];
      }
  
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
      let globalTodaySales = [];
      let globalMonthlySales = [];
      let counts = { products: 0, clients: 0, suppliers: 0, cashbox: 0 };
  
      for (const br of targetBranches) {
          if (!br.dbName) continue;
          try {
              const conn = await getTenantConnection(br.dbName, br.mongoUri);
              const Payment = getModel(conn, "Payment", require("../../shared/database/models/Payment").PaymentSchema);
              const Client = getModel(conn, "Client", require("../../shared/database/models/Client").ClientSchema);
              const Supplier = getModel(conn, "Supplier", SupplierSchema);
              const Cashbox = getModel(conn, "Cashbox", require("../../shared/database/models/Cashbox").CashboxSchema);
              const Stock = getModel(conn, "Stock", StockSchema);
  
              // 1. Bugungi soatbay savdo (Bugungi Savdo charti uchun)
              const branchTodaySales = await Payment.aggregate([
                  { $match: { createdAt: { $gte: today } } },
                  { $group: { _id: { hour: { $hour: { date: "$createdAt", timezone: dashboardTimezone } } }, totalAmount: { $sum: "$discountPrice" }, count: { $sum: 1 } } }
              ]);
              
              branchTodaySales.forEach(s => {
                  const existing = globalTodaySales.find(gs => gs._id.hour === s._id.hour);
                  if (existing) { existing.totalAmount += s.totalAmount; existing.count += s.count; }
                  else { globalTodaySales.push(s); }
              });

              // 2. Oylik savdo dinamikasi (Yillik Sotuv Dinamikasi charti uchun)
              const branchMonthlySales = await Payment.aggregate([
                  { $match: { createdAt: { $gte: oneYearAgo } } },
                  { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, totalAmount: { $sum: "$discountPrice" } } },
                  { $sort: { "_id.year": 1, "_id.month": 1 } }
              ]);

              branchMonthlySales.forEach(s => {
                  const existing = globalMonthlySales.find(gs => gs._id.year === s._id.year && gs._id.month === s._id.month);
                  if (existing) { existing.totalAmount += s.totalAmount; }
                  else { globalMonthlySales.push(s); }
              });
  
              // 3. Umumiy sanog'ichlar (Counts)
              const localProductCount = await Stock.countDocuments({});
              counts.products += localProductCount;
              counts.clients += await Client.countDocuments();
              counts.suppliers += await Supplier.countDocuments({ status: "active" });
              
              const kassa = await Cashbox.findOne();
              if (kassa) counts.cashbox += (kassa.cashBalance || 0) + (kassa.cardBalance || 0);
          } catch (err) { console.error(`Error in branch ${br.name}:`, err.message); }
      }
  
      res.json({ 
          success: true, 
          todaySales: globalTodaySales.sort((a, b) => a._id.hour - b._id.hour), 
          monthlySales: globalMonthlySales.sort((a, b) => (a._id.year - b._id.year) || (a._id.month - b._id.month)),
          counts 
      });
    } catch (error) { next(error); }
  });

module.exports = router;
