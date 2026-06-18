const express = require("express");
const router = express.Router();
const Supplier = require("../Models/Supplier");
const Product = require("../Models/Product");
const SupplierTransaction = require("../Models/SupplierTransaction");
const Costs = require("../Models/Costs");
const Cashbox = require("../Models/Cashbox");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");

// GET all suppliers with pagination
router.get("/", authenticateToken, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: { createdAt: -1 },
    };

    const query = {};

    // Search functionality
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { companyName: { $regex: req.query.search, $options: "i" } },
        { contactPerson: { $regex: req.query.search, $options: "i" } },
      ];
    }

    // Status filter
    if (req.query.status) {
      query.status = req.query.status;
    } else {
      query.status = "active";
    }

    const suppliers = await Supplier.paginate(query, options);
    res.json({
      success: true,
      data: suppliers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers",
      error: error.message,
    });
  }
});

// GET supplier by ID with detailed information
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Get supplier's products
    const products = await Product.find({ supplierId: req.params.id })
      .select("name arrivalprice sellingprice avialable category barcode unit")
      .limit(20);

    // Get recent transactions
    const transactions = await SupplierTransaction.find({
      supplierId: req.params.id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("createdBy", "firstname");

    // Calculate statistics
    const stats = await SupplierTransaction.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        supplier,
        products,
        transactions,
        statistics: stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching supplier details",
      error: error.message,
    });
  }
});

// POST create new supplier
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: supplier,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Supplier with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating supplier",
      error: error.message,
    });
  }
});

// PUT update supplier
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    if (req.body.name) {
      await Product.updateMany(
        { supplierId: req.params.id },
        { supplierName: req.body.name }
      );
    }

    res.json({
      success: true,
      message: "Supplier updated successfully",
      data: supplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating supplier",
      error: error.message,
    });
  }
});

// DELETE supplier
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Check if supplier has outstanding debt
    const supplier = await Supplier.findById(req.params.id);
    if (supplier && supplier.totalDebt > 0) {
      return res.status(400).json({
        success: false,
        message: "Qarzdorlik mavjud bo'lgan ta'minotchini o'chirib bo'lmaydi",
      });
    }

    await Supplier.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true }
    );

    res.json({
      success: true,
      message: "Ta'minotchi muvaffaqiyatli o'chirildi (deaktivatsiya qilindi)",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Ta'minotchini o'chirishda xatolik",
      error: error.message,
    });
  }
});

// GET supplier products
router.get("/:id/products", authenticateToken, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sort: { createdAt: -1 },
    };

    const query = { supplierId: req.params.id };

    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: "i" };
    }

    const products = await Product.paginate(query, options);

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching supplier products",
      error: error.message,
    });
  }
});

// GET supplier transactions
router.get("/:id/transactions", authenticateToken, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sort: { createdAt: -1 },
      populate: [
        { path: "createdBy", select: "firstname" },
        { path: "productIds", select: "name" },
      ],
    };

    const query = { supplierId: req.params.id };

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      query.createdAt = {};
      if (req.query.dateFrom) {
        query.createdAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        query.createdAt.$lte = new Date(req.query.dateTo);
      }
    }

    const transactions = await SupplierTransaction.paginate(query, options);

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching supplier transactions",
      error: error.message,
    });
  }
});

// POST make payment to supplier (without session)
router.post("/:id/payment", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      amount,
      paymentMethod,
      description,
      referenceNumber,
      supplierName,
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    const transaction = new SupplierTransaction({
      supplierId: req.params.id,
      type: "payment",
      amount,
      paymentMethod: paymentMethod || "cash",
      description,
      referenceNumber,
      createdBy: req.user ? req.user._id : null,
    });

    await transaction.save();

    await Supplier.findByIdAndUpdate(req.params.id, {
      $inc: {
        totalPaid: amount,
        totalDebt: -amount,
      },
    });

    const cost = new Costs({
      supplierName,
      supplierId: req.params.id,
      description: `Ta'minotchiga to'landi: ${description || "Ta'minotchiga to'lov"}`,
      amount,
      paymentMethod: paymentMethod || "cash",
      category: "supplier_payment",
      supplierTransactionId: transaction._id,
    });

    await cost.save();

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
            description: `Ta'minotchiga to'landi: ${supplierName || "N/A"}`,
            relatedSupplierId: req.params.id,
          },
        },
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: "Payment recorded successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing payment",
      error: error.message,
    });
  }
});

// GET supplier financial summary
router.get("/:id/financial-summary", authenticateToken, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Get transactions summary
    const summary = await SupplierTransaction.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          lastTransaction: { $max: "$createdAt" },
        },
      },
    ]);

    // Get monthly summary for last 12 months
    const monthlyData = await SupplierTransaction.aggregate([
      {
        $match: {
          supplierId: new mongoose.Types.ObjectId(req.params.id),
          createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            type: "$type",
          },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({
      success: true,
      data: {
        supplier,
        transactionSummary: summary,
        monthlyData: monthlyData,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching financial summary",
      error: error.message,
    });
  }
});

module.exports = router;
