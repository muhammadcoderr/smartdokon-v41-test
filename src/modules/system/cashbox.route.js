const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Models and Factory
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const { HandoverSchema } = require("../../shared/database/models/Handover");
const { getModel } = require("../../shared/helpers/modelFactory");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireRoles = require("../../shared/middlewares/requireRoles");
const User = require("../../shared/database/models/User");

/**
 * Multi-DB Model Factories
 */
const getCashboxModel = (req) => getModel(req.db || mongoose.connection, "Cashbox", CashboxSchema);
const getHandoverModel = (req) => getModel(req.db || mongoose.connection, "Handover", HandoverSchema);

// 🔹 Kassa holatini olish (Scoped to Tenant DB)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const branchId = req.user.branchId;
    if (!branchId) return res.status(400).json({ message: "Siz birorta ham filialga biriktirilmagansiz" });

    const Cashbox = getCashboxModel(req);
    let cashbox = await Cashbox.findOne();
    
    if (!cashbox) {
      cashbox = await Cashbox.create({ 
        branchId, 
        cashBalance: 0, 
        cardBalance: 0, 
        bankBalance: 0, 
        transactions: [] 
      });
    }
    res.status(200).json({
      cashBalance: cashbox.cashBalance,
      cardBalance: cashbox.cardBalance,
      bankBalance: cashbox.bankBalance,
      transactions: cashbox.transactions,
      userRole: req.user.role,
      userId: req.user.userId,
    });
  } catch (error) {
    next(error);
  }
});

// 🔹 Kassaga pul qo‘shish (Scoped to Tenant DB)
router.post("/deposit", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const { amount, paymentMethod, description } = req.body;
    const Cashbox = getCashboxModel(req);

    if (!amount || amount <= 0) return res.status(400).json({ message: "Noto‘g‘ri summa" });

    let cashbox = await Cashbox.findOne();
    if (!cashbox) cashbox = await Cashbox.create({ branchId: req.user.branchId, cashBalance: 0, cardBalance: 0, bankBalance: 0, transactions: [] });

    if (paymentMethod === "cash") cashbox.cashBalance += amount;
    else if (paymentMethod === "card") cashbox.cardBalance += amount;
    else if (paymentMethod === "bank") cashbox.bankBalance += amount;

    cashbox.transactions.push({ type: "income", amount, paymentMethod, description });
    await cashbox.save();
    res.status(200).json({ message: "Kassaga pul qo‘shildi", cashbox });
  } catch (error) {
    next(error);
  }
});

// 🔹 Kassadan pul sarflash (Scoped to Tenant DB)
router.post("/expense", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const { amount, paymentMethod, description } = req.body;
    const Cashbox = getCashboxModel(req);

    let cashbox = await Cashbox.findOne();
    if (!cashbox) return res.status(400).json({ message: "Kassa mavjud emas" });

    if (paymentMethod === "cash" && cashbox.cashBalance < amount) return res.status(400).json({ message: "Naqd pul yetarli emas" });
    if (paymentMethod === "card" && cashbox.cardBalance < amount) return res.status(400).json({ message: "Karta yetarli emas" });
    if (paymentMethod === "bank" && cashbox.bankBalance < amount) return res.status(400).json({ message: "Bank yetarli emas" });

    if (paymentMethod === "cash") cashbox.cashBalance -= amount;
    else if (paymentMethod === "card") cashbox.cardBalance -= amount;
    else if (paymentMethod === "bank") cashbox.bankBalance -= amount;

    cashbox.transactions.push({ type: "expense", amount, paymentMethod, description });
    await cashbox.save();
    res.status(200).json({ message: "Pul sarflandi", cashbox });
  } catch (error) {
    next(error);
  }
});

// 🔹 Tranzaksiyani tahrirlash (Scoped to Tenant DB)
router.put("/edit", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const { transactionId, newAmount, editReason } = req.body;
    if (!editReason || editReason.trim().length < 5) {
      return res.status(400).json({ message: "Tahrirlash sababi kamida 5 ta belgidan iborat bo'lishi kerak" });
    }

    const Cashbox = getCashboxModel(req);
    let cashbox = await Cashbox.findOne();
    if (!cashbox) return res.status(404).json({ message: "Kassa topilmadi" });

    const idx = cashbox.transactions.findIndex(t => t._id.toString() === transactionId);
    if (idx === -1) return res.status(404).json({ message: "Tranzaksiya topilmadi" });

    const t = cashbox.transactions[idx];
    const oldAmount = t.amount;
    const diff = newAmount - oldAmount;

    // Balansni sozlash mantiqi
    // Agar income bo'lsa: balance += diff (agar newAmount > oldAmount bo'lsa, balans oshadi)
    // Agar expense bo'lsa: balance -= diff (agar newAmount > oldAmount bo'lsa, balans kamayadi)
    let balanceAdjustment = t.type === "income" ? diff : -diff;

    // Tekshiruv: Balans manfiyga tushib ketmasligi kerak (ixtiyoriy, lekin foydali)
    if (t.paymentMethod === "cash" && (cashbox.cashBalance + balanceAdjustment) < 0) return res.status(400).json({ message: "Kassada yetarli naqd pul yo'q" });
    if (t.paymentMethod === "card" && (cashbox.cardBalance + balanceAdjustment) < 0) return res.status(400).json({ message: "Kassada yetarli karta mablag'i yo'q" });
    if (t.paymentMethod === "bank" && (cashbox.bankBalance + balanceAdjustment) < 0) return res.status(400).json({ message: "Bank hisobida yetarli mablag' yo'q" });

    if (t.paymentMethod === "cash") cashbox.cashBalance += balanceAdjustment;
    else if (t.paymentMethod === "card") cashbox.cardBalance += balanceAdjustment;
    else if (t.paymentMethod === "bank") cashbox.bankBalance += balanceAdjustment;

    // Tranzaksiyani yangilash
    t.isEdited = true;
    t.previousAmount = oldAmount;
    t.amount = newAmount;
    t.editReason = editReason;
    t.editedBy = req.user.firstname || req.user.login;

    await cashbox.save();
    res.status(200).json({ message: "Muvaffaqiyatli tahrirlandi", cashbox });
  } catch (error) {
    next(error);
  }
});

// 🔹 Handover History (Scoped to Tenant DB)
router.get("/handovers", authenticateToken, async (req, res, next) => {
  try {
    const Handover = getHandoverModel(req);
    const userId = req.user.userId;
    let query = {};
    if (req.user.role === 'admin') {
      query = { $or: [{ supervisorId: userId }, { employeeId: userId }] };
    } else {
      query = { employeeId: userId };
    }
    const handovers = await Handover.find(query)
      .populate({ path: 'employeeId', model: User, select: 'firstname phone' })
      .populate({ path: 'supervisorId', model: User, select: 'firstname phone' })
      .sort({ date: -1 });
    res.status(200).json(handovers);
  } catch (error) {
    next(error);
  }
});

// 🔹 Create Handover (Scoped to Tenant DB)
router.post("/handover", authenticateToken, async (req, res, next) => {
  try {
    const { amount, paymentMethod, supervisorId, description } = req.body;
    const Cashbox = getCashboxModel(req);
    const Handover = getHandoverModel(req);
    let cashbox = await Cashbox.findOne();
    if (!cashbox) return res.status(400).json({ message: "Kassa mavjud emas" });
    if (paymentMethod === "cash" && cashbox.cashBalance < amount) return res.status(400).json({ message: "Naqd pul yetarli emas" });
    
    const handover = await Handover.create({
      employeeId: req.user.userId,
      supervisorId,
      amount,
      paymentMethod,
      description,
      branchId: req.user.branchId,
      status: 'pending'
    });
    res.status(200).json({ message: "So'rov yuborildi", handover });
  } catch (error) {
    next(error);
  }
});

// 🔹 Accept Handover (Scoped to Tenant DB)
router.post("/accept-handover", authenticateToken, requireRoles("admin"), async (req, res, next) => {
  try {
    const { handoverId } = req.body;
    const Handover = getHandoverModel(req);
    const Cashbox = getCashboxModel(req);
    const handover = await Handover.findById(handoverId);
    if (!handover || handover.supervisorId.toString() !== req.user.userId) return res.status(403).json({ message: "Ruxsat yo'q" });

    let cashbox = await Cashbox.findOne();
    if (handover.paymentMethod === "cash") cashbox.cashBalance -= handover.amount;
    else if (handover.paymentMethod === "card") cashbox.cardBalance -= handover.amount;
    else if (handover.paymentMethod === "bank") cashbox.bankBalance -= handover.amount;

    cashbox.transactions.push({ type: "expense", amount: handover.amount, paymentMethod: handover.paymentMethod, description: `Xodimdan qabul: ${handover.description}` });
    await cashbox.save();
    handover.status = 'completed';
    handover.transactionId = cashbox.transactions[cashbox.transactions.length - 1]._id;
    await handover.save();
    res.status(200).json({ message: "Qabul qilindi", handover });
  } catch (error) {
    next(error);
  }
});

// 🔹 Get supervisors list
router.get("/supervisors", authenticateToken, async (req, res, next) => {
  try {
    const supervisors = await User.find({ type: 'admin', branchId: req.user.branchId }).select('_id firstname phone').sort({ firstname: 1 });
    res.status(200).json(supervisors);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
