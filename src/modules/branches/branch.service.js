const mongoose = require("mongoose");
const Branch = require("../../shared/database/models/Branch");
const ProductTransfer = require("../../shared/database/models/ProductTransfer");
const { getTenantConnection } = require("../../shared/database/tenantManager");
const { getModel } = require("../../shared/helpers/modelFactory");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const { StockSchema } = require("../../shared/database/models/Stock");
const { ProductBatchSchema } = require("../../shared/database/models/ProductBatch");
const { PaymentSchema } = require("../../shared/database/models/Payment");
const { ClientSchema } = require("../../shared/database/models/Client");
const Product = require("../../shared/database/models/Product");

class BranchService {
  async getAllBranches() {
    return await Branch.find()
      .populate("parentBranch", "name")
      .populate("manager", "username firstname lastname login")
      .lean();
  }

  async getBranchById(id) {
    return await Branch.findById(id)
      .populate("parentBranch", "name")
      .populate("manager", "username firstname lastname login")
      .lean();
  }

  async createBranch(branchData) {
    const { name, code, isMainBranch } = branchData;
    
    const maxLimit = Number(process.env.MAX_BRANCH_LIMIT) || 100;
    const currentBranchCount = await Branch.countDocuments();

    if (currentBranchCount >= maxLimit) {
      throw new Error(`Filiallar soni cheklangan! Maksimal miqdor: ${maxLimit} ta.`);
    }

    if (isMainBranch === true) {
      await Branch.updateMany({ isMainBranch: true }, { $set: { isMainBranch: false } });
    }

    if (branchData.manager) {
      // Automatik boshqa filialdan manejerni bo'shatish
      await Branch.updateMany({ manager: branchData.manager }, { $unset: { manager: "" } });
    }

    const branchDbName = `smartdokon_branch_${(code || name).toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`;
    const branch = new Branch({
      ...branchData,
      dbName: branchDbName,
      code: code || `BR-${Date.now()}`,
    });

    await branch.save();

    // Initialize Cashbox in new DB
    const conn = await getTenantConnection(branchDbName);
    const CashboxModel = getModel(conn, "Cashbox", CashboxSchema);
    await CashboxModel.create({
      branchId: branch._id,
      cashBalance: 0,
      cardBalance: 0,
      bankBalance: 0,
      transactions: []
    });

    return branch;
  }

  async updateBranch(id, updateData) {
    if (updateData.isMainBranch === true) {
      await Branch.updateMany({ _id: { $ne: id }, isMainBranch: true }, { $set: { isMainBranch: false } });
    }

    if (updateData.manager) {
      // Automatik boshqa filialdan manejerni bo'shatish (joriy filialdan tashqari)
      await Branch.updateMany({ _id: { $ne: id }, manager: updateData.manager }, { $unset: { manager: "" } });
    }

    return await Branch.findByIdAndUpdate(id, updateData, { new: true })
      .populate("parentBranch", "name")
      .populate("manager", "username firstname lastname login");
  }

  async deleteBranch(id) {
    const branch = await Branch.findById(id);
    if (!branch) return null;
    if (branch.isMainBranch) throw new Error("Asosiy filialni o'chirib bo'lmaydi.");

    await Branch.findByIdAndDelete(id);
    return true;
  }

  async getTransferHistory(user, filters = {}) {
    const userBranchId = user.branchId;
    const { branchId, status } = filters;
    let query = {};

    if (!user.isMainBranch) {
      query.$or = [{ fromBranch: userBranchId }, { toBranch: userBranchId }];
    } else if (branchId) {
      query.$or = [{ fromBranch: branchId }, { toBranch: branchId }];
    }

    if (status) query.status = status;

    return await ProductTransfer.find(query)
      .populate("fromBranch", "name")
      .populate("toBranch", "name")
      .populate("sender", "firstname lastname login")
      .populate("receiver", "firstname lastname login")
      .sort({ createdAt: -1 })
      .lean();
  }

  async sendTransfer(transferData, user) {
    const { fromBranchId, toBranchId, products, note } = transferData;
    const fromBranch = await Branch.findById(fromBranchId);
    const toBranch = await Branch.findById(toBranchId);

    if (!fromBranch || !toBranch) throw new Error("Filial topilmadi");

    const sourceConn = await getTenantConnection(fromBranch.dbName);
    const SourceStock = getModel(sourceConn, "Stock", StockSchema);

    // Check stock
    for (const item of products) {
      const stock = await SourceStock.findOne({ product: item.productId });
      if (!stock || stock.quantity < item.quantity) {
        throw new Error(`Mahsulot yetarli emas: ${item.productName}. Mavjud: ${stock ? stock.quantity : 0}`);
      }
    }

    // Decrease stock
    for (const item of products) {
      await SourceStock.findOneAndUpdate({ product: item.productId }, { $inc: { quantity: -item.quantity } });
      if (fromBranch.isMainBranch) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { avialable: -item.quantity } });
      }
    }

    const transfer = new ProductTransfer({
      fromBranch: fromBranchId,
      toBranch: toBranchId,
      products,
      note,
      sender: user.userId,
      status: "pending"
    });

    return await transfer.save();
  }

  async receiveTransfer(transferId, user) {
    const transfer = await ProductTransfer.findById(transferId);
    if (!transfer || transfer.status !== "pending") throw new Error("Transfer yaroqsiz");

    const toBranch = await Branch.findById(transfer.toBranch);
    const fromBranch = await Branch.findById(transfer.fromBranch);
    const targetConn = await getTenantConnection(toBranch.dbName);
    const TargetStock = getModel(targetConn, "Stock", StockSchema);
    const ProductBatch = getModel(targetConn, "ProductBatch", ProductBatchSchema);

    const batchNumber = `TRF-${String(transfer._id).slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    
    for (const item of transfer.products) {
      const oldStock = await TargetStock.findOne({ product: item.productId });
      const previousQuantity = oldStock ? oldStock.quantity : 0;
      
      await TargetStock.findOneAndUpdate({ product: item.productId }, { $inc: { quantity: item.quantity } }, { upsert: true, new: true });

      // Uzatma qabul qilinganda mahsulotni avtomatik "sotuv" holatiga o'tkazish (Showroomdan chiqarish)
      const catalogUpdate = { $set: { isShowroom: false } };
      if (toBranch.isMainBranch) {
        catalogUpdate.$inc = { avialable: item.quantity };
      }
      
      await Product.findByIdAndUpdate(item.productId, catalogUpdate);

      const productCatalog = await Product.findById(item.productId).lean();
      await ProductBatch.create({
        productId: item.productId,
        batchNumber: batchNumber,
        productName: item.productName || productCatalog?.name || "Noma'lum",
        quantity: item.quantity,
        previousQuantity: previousQuantity,
        newQuantity: previousQuantity + item.quantity,
        arrivalprice: productCatalog?.arrivalprice || 0,
        sellingprice: productCatalog?.sellingprice || 0,
        unit: productCatalog?.unit || "Dona",
        category: productCatalog?.category || "Uzatma",
        note: `Filialdan uzatilgan: ${fromBranch.name}. Izoh: ${transfer.note || ""}`,
        createdBy: user.userId,
      });
    }

    transfer.status = "completed";
    transfer.receiver = user.userId;
    transfer.receivedDate = new Date();
    return await transfer.save();
  }

  async getBranchesAnalytics(user) {
    if (!user.isMainBranch) {
      throw new Error("Ruxsat yo'q. Faqat asosiy filial admini ko'ra oladi.");
    }

    const allBranches = await Branch.find({ dbName: { $exists: true } }).lean();
    
    const branchStats = await Promise.all(
      allBranches.map(async (br) => {
        try {
          const conn = await getTenantConnection(br.dbName);
          const Payment = getModel(conn, "Payment", PaymentSchema);
          const Cashbox = getModel(conn, "Cashbox", CashboxSchema);
          const Client = getModel(conn, "Client", ClientSchema);

          const totalSales = await Payment.aggregate([
            { $group: { _id: null, total: { $sum: "$discountPrice" }, profit: { $sum: "$profit" } } }
          ]);
          
          const kassa = await Cashbox.findOne().lean();
          const clientCount = await Client.countDocuments();

          return {
            branchId: br._id,
            branchName: br.name,
            totalIncome: totalSales[0]?.total || 0,
            totalProfit: totalSales[0]?.profit || 0,
            cashBalance: (kassa?.cashBalance || 0) + (kassa?.cardBalance || 0) + (kassa?.bankBalance || 0),
            clientCount
          };
        } catch (err) { 
          return { branchId: br._id, branchName: br.name, error: "Ulanib bo'lmadi" }; 
        }
      })
    );

    return branchStats;
  }
}

module.exports = new BranchService();
