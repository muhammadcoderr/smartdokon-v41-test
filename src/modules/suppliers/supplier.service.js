const mongoose = require("mongoose");
const { SupplierSchema } = require("../../shared/database/models/Supplier");
const { SupplierTransactionSchema } = require("../../shared/database/models/SupplierTransaction");
const { CostsSchema } = require("../../shared/database/models/Costs");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const Product = require("../../shared/database/models/Product");
const { getModel } = require("../../shared/helpers/modelFactory");

class SupplierService {
  _getModels(dbConnection) {
    return {
      Supplier: getModel(dbConnection, "Supplier", SupplierSchema),
      SupplierTransaction: getModel(dbConnection, "SupplierTransaction", SupplierTransactionSchema),
      Costs: getModel(dbConnection, "Costs", CostsSchema),
      Cashbox: getModel(dbConnection, "Cashbox", CashboxSchema),
      Product: getModel(dbConnection, "Product", require("../../shared/database/models/Product").ProductSchema),
    };
  }

  async getSuppliers(dbConnection, filters = {}) {
    const { Supplier } = this._getModels(dbConnection);
    const options = {
      page: parseInt(filters.page) || 1,
      limit: parseInt(filters.limit) || 10,
      sort: { createdAt: -1 },
    };

    const query = {};
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: "i" } },
        { companyName: { $regex: filters.search, $options: "i" } },
        { contactPerson: { $regex: filters.search, $options: "i" } },
      ];
    }
    // Remove query.status filter if not explicitly requested to avoid hiding inactive ones unless desired
    if (filters.status) {
      query.status = filters.status;
    }

    return await Supplier.paginate(query, options);
  }

  async getSupplierById(dbConnection, id) {
    const { Supplier, SupplierTransaction, Product } = this._getModels(dbConnection);
    
    const supplier = await Supplier.findById(id);
    if (!supplier) return null;

    const products = await Product.find({ supplierId: id }).limit(20);

    const transactions = await SupplierTransaction.find({ supplierId: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("createdBy", "firstname");

    const stats = await SupplierTransaction.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    return { supplier, products, transactions, statistics: stats };
  }

  async createSupplier(dbConnection, supplierData) {
    const { Supplier } = this._getModels(dbConnection);
    const supplier = new Supplier(supplierData);
    return await supplier.save();
  }

  async updateSupplier(dbConnection, id, supplierData) {
    const { Supplier } = this._getModels(dbConnection);
    return await Supplier.findByIdAndUpdate(id, supplierData, { new: true });
  }

  async deleteSupplier(dbConnection, id) {
    const { Supplier } = this._getModels(dbConnection);
    return await Supplier.findByIdAndDelete(id);
  }

  async getSupplierFinancialSummary(dbConnection, id) {
    const { SupplierTransaction } = this._getModels(dbConnection);
    
    const monthlyData = await SupplierTransaction.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          amount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 }
    ]);

    const transactionSummary = await SupplierTransaction.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    return { monthlyData, transactionSummary };
  }

  async makePayment(dbConnection, supplierId, paymentData, user) {
    const { amount, paymentMethod, description, referenceNumber, supplierName } = paymentData;
    const { Supplier, SupplierTransaction, Costs, Cashbox } = this._getModels(dbConnection);

    if (!amount || amount <= 0) throw new Error("Yaroqsiz summa");

    const transaction = new SupplierTransaction({
      supplierId,
      type: "payment",
      amount,
      paymentMethod: paymentMethod || "cash",
      description,
      referenceNumber,
      createdBy: user.userId,
    });
    await transaction.save();

    await Supplier.findByIdAndUpdate(supplierId, { $inc: { totalPaid: amount, totalDebt: -amount } });

    await Costs.create({
      supplierName,
      supplierId,
      description: `Ta'minotchiga to'lov: ${description || ""}`,
      amount,
      paymentMethod: paymentMethod || "cash",
      category: "supplier_payment",
      branchId: user.branchId
    });

    const updateField = `${paymentMethod || "cash"}Balance`;
    await Cashbox.findOneAndUpdate(
      {},
      {
        $inc: { [updateField]: -amount },
        $push: {
          transactions: {
            type: "expense",
            amount,
            paymentMethod: paymentMethod || "cash",
            description: `Ta'minotchiga to'lov: ${supplierName}`,
            relatedSupplierId: supplierId,
          },
        },
      },
      { upsert: true }
    );

    return true;
  }
}

module.exports = new SupplierService();
