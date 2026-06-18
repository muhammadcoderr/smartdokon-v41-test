const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const Cashbox = require("../Models/Cashbox");
const BonusSettings = require("../Models/BonusSettings");
const authenticateToken = require("../middleware/authenticateToken");
const requireRoles = require("../middleware/requireRoles");
const PaymentSchema = require("../Models/Payment");
const ProductSchema = require("../Models/Product");
const ClientSchema = require("../Models/Client");
const SellerSchema = require("../Models/Seller");
const Notification = require("../Models/Notification");
const monitorStock = require("../Bot/monitorStock");
const ProductNumber = require("../Bot/ProductNumber");
const debtNotification = require("../Bot/DebtNotification");

// Helper to update client bonus
const updateClientBonus = async (clientId, totalPrice) => {
  try {
    const bonusSettings = await BonusSettings.findOne();
    if (bonusSettings && bonusSettings.isActive && bonusSettings.percentage > 0) {
      const bonusAmount = (totalPrice * bonusSettings.percentage) / 100;
      await ClientSchema.findByIdAndUpdate(clientId, { $inc: { bonus: bonusAmount } });
    }
  } catch (error) {
    console.error("Error updating client bonus:", error);
  }
};

// GET all payments with optional filtering
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, sellerId, clientId, status } = req.query;

    const skip = (page - 1) * limit;
    const pageSize = parseInt(limit);

    let matchStage = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchStage.createdAt = {
        $gte: start,
        $lte: end,
      };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchStage.createdAt = { $gte: start };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchStage.createdAt = { $lte: end };
    }

    if (sellerId) matchStage.sellerId = sellerId;
    if (clientId) matchStage.clientId = clientId;
    if (status) matchStage.status = status;

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          paginatedResults: [
            {
              $addFields: {
                clientId: { $toObjectId: "$clientId" },
              },
            },
            {
              $lookup: {
                from: "clients",
                localField: "clientId",
                foreignField: "_id",
                as: "client",
                pipeline: [{ $project: { firstname: 1 } }],
              },
            },
            {
              $unwind: {
                path: "$client",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                clientName: "$client.firstname",
              },
            },
            {
              $project: {
                client: 0,
              },
            },
            { $skip: skip },
            { $limit: pageSize },
          ],
          totalCount: [{ $count: "count" }],
          summary: [
            {
              $group: {
                _id: null,
                totalIncome: {
                  $sum: { $ifNull: ["$discountPrice", "$totalPrice"] },
                },
                totalProfit: {
                  $sum: {
                    $cond: [
                      { $gt: [{ $ifNull: ["$profit", 0] }, 0] },
                      "$profit",
                      {
                        $reduce: {
                          input: "$products",
                          initialValue: 0,
                          in: { $add: ["$$value", { $ifNull: ["$$this.profit", 0] }] },
                        },
                      },
                    ],
                  },
                },
                totalDebt: { $sum: { $ifNull: ["$indebtedness", 0] } },
                totalBonus: { $sum: { $ifNull: ["$cashback", 0] } },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const [result] = await PaymentSchema.aggregate(pipeline);
    let data = result.paginatedResults || [];
    const totalCount = result.totalCount[0]?.count || 0;
    const summary = result.summary[0] || {
      totalIncome: 0,
      totalProfit: 0,
      totalDebt: 0,
      totalBonus: 0,
    };

    // Populate products efficiently using a single query
    const productIds = [...new Set(data.flatMap((p) => p.products.map((pr) => pr.productId)))];
    const products = await ProductSchema.find({ _id: { $in: productIds } }).select("name barcode unit category");
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const filteredData = data.map((payment) => ({
      ...payment,
      products: payment.products.map((p) => ({
        ...p,
        ...productMap.get(p.productId.toString())?._doc,
      })),
    }));

    res.json({
      data: filteredData,
      summary,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: parseInt(page),
        pageSize,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET single payment
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $addFields: {
          clientId: { $toObjectId: "$clientId" },
        },
      },
      {
        $lookup: {
          from: "clients",
          localField: "clientId",
          foreignField: "_id",
          as: "client",
          pipeline: [{ $project: { firstname: 1 } }],
        },
      },
      {
        $unwind: {
          path: "$client",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          clientName: "$client.firstname",
        },
      },
      {
        $project: {
          client: 0,
        },
      },
    ];

    const [payment] = await PaymentSchema.aggregate(pipeline);
    if (!payment) return res.status(404).json({ msg: "To'lov topilmadi" });

    // Populate products efficiently
    const productIds = payment.products.map((pr) => pr.productId);
    const products = await ProductSchema.find({ _id: { $in: productIds } }).select("name barcode unit category");
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    payment.products = payment.products.map((p) => ({
      ...p,
      ...productMap.get(p.productId.toString())?._doc,
    }));

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

// Create new payment
router.post("/create", authenticateToken, async (req, res, next) => {
  try {
    const { products, clientId, totalPrice, discountPrice, cash, terminal, cashback, indebtedness, type } = req.body;

    // Mahsulotlar qoldig'ini tekshirish va yangilash
    for (const item of products) {
      try {
        const product = await ProductSchema.findById(item.productId);
        if (product) {
          product.avialable -= item.quantity;
          product.totalSold = (product.totalSold || 0) + item.quantity;
          product.lastSoldDate = new Date();
          await product.save();

          // Notifications and alerts
          if (product.avialable <= 0) {
            monitorStock.monitorStock(product).catch(err => console.error("MonitorStock error:", err));
            Notification.create({
              message: `${product.name} mahsuloti tugadi (Qoldiq: ${product.avialable})`,
              type: 'danger',
              severity: 'critical',
              relatedId: product._id,
              relatedModel: 'Product'
            }).catch(err => console.error("Notification error:", err));
          } else if (product.avialable < 5) {
            Notification.create({
              message: `${product.name} mahsulotidan kam qoldi (${product.avialable} dona)`,
              type: 'low_stock',
              severity: 'warning',
              relatedId: product._id,
              relatedModel: 'Product'
            }).catch(err => console.error("Low stock notification error:", err));
          }

          if (product.avialable < 0) {
            ProductNumber.ProductNumber(product, item.quantity).catch(err => console.error("ProductNumber error:", err));
          }
        }
      } catch (prodErr) {
        console.error(`Error updating product ${item.productId}:`, prodErr);
      }
    }

    // Mijozga qarz yozish (agar qarz bo'lsa)
    if (indebtedness > 0 && clientId) {
      try {
        const client = await ClientSchema.findById(clientId);
        if (client) {
          client.debts.push({
            description: "To'lov qarzi (POS)",
            date: new Date(),
            amount: indebtedness,
          });
          await client.save();
          debtNotification.notifyCreditSale(req.body, client).catch(err => console.error("Debt notification error:", err));
        }
      } catch (clientErr) {
        console.error("Error updating client debt:", clientErr);
      }
    }

    // Mijozning bonus hisobini yangilash
    if (clientId) {
      await updateClientBonus(clientId, discountPrice);
      if (cashback > 0) {
        await ClientSchema.findByIdAndUpdate(clientId, { $inc: { bonus: -cashback } }).catch(err => console.error("Bonus decrement error:", err));
      }
    }

    const seller = await SellerSchema.findById(req.user.userId).select("firstname login");

    // To'lovni yaratish
    const paymentData = {
      ...req.body,
      sellerId: req.user.userId,
      sellername: seller?.firstname || "Noma'lum",
      sellerlogin: seller?.login || "",
      status: type === "pos" ? "success" : "waiting",
    };

    const data = await PaymentSchema.create(paymentData);

    // Cashbox balanslarini yangilash (Simple and direct)
    try {
      const cashbox = await Cashbox.findOne();
      if (cashbox) {
        if (cash > 0) cashbox.cashBalance += cash;
        if (terminal > 0) cashbox.cardBalance += terminal;
        await cashbox.save();
      }
    } catch (cashErr) {
      console.error("Cashbox update error:", cashErr);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Payment create critical error:", error);
    next(error);
  }
});

// Update payment with transaction
router.put("/update/:id", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const paymentId = req.params.id;
    const { cash, terminal, cashback } = req.body;

    // Avvalgi to'lov ma'lumotlarini topish
    const oldPayment = await PaymentSchema.findById(paymentId);
    if (!oldPayment) {
      return res.status(404).json({ msg: "To'lov topilmadi" });
    }

    // Cashbox ni topish
    const cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(404).json({ error: "Cashbox topilmadi" });
    }

    // Avvalgi to'lov miqdorlarini Cashbox balanslaridan chiqarish
    if (oldPayment.cash > 0) {
      cashbox.cashBalance -= oldPayment.cash;
    }
    if (oldPayment.terminal > 0) {
      cashbox.cardBalance -= oldPayment.terminal;
    }

    // Avvalgi bonus (cashback) ni mijozga qaytarish
    if (oldPayment.cashback > 0 && oldPayment.clientId) {
      await ClientSchema.findByIdAndUpdate(oldPayment.clientId, {
        $inc: { bonus: oldPayment.cashback },
      });
    }

    // Yangi to'lov miqdorlarini Cashbox balanslariga qo'shish
    if (cash > 0) {
      cashbox.cashBalance += cash;
    }
    if (terminal > 0) {
      cashbox.cardBalance += terminal;
    }

    // Yangi bonus (cashback) ni mijozdan chegirish
    if (cashback > 0 && oldPayment.clientId) {
      await ClientSchema.findByIdAndUpdate(oldPayment.clientId, {
        $inc: { bonus: -cashback },
      });
    }

    // Cashbox ni saqlash
    await cashbox.save();

    // To'lovni yangilash
    const updatedPayment = await PaymentSchema.findByIdAndUpdate(
      paymentId,
      req.body,
      {
        new: true,
      }
    );

    res.json(updatedPayment);
  } catch (error) {
    next(error);
  }
});

// DELETE
router.delete("/delete/:id", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const paymentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ message: "Invalid payment ID format" });
    }

    const payment = await PaymentSchema.findByIdAndDelete(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "To'lov topilmadi" });
    }

    // Prepare cashbox update
    const cashboxUpdate = { $inc: {} };

    if (payment.cash > 0) {
      cashboxUpdate.$inc.cashBalance = -payment.cash;
    }
    if (payment.terminal > 0) {
      cashboxUpdate.$inc.cardBalance = -payment.terminal;
    }

    // Update cashbox if necessary
    if (Object.keys(cashboxUpdate.$inc).length > 0) {
      await Cashbox.findOneAndUpdate({}, cashboxUpdate, { upsert: true });
    }

    // Update client's bonus if cashback was used (return bonus to client)
    if (payment.cashback > 0 && payment.clientId) {
      await ClientSchema.findByIdAndUpdate(payment.clientId, {
        $inc: { bonus: payment.cashback },
      });
    }

    res.status(200).json({ msg: "To'lov muvaffaqiyatli o'chirildi" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
