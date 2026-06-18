let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
let Cashbox = require('../Models/Cashbox')
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");
const requireRoles = require("../middleware/requireRoles");

// post Model
let CostsSchema = require("../Models/Costs");
let {Costs} = require('../Bot/Costs')
router.get("/get-all", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const data = await CostsSchema.find().exec();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/",authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, startDate, endDate } = req.query;
    let query = search ? { sellername: { $regex: search, $options: 'i' } } : {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: start };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $lte: end };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };

    const result = await CostsSchema.paginate(query, options);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCosts = await CostsSchema.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    res.json({
      data: result.docs,
      todayCosts: todayCosts.length > 0 ? todayCosts[0].totalAmount : 0,
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  } catch (error) {
    next(error);
  }
});
router.route("/create").post(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { amount, paymentMethod, description, sellername } = req.body;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Noto'g'ri summa" });
    }
    if (!["cash", "card", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ message: "To'lov usuli noto'g'ri" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(400).json({ message: "Kassa mavjud emas" });
    }

    if (paymentMethod === "cash" && cashbox.cashBalance < amount) {
      return res.status(400).json({ message: "Naqd pul yetarli emas" });
    } else if (paymentMethod === "card" && cashbox.cardBalance < amount) {
      return res.status(400).json({ message: "Karta hisobida yetarli mablag‘ yo‘q" });
    } else if (paymentMethod === "bank" && cashbox.bankBalance < amount) {
      return res.status(400).json({ message: "Bank hisobida yetarli mablag‘ yo‘q" });
    }

    if (paymentMethod === "cash") {
      cashbox.cashBalance -= amount;
    } else if (paymentMethod === "card") {
      cashbox.cardBalance -= amount;
    } else if (paymentMethod === "bank") {
      cashbox.bankBalance -= amount;
    }

    cashbox.transactions.push({
      type: "expense",
      amount,
      paymentMethod,
      description: `Xarajat: ${description} (Sotuvchi: ${sellername})`,
    });

    await cashbox.save();

    // Xarajatni qo'shish
    const newExpense = await CostsSchema.create({ amount, paymentMethod, description, sellername });

    res.status(201).json(newExpense);
    Costs(newExpense);
  } catch (error) {
    next(error);
  }
});





// Update post
router.route("/update/:id").put(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { amount, paymentMethod } = req.body; // Yangi qiymatlar
    const costId = req.params.id;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Noto'g'ri summa" });
    }
    if (!["cash", "card", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ message: "To'lov usuli noto'g'ri" });
    }

    // Eski xarajatni topamiz
    const oldCost = await CostsSchema.findById(costId);
    if (!oldCost) {
      return res.status(404).json({ message: "Xarajat topilmadi" });
    }

    // Kassani topamiz
    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(400).json({ message: "Kassa mavjud emas" });
    }

    // 1️⃣ Eski xarajatni kassadan olib tashlash
    if (oldCost.paymentMethod === "cash") {
      cashbox.cashBalance += oldCost.amount;
    } else if (oldCost.paymentMethod === "card") {
      cashbox.cardBalance += oldCost.amount;
    } else if (oldCost.paymentMethod === "bank") {
      cashbox.bankBalance += oldCost.amount;
    }

    // 2️⃣ Yangi xarajat uchun balansni tekshirish
    if (paymentMethod === "cash" && cashbox.cashBalance < amount) {
      return res.status(400).json({ message: "Naqd pul yetarli emas" });
    } else if (paymentMethod === "card" && cashbox.cardBalance < amount) {
      return res.status(400).json({ message: "Karta hisobida yetarli mablag‘ yo‘q" });
    } else if (paymentMethod === "bank" && cashbox.bankBalance < amount) {
      return res.status(400).json({ message: "Bank hisobida yetarli mablag‘ yo‘q" });
    }

    // 3️⃣ Yangi xarajat bo‘yicha kassani yangilash
    if (paymentMethod === "cash") {
      cashbox.cashBalance -= amount;
    } else if (paymentMethod === "card") {
      cashbox.cardBalance -= amount;
    } else if (paymentMethod === "bank") {
      cashbox.bankBalance -= amount;
    }

    // Xarajatni yangilash
    const updatedCost = await CostsSchema.findByIdAndUpdate(costId, req.body, { new: true });

    // Kassa tranzaktsiyalarini yangilash
    cashbox.transactions.push({
      type: "expense",
      amount,
      paymentMethod,
      description: req.body.description || oldCost.description, // Agar tavsif o‘zgarmasa, eski qiymatni saqlaymiz
    });

    // O‘zgarishlarni saqlash
    await cashbox.save();
    
    console.log("Xarajat va kassa yangilandi!");
    res.json(updatedCost);
  } catch (error) {
    next(error);
  }
});


// Delete post
router.route("/delete/:id").delete(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const expense = await CostsSchema.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ msg: "Xarajat topilmadi" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(400).json({ message: "Kassa mavjud emas" });
    }

    // Xarajatni o‘chirishdan oldin kassaga qaytarish
    if (expense.paymentMethod === "cash") {
      cashbox.cashBalance += expense.amount;
    } else if (expense.paymentMethod === "card") {
      cashbox.cardBalance += expense.amount;
    } else if (expense.paymentMethod === "bank") {
      cashbox.bankBalance += expense.amount;
    }

    cashbox.transactions.push({
      type: "income",
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      description: `Bekor qilingan xarajat: ${expense.description}`,
    });

    await cashbox.save();
    await CostsSchema.findByIdAndDelete(req.params.id);

    res.status(200).json({ msg: "Xarajat o‘chirildi va pul kassaga qaytarildi" });
  } catch (error) {
    next(error);
  }
});



module.exports = router;
