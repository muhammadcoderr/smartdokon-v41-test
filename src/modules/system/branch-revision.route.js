const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");
const Branch = require("../../shared/database/models/Branch");
const { getTenantConnection } = require("../../shared/database/tenantManager");
const { getModel } = require("../../shared/helpers/modelFactory");

const BranchRevisionSchema = require("../../shared/database/models/BranchRevision").schema;
const { PaymentSchema } = require("../../shared/database/models/Payment");
const { CostsSchema } = require("../../shared/database/models/Costs");
const { ProductBatchSchema } = require("../../shared/database/models/ProductBatch");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const DebtsSchema = require("../../shared/database/models/Debts").schema;

// Filial reviziyasini generatsiya qilish
router.post("/generate", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { branchId, year, month } = req.body;

    if (!branchId || !year || !month) {
      return res.status(400).json({ success: false, message: "branchId, year va month talab qilinadi" });
    }

    const branch = await Branch.findById(branchId);
    if (!branch || !branch.dbName) {
      return res.status(404).json({ success: false, message: "Filial topilmadi yoki DB biriktirilmagan" });
    }

    const conn = await getTenantConnection(branch.dbName, branch.mongoUri);
    const Payment = getModel(conn, "Payment", PaymentSchema);
    const Costs = getModel(conn, "Costs", CostsSchema);
    const ProductBatch = getModel(conn, "ProductBatch", ProductBatchSchema);
    const Cashbox = getModel(conn, "Cashbox", CashboxSchema);
    // Reviziyalar ham tenant db da turishi kerak
    const BranchRevision = getModel(conn, "BranchRevision", BranchRevisionSchema);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // 1. Savdolar bo'yicha tushum va foyda
    const payments = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: "cancelled" }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$discountPrice" },
          totalProfit: { $sum: "$profit" },
          cashIn: { $sum: "$cash" },
          terminalIn: { $sum: "$terminal" }
        }
      }
    ]);

    const paymentStats = payments[0] || { totalRevenue: 0, totalProfit: 0, cashIn: 0, terminalIn: 0, debtIn: 0, bonusIn: 0 };

    // 1.1 Category breakdown
    const categoryStats = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: "cancelled" }
        }
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.category",
          revenue: { $sum: { $multiply: ["$products.sellingPrice", "$products.quantity"] } },
          profit: { $sum: { $subtract: [{ $multiply: ["$products.sellingPrice", "$products.quantity"] }, { $multiply: ["$products.arrivalPrice", "$products.quantity"] }] } }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    const salesByCategory = categoryStats.map(c => ({
      category: c._id || "Boshqa",
      revenue: c.revenue,
      profit: c.profit
    }));

    // 1.2 Top Products
    const productStats = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: "cancelled" }
        }
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productName",
          quantity: { $sum: "$products.quantity" },
          revenue: { $sum: { $multiply: ["$products.sellingPrice", "$products.quantity"] } },
          profit: { $sum: { $subtract: [{ $multiply: ["$products.sellingPrice", "$products.quantity"] }, { $multiply: ["$products.arrivalPrice", "$products.quantity"] }] } }
        }
      },
      { $sort: { quantity: -1 } }
    ]);

    const topProducts = productStats.slice(0, 10).map(p => ({
      name: p._id,
      quantity: p.quantity,
      revenue: p.revenue
    }));

    const fullProductPerformance = productStats.map(p => ({
      name: p._id,
      quantity: p.quantity,
      revenue: p.revenue,
      profit: p.profit
    }));

    // 1.3 Detailed Payment Methods
    const detailedPayments = await Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $ne: "cancelled" }
          }
        },
        {
          $group: {
            _id: null,
            cash: { $sum: "$cash" },
            terminal: { $sum: "$terminal" },
            debt: { $sum: "$debt" },
            bonus: { $sum: "$bonus" }
          }
        }
    ]);
    const payBreakdown = detailedPayments[0] || { cash: 0, terminal: 0, debt: 0, bonus: 0 };

    // 1.4 Comparison with previous month
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    
    const prevRevision = await BranchRevision.findOne({
      branchId: branch._id,
      "period.year": prevYear,
      "period.month": prevMonth
    });

    let revenueGrowth = 0;
    let profitGrowth = 0;

    if (prevRevision && prevRevision.financialSummary?.totalRevenue > 0) {
        revenueGrowth = ((paymentStats.totalRevenue - prevRevision.financialSummary.totalRevenue) / prevRevision.financialSummary.totalRevenue) * 100;
    }
    if (prevRevision && prevRevision.financialSummary?.totalProfit > 0) {
        profitGrowth = ((paymentStats.totalProfit - prevRevision.financialSummary.totalProfit) / prevRevision.financialSummary.totalProfit) * 100;
    }

    // 2. Xarajatlar (Costs)
    const costsAggregate = await Costs.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: "cancelled" }
        }
      },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    const expensesBreakdown = costsAggregate.map(c => ({
      category: c._id || "Boshqa",
      amount: c.totalAmount
    }));

    const totalCosts = costsAggregate.reduce((acc, curr) => acc + curr.totalAmount, 0);

    // 3. Kelgan mahsulotlar (ProductBatch)
    const batches = await ProductBatch.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          addedProductsCount: { $sum: 1 },
          stockInValue: { $sum: "$totalPrice" }
        }
      }
    ]);

    const batchStats = batches[0] || { addedProductsCount: 0, stockInValue: 0 };

    // 4. Qarzlar (Debts) - shu oyda berilgan va qaytarilgan qarzlar
    const Debts = getModel(conn, "Debts", DebtsSchema);
    const debtsAggregate = await Debts.aggregate([
      { $unwind: "$amount" },
      {
        $match: {
          "amount.date": { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$amount.type",
          totalAmount: { $sum: "$amount.amount" }
        }
      }
    ]);

    let givenDebts = 0;
    let paidDebts = 0;
    debtsAggregate.forEach(d => {
      if(d._id === 'debt') givenDebts = d.totalAmount;
      if(d._id === 'payment') paidDebts = d.totalAmount;
    });

    // 5. Kassa (Cashbox) - Hozirgi qoldiqni closingBalance deb olamiz
    const cashbox = await Cashbox.findOne();
    const currentCashBalance = cashbox ? (cashbox.cashBalance || 0) + (cashbox.cardBalance || 0) : 0;

    // Tekshiramiz: shu oy uchun avvalroq generatsiya qilinganmi?
    let revision = await BranchRevision.findOne({
      branchId: branch._id,
      "period.year": year,
      "period.month": month
    });

    if (revision) {
      if (revision.status === "finalized") {
        return res.status(400).json({ success: false, message: "Bu oy uchun hisobot allaqachon tasdiqlangan (finalized) va o'zgartirib bo'lmaydi." });
      }
      
      // Update draft
      revision.productsSummary = {
        addedProductsCount: batchStats.addedProductsCount,
        stockInValue: batchStats.stockInValue
      };
      revision.financialSummary = {
        totalRevenue: paymentStats.totalRevenue,
        totalProfit: paymentStats.totalProfit,
        totalCosts: totalCosts
      };
      revision.cashboxSummary = {
        openingBalance: revision.cashboxSummary.openingBalance, // Keep previous opening balance
        closingBalance: currentCashBalance,
        cashIn: paymentStats.cashIn,
        terminalIn: paymentStats.terminalIn
      };
      revision.debtsSummary = {
        givenDebts,
        paidDebts
      };
      revision.expensesBreakdown = expensesBreakdown;
      revision.salesByCategory = salesByCategory;
      revision.topProducts = topProducts;
      revision.fullProductPerformance = fullProductPerformance;
      revision.paymentMethodsBreakdown = {
          cash: payBreakdown.cash,
          terminal: payBreakdown.terminal,
          debt: payBreakdown.debt,
          bonus: payBreakdown.bonus
      };
      revision.comparison = {
          revenueGrowth,
          profitGrowth
      };
      revision.generatedBy = req.user.userId;

    } else {
      const openingBalance = prevRevision ? prevRevision.cashboxSummary.closingBalance : currentCashBalance;

      revision = new BranchRevision({
        branchId: branch._id,
        branchName: branch.name,
        period: { year, month },
        productsSummary: {
          addedProductsCount: batchStats.addedProductsCount,
          stockInValue: batchStats.stockInValue
        },
        financialSummary: {
          totalRevenue: paymentStats.totalRevenue,
          totalProfit: paymentStats.totalProfit,
          totalCosts: totalCosts
        },
        cashboxSummary: {
          openingBalance: openingBalance,
          closingBalance: currentCashBalance,
          cashIn: paymentStats.cashIn,
          terminalIn: paymentStats.terminalIn
        },
        debtsSummary: {
          givenDebts,
          paidDebts
        },
        expensesBreakdown: expensesBreakdown,
        salesByCategory,
        topProducts,
        paymentMethodsBreakdown: {
            cash: payBreakdown.cash,
            terminal: payBreakdown.terminal,
            debt: payBreakdown.debt,
            bonus: payBreakdown.bonus
        },
        comparison: {
            revenueGrowth,
            profitGrowth
        },
        status: "draft",
        generatedBy: req.user.userId
      });
    }

    await revision.save();

    res.json({ success: true, data: revision });

  } catch (error) {
    next(error);
  }
});


// Barcha reviziyalarni olish (yoki filter bo'yicha)
router.get("/", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { branchId, year, month } = req.query;
    let query = {};
    
    // Agar branchId berilmagan bo'lsa, joriy filiallarni tekshirish kerak
    // Hozirgi tuzilmada, asosiy admin hamma filiallarni ko'ra oladi
    if (!req.user.isMainBranch) {
        return res.status(403).json({success: false, message: "Faqat asosiy filial admini ko'ra oladi."});
    }

    if (branchId) query.branchId = branchId;
    if (year) query["period.year"] = parseInt(year);
    if (month) query["period.month"] = parseInt(month);

    let allRevisions = [];

    // Barcha mavjud filiallarni olish
    const branches = branchId ? await Branch.find({_id: branchId}) : await Branch.find({ dbName: { $exists: true } });

    for (const br of branches) {
        if(!br.dbName) continue;
        try {
            const conn = await getTenantConnection(br.dbName, br.mongoUri);
            const BranchRevision = getModel(conn, "BranchRevision", BranchRevisionSchema);
            
            // Filialning db_sidan filterga mos keluvchi reviziyalarni olish
            const revisions = await BranchRevision.find(year || month ? query : {}).sort({"period.year": -1, "period.month": -1});
            allRevisions = allRevisions.concat(revisions);
        } catch(err) {
            console.error(`Filial db ulanish xatosi (${br.name}):`, err.message);
        }
    }

    // Sort combined results
    allRevisions.sort((a, b) => {
        if (a.period.year !== b.period.year) return b.period.year - a.period.year;
        return b.period.month - a.period.month;
    });

    res.json({ success: true, data: allRevisions });
  } catch (error) {
    next(error);
  }
});

// Reviziyani tasdiqlash (finalize)
router.put("/:id/finalize", authenticateToken, requireAdmin, async (req, res, next) => {
    try {
        const { branchId } = req.body;
        if (!branchId) {
            return res.status(400).json({success: false, message: "branchId talab qilinadi"});
        }

        const branch = await Branch.findById(branchId);
        if (!branch) {
            return res.status(404).json({success: false, message: "Filial topilmadi"});
        }

        const conn = await getTenantConnection(branch.dbName, branch.mongoUri);
        const BranchRevision = getModel(conn, "BranchRevision", BranchRevisionSchema);

        const revision = await BranchRevision.findById(req.params.id);
        if (!revision) {
            return res.status(404).json({success: false, message: "Reviziya topilmadi"});
        }

        if (revision.status === "finalized") {
            return res.status(400).json({success: false, message: "Allaqachon tasdiqlangan"});
        }

        revision.status = "finalized";
        await revision.save();

        res.json({success: true, data: revision, message: "Reviziya muvaffaqiyatli tasdiqlandi"});
    } catch(error) {
        next(error);
    }
});

module.exports = router;
