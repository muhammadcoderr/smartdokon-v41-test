const mongoose = require("mongoose");
const Branch = require("../database/models/Branch");
const { getTenantConnection } = require("../database/tenantManager");
const { getModel } = require("../helpers/modelFactory");
const { PaymentSchema } = require("../database/models/Payment");
const { CostsSchema } = require("../database/models/Costs");

/**
 * Markazlashgan sana parsheri
 */
const parseSafeDate = (dateStr) => {
    if (!dateStr) return null;
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    const dotParts = dateStr.split('.');
    if (dotParts.length === 3) {
        date = new Date(parseInt(dotParts[2]), parseInt(dotParts[1]) - 1, parseInt(dotParts[0]));
        if (!isNaN(date.getTime())) return date;
    }
    return null;
};

/**
 * Barcha filiallardan to'lovlarni yig'ish
 */
const getAggregatedPayments = async (user, filters = {}) => {
  const { startDate, endDate, branchId, page = 1, limit = 10 } = filters;
  const isMainAdmin = user.role === 'admin' && user.isMainBranch;

  const start = parseSafeDate(startDate);
  const end = parseSafeDate(endDate);

  const query = {};
  if (start || end) {
    query.createdAt = {};
    if (start) query.createdAt.$gte = start;
    if (end) query.createdAt.$lte = new Date(end.getTime() + 86399999);
  }

  let combinedData = [];
  let totalCount = 0;
  const globalSummary = { totalIncome: 0, totalProfit: 0, totalDebt: 0, totalBonus: 0 };

  const branchesToQuery = isMainAdmin 
    ? (branchId ? await Branch.find({ _id: branchId }).lean() : await Branch.find({ dbName: { $exists: true } }).lean())
    : [await Branch.findById(user.branchId).lean()];

  const branchPromises = branchesToQuery.map(async (br) => {
    if (!br || !br.dbName) return null;
    try {
      const conn = await getTenantConnection(br.dbName, br.mongoUri);
      const Payment = getModel(conn, "Payment", PaymentSchema);

      const [summary] = await Payment.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            income: { $sum: { $ifNull: ["$discountPrice", "$totalPrice"] } },
            profit: { $sum: { $ifNull: ["$profit", 0] } },
            debt: { $sum: { $ifNull: ["$indebtedness", 0] } },
            bonus: { $sum: { $ifNull: ["$cashback", 0] } },
            count: { $sum: 1 }
          }
        }
      ]);

      if (summary) {
        globalSummary.totalIncome += summary.income;
        globalSummary.totalProfit += summary.profit;
        globalSummary.totalDebt += summary.debt;
        globalSummary.totalBonus += summary.bonus;
        totalCount += summary.count;
      }

      const docs = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) * parseInt(page))
        .select("products clientName totalPrice discountPrice cash terminal cashback indebtedness createdAt profit")
        .lean();
        
      return docs.map(d => ({ ...d, branchName: br.name }));

    } catch (err) {
      console.error(`Error in branch ${br.name}:`, err.message);
      return [];
    }
  });

  const results = await Promise.all(branchPromises);
  results.filter(Boolean).forEach(batch => { combinedData = [...combinedData, ...batch]; });

  combinedData.sort((a, b) => b.createdAt - a.createdAt);
  const pagedData = combinedData.slice((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit));

  return {
    data: pagedData,
    pagination: { currentPage: parseInt(page), totalPages: Math.ceil(totalCount / limit), totalCount },
    summary: globalSummary
  };
};

/**
 * Barcha filiallardan xarajatlarni yig'ish
 */
const getAggregatedCosts = async (user, filters = {}) => {
  const { startDate, endDate, branchId, page = 1, limit = 10 } = filters;
  const isMainAdmin = user.role === 'admin' && user.isMainBranch;

  const start = parseSafeDate(startDate);
  const end = parseSafeDate(endDate);

  const query = {};
  if (start || end) {
    query.createdAt = {};
    if (start) query.createdAt.$gte = start;
    if (end) query.createdAt.$lte = new Date(end.getTime() + 86399999);
  }

  let combinedData = [];
  let totalCount = 0;
  let totalAmount = 0;

  const branchesToQuery = isMainAdmin 
    ? (branchId ? await Branch.find({ _id: branchId }).lean() : await Branch.find({ dbName: { $exists: true } }).lean())
    : [await Branch.findById(user.branchId).lean()];

  const branchPromises = branchesToQuery.map(async (br) => {
    if (!br || !br.dbName) return null;
    try {
      const conn = await getTenantConnection(br.dbName, br.mongoUri);
      const Costs = getModel(conn, "Costs", CostsSchema);

      const [summary] = await Costs.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]);

      if (summary) {
        totalAmount += summary.total;
        totalCount += summary.count;
      }

      const docs = await Costs.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) * parseInt(page))
        .lean();
        
      return docs.map(d => ({ ...d, branchName: br.name }));
    } catch (err) {
      console.error(`Error in branch ${br.name}:`, err.message);
      return [];
    }
  });

  const results = await Promise.all(branchPromises);
  results.filter(Boolean).forEach(batch => { combinedData = [...combinedData, ...batch]; });

  combinedData.sort((a, b) => b.createdAt - a.createdAt);
  const pagedData = combinedData.slice((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit));

  return {
    data: pagedData,
    pagination: { currentPage: parseInt(page), totalPages: Math.ceil(totalCount / limit), totalCount },
    totalAmount
  };
};

module.exports = {
  getAggregatedPayments,
  getAggregatedCosts
};
