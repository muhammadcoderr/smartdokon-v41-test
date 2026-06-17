const Supplier = require("../database/models/Supplier");
const Product = require("../database/models/Product");
const SupplierTransaction = require("../database/models/SupplierTransaction");

// Helper function to update supplier financial totals
const updateSupplierTotals = async (supplierId, session = null) => {
  try {
    const purchases = await SupplierTransaction.aggregate([
      { $match: { supplierId: supplierId, type: "purchase" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).session(session);

    const payments = await SupplierTransaction.aggregate([
      { $match: { supplierId: supplierId, type: "payment" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).session(session);

    const totalPurchased = purchases.length > 0 ? purchases[0].total : 0;
    const totalPaid = payments.length > 0 ? payments[0].total : 0;
    const totalDebt = Math.max(0, totalPurchased - totalPaid);

    await Supplier.findByIdAndUpdate(
      supplierId,
      {
        totalPurchased: totalPurchased,
        totalPaid: totalPaid,
        totalDebt: totalDebt,
      },
      { session }
    );

    return { totalPurchased, totalPaid, totalDebt };
  } catch (error) {
    throw new Error(`Error updating supplier totals: ${error.message}`);
  }
};

// Generate supplier report
const generateSupplierReport = async (supplierId, dateFrom, dateTo) => {
  try {
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);

    const matchStage = { supplierId: supplierId };
    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    // Transaction summary
    const transactionSummary = await SupplierTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
    ]);

    // Monthly breakdown
    const monthlyBreakdown = await SupplierTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            type: "$type",
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Product breakdown
    const productBreakdown = await Product.aggregate([
      { $match: { supplierId: supplierId } },
      {
        $project: {
          name: 1,
          category: 1,
          totalValue: { $multiply: ["$avialable", "$arrivalprice"] },
          profitMargin: {
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
    ]);

    return {
      transactionSummary,
      monthlyBreakdown,
      productBreakdown,
    };
  } catch (error) {
    throw new Error(`Error generating supplier report: ${error.message}`);
  }
};

// Check overdue payments
const checkOverduePayments = async () => {
  try {
    const overdueSuppliers = await Supplier.find({
      totalDebt: { $gt: 0 },
      status: "active",
    });

    const overdueData = [];

    for (const supplier of overdueSuppliers) {
      // Find oldest unpaid purchase
      const oldestPurchase = await SupplierTransaction.findOne({
        supplierId: supplier._id,
        type: "purchase",
      }).sort({ createdAt: 1 });

      if (oldestPurchase) {
        const daysPastDue =
          Math.floor(
            (new Date() - oldestPurchase.createdAt) / (1000 * 60 * 60 * 24)
          ) - supplier.paymentTerms;

        if (daysPastDue > 0) {
          overdueData.push({
            supplier: supplier,
            daysPastDue: daysPastDue,
            oldestPurchaseDate: oldestPurchase.createdAt,
            debtAmount: supplier.totalDebt,
          });
        }
      }
    }

    return overdueData.sort((a, b) => b.daysPastDue - a.daysPastDue);
  } catch (error) {
    throw new Error(`Error checking overdue payments: ${error.message}`);
  }
};

module.exports = {
  updateSupplierTotals,
  generateSupplierReport,
  checkOverduePayments,
};
