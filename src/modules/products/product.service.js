const mongoose = require("mongoose");
const Product = require("../../shared/database/models/Product");
const { StockSchema } = require("../../shared/database/models/Stock");
const { ProductBatchSchema } = require("../../shared/database/models/ProductBatch");
const { SupplierSchema } = require("../../shared/database/models/Supplier");
const { SupplierTransactionSchema } = require("../../shared/database/models/SupplierTransaction");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const ProductTransfer = require("../../shared/database/models/ProductTransfer");
const { getModel } = require("../../shared/helpers/modelFactory");
const deletedProduct = require("../../bot/deletedProduct");
const { v4: uuidv4 } = require("uuid");

class ProductService {
  // Helper to get models
  _getModels(dbConnection) {
    return {
      Stock: getModel(dbConnection, "Stock", StockSchema),
      ProductBatch: getModel(dbConnection, "ProductBatch", ProductBatchSchema),
      Supplier: getModel(dbConnection, "Supplier", SupplierSchema),
      SupplierTransaction: getModel(dbConnection, "SupplierTransaction", SupplierTransactionSchema),
      Cashbox: getModel(dbConnection, "Cashbox", CashboxSchema),
    };
  }

  /**
   * Filialdagi mahsulotlar ro'yxatini olish (Advanced with aggregation)
   */
  async getProducts(dbConnection, filters = {}) {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const summary = filters.summary !== "false";
    const { name, category, unit, isShowroom, startDate, endDate } = filters;
    const { Stock } = this._getModels(dbConnection);

    const localStocks = await Stock.find({}).select("product quantity").lean();
    const localProductIds = localStocks.map((s) => s.product);

    let query = { _id: { $in: localProductIds } };

    if (startDate && endDate) {
      query.updatedAt = { $gte: new Date(startDate), $lte: new Date(endDate + "T23:59:59.999Z") };
    }
    if (category) query.category = category;
    if (unit) query.unit = unit;
    if (isShowroom !== undefined) {
      query.isShowroom = isShowroom === "true";
    }
    
    if (name) {
      const searchStr = name;
      query.$and = [
          { _id: { $in: localProductIds } },
          { $or: [ 
            { name: { $regex: searchStr, $options: "i" } }, 
            { barcode: { $regex: searchStr, $options: "i" } }, 
            { barcodes: { $regex: searchStr, $options: "i" } } 
          ] }
      ];
      delete query._id;
    }

    const facet = {
      paginatedResults: [
        { $sort: { updatedAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: Number(limit) },
        { $project: { name: 1, arrivalprice: 1, sellingprice: 1, category: 1, barcode: 1, barcodes: 1, unit: 1, updatedAt: 1 } },
      ],
      totalCount: [{ $count: "count" }],
    };

    if (summary) {
      facet.categories = [{ $group: { _id: "$category" } }, { $project: { _id: 0, category: "$_id" } }];
    }

    const [result] = await Product.aggregate([{ $match: query }, { $facet: facet }]);

    const totalDocs = result.totalCount[0]?.count || 0;
    const stockMap = new Map(localStocks.map(s => [s.product.toString(), s.quantity]));
    
    const productsWithStock = (result.paginatedResults || []).map((product) => ({
        ...product,
        branchQuantity: stockMap.get(product._id.toString()) || 0
    }));

    let stats = { totalSellingPrice: 0, totalArrivalPrice: 0, totalItems: 0 };
    if (summary) {
        const productsInfo = await Product.find({ _id: { $in: localProductIds } }).select("arrivalprice sellingprice").lean();
        const productMap = new Map(productsInfo.map(p => [p._id.toString(), p]));

        localStocks.forEach(s => {
          const pInfo = productMap.get(s.product.toString());
          if (pInfo) {
            stats.totalSellingPrice += (pInfo.sellingprice || 0) * (s.quantity || 0);
            stats.totalArrivalPrice += (pInfo.arrivalprice || 0) * (s.quantity || 0);
            stats.totalItems += (s.quantity || 0);
          }
        });
    }

    return {
      data: productsWithStock,
      totalProducts: totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      ...stats,
      totalProfit: stats.totalSellingPrice - stats.totalArrivalPrice,
      categories: (result.categories || []).map((item) => item.category).filter(Boolean),
    };
  }

  async getLeftoverProducts(dbConnection, filters = {}) {
    const { page = 1, limit = 20, months = 2, name } = filters;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const { Stock } = this._getModels(dbConnection);
    const localStocks = await Stock.find({}).select("product quantity").lean();
    const localProductIds = localStocks.map(s => s.product);

    let query = { _id: { $in: localProductIds }, updatedAt: { $lt: cutoffDate } };
    if (name) query.name = { $regex: name, $options: "i" };

    const result = await Product.paginate(query, { page, limit, lean: true });
    const stockMap = new Map(localStocks.map(s => [s.product.toString(), s.quantity]));

    const data = result.docs.map((product) => ({
        ...product,
        branchQuantity: stockMap.get(product._id.toString()) || 0
    }));

    return { data, totalPages: result.totalPages, totalProducts: result.totalDocs };
  }

  async getFinishedProducts(dbConnection, filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const { Stock } = this._getModels(dbConnection);

    const lowStocks = await Stock.find({ quantity: { $lt: 5 } })
      .sort({ quantity: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const totalCount = await Stock.countDocuments({ quantity: { $lt: 5 } });

    const productIds = lowStocks.map(s => s.product);
    const productsInfo = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(productsInfo.map(p => [p._id.toString(), p]));

    const data = lowStocks.map((stock) => {
        const product = productMap.get(stock.product.toString());
        return product ? { ...product, branchQuantity: stock.quantity } : null;
    }).filter(Boolean);

    return { data, totalPages: Math.ceil(totalCount / limit), totalProducts: totalCount };
  }

  async createProduct(dbConnection, productData, user) {
    let { barcode, barcodes, supplierId, arrivalprice, avialable, paymentMethod, ...rest } = productData;
    const { Stock, Supplier, ProductBatch } = this._getModels(dbConnection);

    if (!barcodes) barcodes = [];
    if (!barcode) barcode = await this.generateUniqueBarcode();
    if (!barcodes.includes(barcode)) barcodes.push(barcode);

    let supplier = supplierId ? await Supplier.findById(supplierId) : null;

    let product = await Product.findOne({ $or: [{ barcode }, { barcodes: barcode }] });
    if (!product) {
        product = new Product({ ...rest, barcode, barcodes, arrivalprice, avialable: 0 });
    } else {
        product.arrivalprice = arrivalprice;
        product.sellingprice = rest.sellingprice;
    }
    await product.save();

    const currentStock = await Stock.findOne({ product: product._id }).lean();
    const previousQuantity = currentStock ? currentStock.quantity : 0;
    const newQuantity = previousQuantity + (avialable || 0);

    await Stock.findOneAndUpdate({ product: product._id }, { quantity: newQuantity }, { upsert: true, new: true });

    if ((avialable || 0) > 0) {
      await ProductBatch.create({
        productId: product._id, batchNumber: this.generateBatchNumber(), productName: product.name,
        quantity: avialable, previousQuantity, newQuantity,
        arrivalprice, sellingprice: product.sellingprice, unit: product.unit, category: product.category,
        supplierId: supplier?._id, supplierName: supplier?.name, paymentMethod: paymentMethod || "credit", createdBy: user.userId,
      });
      await this.applySupplierPurchase(dbConnection, { supplier, product, quantity: avialable, arrivalprice, paymentMethod, userId: user.userId });
    }

    return product;
  }

  async addBatch(dbConnection, batchData, user) {
    const { items, supplierId, paymentMethod, note } = batchData;
    const { Stock, Supplier, ProductBatch } = this._getModels(dbConnection);
    const supplier = supplierId ? await Supplier.findById(supplierId).lean() : null;
    const batchNumber = batchData.batchNumber || this.generateBatchNumber();

    for (const item of items) {
      let product;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
          product = await Product.findById(item.productId);
      }
      
      if (!product) {
          product = new Product({
              name: item.name,
              arrivalprice: Number(item.arrivalprice),
              sellingprice: Number(item.sellingprice),
              category: item.category,
              unit: item.unit,
              barcode: item.barcode,
              barcodes: item.barcodes
          });
          await product.save();
      }

      product.arrivalprice = Number(item.arrivalprice);
      product.sellingprice = Number(item.sellingprice);
      await product.save();

      const currentStock = await Stock.findOne({ product: product._id }).lean();
      const previousQuantity = currentStock ? currentStock.quantity : 0;
      const newQuantity = previousQuantity + Number(item.quantity);

      await Stock.findOneAndUpdate({ product: product._id }, { quantity: newQuantity }, { upsert: true, new: true });

      await ProductBatch.create({
        productId: product._id, batchNumber, productName: product.name, quantity: item.quantity,
        previousQuantity, newQuantity, arrivalprice: item.arrivalprice, sellingprice: item.sellingprice,
        unit: product.unit, category: product.category,
        supplierId: supplier?._id, supplierName: supplier?.name, paymentMethod: paymentMethod || "credit", note, createdBy: user.userId,
      });

      await this.applySupplierPurchase(dbConnection, { supplier, product, quantity: item.quantity, arrivalprice: item.arrivalprice, paymentMethod, userId: user.userId });
    }
    return true;
  }

  async getBatches(dbConnection, filters = {}) {
    const { page = 1, limit = 20, startDate, endDate, name, productId } = filters;
    const { ProductBatch } = this._getModels(dbConnection);
    let matchQuery = {};

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        matchQuery.productId = new mongoose.Types.ObjectId(productId);
    }
    if (startDate && endDate) {
        matchQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate + "T23:59:59.999Z") };
    }
    if (name) matchQuery.productName = { $regex: name, $options: "i" };

    const pipeline = [
        { $match: matchQuery },
        { $group: {
            _id: "$batchNumber",
            batchNumber: { $first: "$batchNumber" },
            createdAt: { $first: "$createdAt" },
            items: { $push: "$$ROOT" },
            itemCount: { $sum: 1 },
            totalQuantity: { $sum: "$quantity" },
            totalAmount: { $sum: { $multiply: ["$quantity", "$arrivalprice"] } },
        }},
        { $sort: { createdAt: -1 } }
    ];

    const totalBatchesResult = await ProductBatch.aggregate([
        { $match: matchQuery },
        { $group: { _id: "$batchNumber" } },
        { $count: "count" }
    ]);
    const totalDocs = totalBatchesResult[0]?.count || 0;

    const groupedDocs = await ProductBatch.aggregate([
        ...pipeline,
        { $skip: (page - 1) * limit },
        { $limit: Number(limit) }
    ]);

    const summary = await ProductBatch.aggregate([
        { $match: matchQuery },
        { $group: {
            _id: null,
            uniqueBatches: { $addToSet: "$batchNumber" },
            totalQuantity: { $sum: "$quantity" },
            totalAmount: { $sum: { $multiply: ["$quantity", "$arrivalprice"] } }
        }},
        { $project: {
            _id: 0,
            totalBatches: { $size: "$uniqueBatches" },
            totalQuantity: 1,
            totalAmount: 1
        }}
    ]);

    return {
        data: groupedDocs,
        totalPages: Math.ceil(totalDocs / limit),
        totalDocs,
        totalBatches: summary[0]?.totalBatches || 0,
        totalQuantity: summary[0]?.totalQuantity || 0,
        totalAmount: summary[0]?.totalAmount || 0
    };
  }

  async getBatchDetails(dbConnection, batchNumber) {
    const { ProductBatch } = this._getModels(dbConnection);
    const batches = await ProductBatch.find({ batchNumber }).lean();

    if (!batches || batches.length === 0) return null;

    let totalQuantity = 0;
    let totalAmount = 0;

    const items = batches.map(b => {
      const qty = Number(b.quantity || 0);
      const price = Number(b.arrivalprice || 0);
      totalQuantity += qty;
      totalAmount += qty * price;

      return {
        productName: b.productName,
        category: b.category,
        quantity: qty,
        unit: b.unit,
        previousQuantity: b.previousQuantity,
        newQuantity: b.newQuantity,
        arrivalprice: price,
        sellingprice: b.sellingprice,
        supplierName: b.supplierName,
        note: b.note,
        _id: b._id,
        createdAt: b.createdAt
      };
    });

    return {
        batchNumber,
        createdAt: batches[0].createdAt,
        supplierName: batches[0].supplierName,
        note: batches[0].note,
        totalQuantity,
        totalAmount,
        items
    };
  }

  async updateProduct(productId, updateData) {
    const product = await Product.findByIdAndUpdate(productId, updateData, { new: true });
    return product;
  }

  async deleteProduct(productId, user) {
    const product = await Product.findById(productId);
    if (!product) return null;

    await Product.findByIdAndDelete(productId);
    try {
        await deletedProduct(product.name, user.login);
    } catch (e) { console.error("Bot notification error:", e.message); }
    return true;
  }

  async getProductByBarcode(dbConnection, barcode) {
    const product = await Product.findOne({ $or: [{ barcode }, { barcodes: barcode }] }).lean();
    if (!product) return null;

    const { Stock } = this._getModels(dbConnection);
    const stock = await Stock.findOne({ product: product._id }).lean();
    return { ...product, branchQuantity: stock ? stock.quantity : 0 };
  }

  async getProductById(dbConnection, productId) {
    const product = await Product.findById(productId).lean();
    if (!product) return null;
    const { Stock } = this._getModels(dbConnection);
    const stock = await Stock.findOne({ product: product._id }).lean();
    return { ...product, branchQuantity: stock ? stock.quantity : 0 };
  }

  async getTransfers(user) {
    const userBranchId = user.branchId;
    let query = {};

    if (!user.isMainBranch) {
      query.$or = [{ fromBranch: userBranchId }, { toBranch: userBranchId }];
    }

    return await ProductTransfer.find(query)
      .populate("fromBranch", "name")
      .populate("toBranch", "name")
      .populate("sender", "firstname lastname login")
      .sort({ createdAt: -1 });
  }

  async getAllProductNames() {
    return await Product.find({}).select("_id name").lean();
  }

  // --- Core Utility Methods ---

  async decreaseStock(dbConnection, items) {
    const { Stock } = this._getModels(dbConnection);
    for (const item of items) {
      if (!item.productId) continue;
      await Stock.findOneAndUpdate({ product: item.productId }, { $inc: { quantity: -Number(item.quantity) } });
      await Product.findByIdAndUpdate(item.productId, { $inc: { avialable: -Number(item.quantity), totalSold: Number(item.quantity) } });
    }
  }

  async increaseStock(dbConnection, items) {
    const { Stock } = this._getModels(dbConnection);
    for (const item of items) {
      if (!item.productId) continue;
      await Stock.findOneAndUpdate({ product: item.productId }, { $inc: { quantity: Number(item.quantity) } });
      await Product.findByIdAndUpdate(item.productId, { $inc: { avialable: Number(item.quantity), totalSold: -Number(item.quantity) } });
    }
  }

  async applySupplierPurchase(dbConnection, { supplier, product, quantity, arrivalprice, paymentMethod, userId }) {
    const totalPurchaseAmount = Number(arrivalprice || 0) * Number(quantity || 0);
    if (!supplier || totalPurchaseAmount <= 0) return;

    const { SupplierTransaction, Cashbox, Supplier: SupplierModel } = this._getModels(dbConnection);

    const transaction = new SupplierTransaction({
      supplierId: supplier._id,
      type: "purchase",
      amount: totalPurchaseAmount,
      paymentMethod: paymentMethod || "credit",
      description: `Sotib olindi: ${product.name} (${quantity} ${product.unit || "dona"})`,
      productIds: [product._id],
      createdBy: userId || null,
    });
    await transaction.save();

    const updateData = { $inc: { totalPurchased: totalPurchaseAmount } };

    if (paymentMethod && paymentMethod !== "credit") {
      updateData.$inc.totalPaid = totalPurchaseAmount;
      const updateField = `${paymentMethod}Balance`;
      await Cashbox.findOneAndUpdate(
        {},
        {
          $inc: { [updateField]: -totalPurchaseAmount },
          $push: {
            transactions: {
              type: "expense",
              amount: totalPurchaseAmount,
              paymentMethod: paymentMethod,
              description: `Ta'minotchidan mahsulot olindi: ${supplier.name}`,
              relatedSupplierId: supplier._id,
            },
          },
        },
        { upsert: true }
      );
    } else {
      updateData.$inc.totalDebt = totalPurchaseAmount;
    }
    await SupplierModel.findByIdAndUpdate(supplier._id, updateData);
  }

  generateBatchNumber() {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = String(date.getTime()).slice(-6);
    return `KIR-${datePart}-${timePart}`;
  }

  async generateUniqueBarcode() {
    let attempts = 0;
    while (attempts < 5) {
      const barcode = Date.now().toString().slice(-8) + Math.floor(1000 + Math.random() * 9000);
      const exists = await Product.findOne({ $or: [{ barcode }, { barcodes: barcode }] }).lean().select("_id");
      if (!exists) return barcode;
      attempts++;
    }
    return uuidv4().replace(/-/g, "").slice(0, 12);
  }
}

module.exports = new ProductService();
