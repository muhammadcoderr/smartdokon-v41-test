const mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const authenticateToken = require("../middleware/authenticateToken");

// Models
const ClientSchema = require("../Models/Client");
const PaymentSchema = require("../Models/Payment");
const Cashbox = require("../Models/Cashbox");
const Notification = require("../Models/Notification");
const ProductSchema = require("../Models/Product");
const SellerSchema = require("../Models/Seller");
const requireAdmin = require("../middleware/requireAdmin");

// Get all clients with pagination and name filter
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, name } = req.query;
    const normalizedName = String(name || "").trim();
    const phoneSearch = normalizedName.replace(/\D/g, "");
    const orFilters = normalizedName
      ? [
          { firstname: { $regex: normalizedName, $options: "i" } },
          { login: { $regex: normalizedName, $options: "i" } },
        ]
      : [];

    if (phoneSearch) {
      orFilters.push({ phone: Number(phoneSearch) });
    }

    const query = orFilters.length > 0 ? { $or: orFilters } : {};
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { firstname: 1 },
    };

    const result = await ClientSchema.paginate(query, options);

    res.json({
      data: result.docs,
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/get-clientname", authenticateToken, async (req, res, next) => {
  try {
    const clients = await ClientSchema.find().select("firstname").exec();
    const clientNames = clients.map((client) => client.firstname);
    res.json(clientNames);
  } catch (error) {
    next(error);
  }
});

router.get("/get-client/debts", authenticateToken, async (req, res, next) => {
  try {
    const { name } = req.query;
    let query = {};
    if (name) {
      query = { firstname: { $regex: name, $options: "i" } };
    }
    const clients = await ClientSchema.find(query).exec();
    let debts = clients.map((client) => {
      const totalDebt = client.debts.reduce(
        (acc, debt) => acc + debt.amount,
        0
      );
      const lastDebt =
        client.debts.length > 0 ? client.debts[client.debts.length - 1] : null;

      // Modal ichidagi qarzlar ro'yxatini tartiblash
      const sortedDebts = client.debts.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      return {
        _id: client._id,
        firstname: client.firstname,
        totalDebt,
        lastDebtDate: lastDebt ? lastDebt.date : null,
        debts: sortedDebts, // Tartiblangan qarzlar ro'yxati
      };
    });

    // Mijozlarni qarz miqdori bo'yicha saralash
    debts.sort((a, b) => b.totalDebt - a.totalDebt);

    res.json(debts);
  } catch (error) {
    next(error);
  }
});

// Add client debt
router.post(
  "/add-client/debt/:id",
  authenticateToken,
  async (req, res, next) => {
    try {
      const { description, date, amount } = req.body;
      const client = await ClientSchema.findById(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      client.debts.push({ description, date, amount });
      await client.save();
      res.json(client);
    } catch (error) {
      next(error);
    }
  }
);

// Pay client debt - YANGILANGAN VERSIYA
router.post("/pay-debt/:id", authenticateToken, async (req, res, next) => {
  try {
    const { amount, paymentMethod, description } = req.body;
    const clientId = req.params.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "To'lov summasi noto'g'ri yoki kiritilmagan" });
    }

    const client = await ClientSchema.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: "Mijoz topilmadi" });
    }

    const totalDebt = client.debts.reduce((acc, debt) => acc + debt.amount, 0);

    if (amount > totalDebt) {
      return res.status(400).json({
        error: `To'lov summasi umumiy qarzdan ko'p. Umumiy qarz: ${totalDebt}`,
      });
    }

    // To'lov tarixini saqlash
    client.paymentHistory.push({
      amount,
      date: new Date(),
      paymentMethod, // agar mavjud bo'lsa
      description,   // agar mavjud bo'lsa
    });

    let remainingPayment = parseFloat(amount);
    const updatedDebts = [];

    // Qarzni eski sanadan boshlab to'lash uchun tartiblaymiz
    const sortedDebts = [...client.debts].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    for (const debt of sortedDebts) {
      const debtAmount = parseFloat(debt.amount);
      if (remainingPayment >= debtAmount) {
        remainingPayment -= debtAmount;
      } else if (remainingPayment > 0) {
        // Qisman to'lov
        const newDebt = {
          ...debt.toObject(),
          amount: debtAmount - remainingPayment,
        };
        updatedDebts.push(newDebt);
        remainingPayment = 0;
      } else {
        // To'lanmagan qarzni qo'shish
        updatedDebts.push(debt);
      }
    }

    client.debts = updatedDebts;
    await client.save();

    res.json({
      success: true,
      message: "To'lov muvaffaqiyatli amalga oshirildi",
      client: client, // Yangilangan mijoz ma'lumotini qaytaramiz
    });
  } catch (error) {
    console.error("Pay debt error:", error);
    next(error);
  }
});

// Delete client debt
router.delete(
  "/delete-client/debt/:clientId/:debtId",
  authenticateToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { clientId, debtId } = req.params;
      const confirmed = req.query.confirm === "true" || req.body?.confirm === true;
      if (!confirmed) {
        return res.status(400).json({ error: "Qarzni o'chirish uchun tasdiqlash talab qilinadi" });
      }

      const client = await ClientSchema.findById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const debt = client.debts.id(debtId);
      if (!debt) {
        return res.status(404).json({ error: "Qarz topilmadi" });
      }

      const deletedDebt = debt.toObject();
      client.debts = client.debts.filter(
        (debt) => debt._id.toString() !== debtId
      );
      await client.save();

      const seller = await SellerSchema.findById(req.user.userId).select("firstname login").lean();
      await Notification.create({
        type: "system",
        severity: "warning",
        message: `${client.firstname} mijozidan ${Number(deletedDebt.amount || 0).toLocaleString("uz-UZ")} so'm qarz o'chirildi. Kerak bo'lsa shu xabardan qarzni qaytarish mumkin.`,
        relatedId: req.user.userId,
        relatedModel: "Seller",
        action: "restore_client_debt",
        actionStatus: "pending",
        metadata: {
          clientId: client._id,
          clientName: client.firstname,
          debt: deletedDebt,
          deletedBy: {
            sellerId: req.user.userId,
            name: seller?.firstname || seller?.login || "Admin",
          },
          deletedAt: new Date(),
        },
      });

      res.json(client);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/get-all", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const data = await ClientSchema.find().exec();

    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/debts", authenticateToken, async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const debtsPage = Math.max(parseInt(req.query.debtsPage, 10) || 1, 1);
    const paymentsPage = Math.max(parseInt(req.query.paymentsPage, 10) || 1, 1);
    const debtsLimit = Math.min(Math.max(parseInt(req.query.debtsLimit, 10) || 10, 1), 100);
    const paymentsLimit = Math.min(Math.max(parseInt(req.query.paymentsLimit, 10) || 10, 1), 100);

    const client = await ClientSchema.findById(clientId).lean();

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const sortedDebts = [...(client.debts || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    const sortedPayments = [...(client.paymentHistory || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const debtChartMap = new Map();
    sortedDebts.forEach((debt) => {
      const key = debt.date
        ? new Date(debt.date).toISOString().slice(0, 10)
        : "Noma'lum";
      const existing = debtChartMap.get(key) || { date: key, debt: 0, paid: 0 };
      existing.debt += Number(debt.amount || 0);
      debtChartMap.set(key, existing);
    });
    sortedPayments.forEach((payment) => {
      const key = payment.date
        ? new Date(payment.date).toISOString().slice(0, 10)
        : "Noma'lum";
      const existing = debtChartMap.get(key) || { date: key, debt: 0, paid: 0 };
      existing.paid += Number(payment.amount || 0);
      debtChartMap.set(key, existing);
    });

    const totalDebt = sortedDebts.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
    const totalPaid = sortedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const debtsSkip = (debtsPage - 1) * debtsLimit;
    const paymentsSkip = (paymentsPage - 1) * paymentsLimit;

    res.json({
      client: {
        _id: client._id,
        firstname: client.firstname,
        phone: client.phone,
        address: client.address,
      },
      debts: sortedDebts.slice(debtsSkip, debtsSkip + debtsLimit),
      payments: sortedPayments.slice(paymentsSkip, paymentsSkip + paymentsLimit),
      summary: {
        totalDebt,
        totalPaid,
        debtCount: sortedDebts.length,
        paymentCount: sortedPayments.length,
      },
      chartData: Array.from(debtChartMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-30),
      debtsPagination: {
        currentPage: debtsPage,
        totalPages: Math.max(Math.ceil(sortedDebts.length / debtsLimit), 1),
        totalCount: sortedDebts.length,
        limit: debtsLimit,
      },
      paymentsPagination: {
        currentPage: paymentsPage,
        totalPages: Math.max(Math.ceil(sortedPayments.length / paymentsLimit), 1),
        totalCount: sortedPayments.length,
        limit: paymentsLimit,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get client by id and their sales data
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const client = await ClientSchema.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const salesQuery = { clientId: String(client._id) };
    const profitExpression = {
      $ifNull: [
        "$profit",
        {
          $sum: {
            $map: {
              input: { $ifNull: ["$products", []] },
              as: "product",
              in: { $ifNull: ["$$product.profit", 0] },
            },
          },
        },
      ],
    };
    const revenueExpression = { $ifNull: ["$discountPrice", "$totalPrice"] };

    const [
      salesData,
      totalSales,
      summaryResult,
      chartResult,
      sellersResult,
    ] = await Promise.all([
      PaymentSchema.find(salesQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentSchema.countDocuments(salesQuery),
      PaymentSchema.aggregate([
        { $match: salesQuery },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: revenueExpression },
            totalPaid: {
              $sum: {
                $min: [
                  {
                    $add: [
                      { $ifNull: ["$cash", 0] },
                      { $ifNull: ["$terminal", 0] },
                      { $ifNull: ["$cashback", 0] },
                    ],
                  },
                  revenueExpression,
                ],
              },
            },
            totalDebtFromSales: { $sum: { $ifNull: ["$indebtedness", 0] } },
            totalDiscount: {
              $sum: {
                $max: [
                  {
                    $subtract: [
                      { $ifNull: ["$totalPrice", 0] },
                      revenueExpression,
                    ],
                  },
                  0,
                ],
              },
            },
            totalProfit: { $sum: profitExpression },
            salesCount: { $sum: 1 },
          },
        },
      ]),
      PaymentSchema.aggregate([
        { $match: salesQuery },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: revenueExpression },
            profit: { $sum: profitExpression },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PaymentSchema.aggregate([
        { $match: salesQuery },
        {
          $group: {
            _id: {
              sellerId: "$sellerId",
              sellerName: "$sellername",
            },
            count: { $sum: 1 },
            revenue: { $sum: revenueExpression },
            profit: { $sum: profitExpression },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    const productIds = [
      ...new Set(
        salesData
          .flatMap((sale) => sale.products || [])
          .map((product) => product.productId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map(String)
      ),
    ];

    const sellerIds = [
      ...new Set(
        salesData
          .map((sale) => sale.sellerId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map(String)
      ),
    ];

    const [products, sellers] = await Promise.all([
      productIds.length
        ? ProductSchema.find({ _id: { $in: productIds } })
            .select("name sellingprice unit category")
            .lean()
        : [],
      sellerIds.length
        ? SellerSchema.find({ _id: { $in: sellerIds } })
            .select("firstname login")
            .lean()
        : [],
    ]);

    const productMap = products.reduce((acc, product) => {
      acc[String(product._id)] = product;
      return acc;
    }, {});

    const sellerMap = sellers.reduce((acc, seller) => {
      acc[String(seller._id)] = seller;
      return acc;
    }, {});

    const enrichedSales = salesData.map((sale) => {
      const seller = sellerMap[String(sale.sellerId)] || {};

      return {
        ...sale,
        clientName: client.firstname,
        sellerName: seller.firstname || sale.sellername || "Noma'lum",
        sellerLogin: seller.login || sale.sellerlogin || "",
        products: (sale.products || []).map((product) => {
          const productInfo = productMap[String(product.productId)] || {};

          return {
            ...product,
            name: productInfo.name || product.productId || "Noma'lum mahsulot",
            sellingprice: productInfo.sellingprice || 0,
            unit: productInfo.unit || product.unit || "Dona",
            category: product.category || productInfo.category || "",
          };
        }),
      };
    });

    const currentDebt = (client.debts || []).reduce(
      (sum, debt) => sum + Number(debt.amount || 0),
      0
    );
    const summary = summaryResult[0] || {};
    const chartData = chartResult.map((item) => ({
      date: item._id,
      revenue: item.revenue || 0,
      profit: item.profit || 0,
      count: item.count || 0,
    }));
    const sellerStats = sellersResult.map((item) => ({
      sellerId: item._id?.sellerId || "",
      name: item._id?.sellerName || "Noma'lum",
      count: item.count || 0,
      revenue: item.revenue || 0,
      profit: item.profit || 0,
    }));

    const responseData = {
      client: client.toObject(),
      sales: enrichedSales,
      summary: {
        totalRevenue: summary.totalRevenue || 0,
        totalPaid: summary.totalPaid || 0,
        totalDebtFromSales: summary.totalDebtFromSales || 0,
        totalDiscount: summary.totalDiscount || 0,
        totalProfit: summary.totalProfit || 0,
        currentDebt,
        activeDays: chartData.length,
        salesCount: summary.salesCount || 0,
      },
      chartData: chartData.slice(-14),
      sellers: sellerStats,
      salesPagination: {
        currentPage: page,
        totalPages: Math.max(Math.ceil(totalSales / limit), 1),
        totalCount: totalSales,
        limit,
        hasNextPage: page < Math.ceil(totalSales / limit),
        hasPrevPage: page > 1,
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new client with referral bonus
router.route("/create").post(authenticateToken, async (req, res, next) => {
  try {
    const { getReferal, phone, ...clientData } = req.body;

    // Telefon raqami allaqachon mavjudligini tekshirish
    const existingClient = await ClientSchema.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        error:
          "Telefon raqami allaqachon mavjud. Iltimos, boshqa raqam kiriting.",
      });
    }

    // Yangi mijoz uchun avtomatik referal kod generatsiya qilish
    clientData.referralCode = uuidv4().slice(0, 8); // 8 ta belgili noyob kod

    // Bonus, totalSpent, discountRate va purchases ni default qiymatlar bilan to'ldirish
    clientData.bonus = 0;
    clientData.totalSpent = 0;
    clientData.discountRate = 0;
    clientData.purchases = [];

    // Parolni shifrlash
    if (clientData.password) {
      const salt = await bcrypt.genSalt(10);
      clientData.password = await bcrypt.hash(clientData.password, salt);
    }

    // Agar getReferal kiritilgan bo'lsa, referalni tekshirish va bonus qo'shish
    if (getReferal) {
      const referrer = await ClientSchema.findOne({ referralCode: getReferal });

      if (referrer) {
        // Referalni kiritgan mijozga 5000 bonus qo'shish
        referrer.bonus += 5000;
        await referrer.save();
      }
    }

    // Yangi mijozni yaratish
    const data = await ClientSchema.create({ phone, ...clientData });

    // Trigger notification
    await Notification.create({
        type: "new_client",
        message: `Yangi mijoz qo'shildi: ${data.firstname} (${data.phone})`,
        relatedId: data._id,
        relatedModel: 'Client'
    });

    res.json(data);
  } catch (error) {
    next(error); // Boshqa xatoliklar uchun
  }
});

// Update client by id
router.route("/update/:id").put(authenticateToken, async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Parol yangilanayotgan bo'lsa, uni shifrlash
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const data = await ClientSchema.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });
    console.log("Client updated successfully!");
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete client by id
router
  .route("/delete/:id")
  .delete(authenticateToken, async (req, res, next) => {
    try {
      const data = await ClientSchema.findByIdAndDelete(req.params.id);
      if (data) {
        res.status(200).json({
          msg: "Client deleted successfully",
        });
      } else {
        res.status(404).json({
          msg: "Client not found",
        });
      }
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
