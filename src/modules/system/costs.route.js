const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const { getAggregatedCosts } = require("../../shared/controllers/analyticsController");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireRoles = require("../../shared/middlewares/requireRoles");
const {Costs: botNotify} = require('../../bot/Costs');
const { getModel } = require("../../shared/helpers/modelFactory");
const { CostsSchema } = require("../../shared/database/models/Costs");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const Notification = require("../../shared/database/models/Notification");

// GET aggregated costs for Monitoring
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const result = await getAggregatedCosts(req.user, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Create cost (Localized to single DB)
router.route("/create").post(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { amount, paymentMethod, description, userName } = req.body;
    const branchId = req.user.branchId;
    if (!branchId) return res.status(400).json({ message: "Siz filialga biriktirilmagansiz" });

    const CostsModel = getModel(req.db || mongoose.connection, "Costs", CostsSchema);
    const CashboxModel = getModel(req.db || mongoose.connection, "Cashbox", CashboxSchema);

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ message: "Summa xato" });

    let cashbox = await CashboxModel.findOne();
    if (!cashbox) return res.status(400).json({ message: "Kassa yo'q" });

    if (paymentMethod === "cash") cashbox.cashBalance -= amount;
    else if (paymentMethod === "card") cashbox.cardBalance -= amount;
    else if (paymentMethod === "bank") cashbox.bankBalance -= amount;

    cashbox.transactions.push({ 
      type: "expense", 
      amount, 
      paymentMethod, 
      description: `Xarajat: ${description}`,
      date: new Date()
    });
    await cashbox.save();

    const newExpense = await CostsModel.create({ amount, paymentMethod, description, userName, branchId });
    res.status(201).json(newExpense);
    botNotify(newExpense);
  } catch (error) { next(error); }
});

// Update cost and adjust cashbox
router.put("/update/:id", authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { amount: newAmount, paymentMethod: newMethod, description: newDesc, userName } = req.body;
    const branchId = req.user.branchId;
    if (!branchId) return res.status(400).json({ message: "Siz filialga biriktirilmagansiz" });

    const dbConnection = req.db || mongoose.connection;
    const CostsModel = getModel(dbConnection, "Costs", CostsSchema);
    const CashboxModel = getModel(dbConnection, "Cashbox", CashboxSchema);

    const cost = await CostsModel.findOne({ _id: req.params.id, branchId });
    if (!cost) return res.status(404).json({ message: "Xarajat topilmadi" });

    if (!Number.isFinite(Number(newAmount)) || Number(newAmount) <= 0) return res.status(400).json({ message: "Yangi summa xato" });

    // 1. Adjust cashbox
    let cashbox = await CashboxModel.findOne();
    if (cashbox) {
      if (cost.paymentMethod === newMethod) {
        const diff = cost.amount - newAmount;
        if (diff > 0) {
          // Re-income the difference (e.g. 10k -> 1k = 9k re-income)
          if (newMethod === "cash") cashbox.cashBalance += diff;
          else if (newMethod === "card") cashbox.cardBalance += diff;
          else if (newMethod === "bank") cashbox.bankBalance += diff;

          cashbox.transactions.push({
            type: "income",
            amount: diff,
            paymentMethod: newMethod,
            description: `Xarajat tahrirlandi (${formatCurrency(diff)} qaytarildi): ${newDesc}`,
            date: new Date()
          });
        } else if (diff < 0) {
          // Extra expense (e.g. 1k -> 10k = 9k extra expense)
          const absDiff = Math.abs(diff);
          if (newMethod === "cash") cashbox.cashBalance -= absDiff;
          else if (newMethod === "card") cashbox.cardBalance -= absDiff;
          else if (newMethod === "bank") cashbox.bankBalance -= absDiff;

          cashbox.transactions.push({
            type: "expense",
            amount: absDiff,
            paymentMethod: newMethod,
            description: `Xarajat tahrirlandi (qo'shimcha ${formatCurrency(absDiff)} chiqim): ${newDesc}`,
            date: new Date()
          });
        }
      } else {
        // Method changed: Revert old, Deduct new
        if (cost.paymentMethod === "cash") cashbox.cashBalance += cost.amount;
        else if (cost.paymentMethod === "card") cashbox.cardBalance += cost.amount;
        else if (cost.paymentMethod === "bank") cashbox.bankBalance += cost.amount;

        cashbox.transactions.push({
          type: "income",
          amount: cost.amount,
          paymentMethod: cost.paymentMethod,
          description: `Xarajat usuli o'zgardi (Eski summa qaytarildi): ${cost.description}`,
          date: new Date()
        });

        if (newMethod === "cash") cashbox.cashBalance -= newAmount;
        else if (newMethod === "card") cashbox.cardBalance -= newAmount;
        else if (newMethod === "bank") cashbox.bankBalance -= newAmount;

        cashbox.transactions.push({
          type: "expense",
          amount: newAmount,
          paymentMethod: newMethod,
          description: `Xarajat usuli o'zgardi (Yangi usulda yechildi): ${newDesc}`,
          date: new Date()
        });
      }
      await cashbox.save();
    }

    // 2. Create notification
    await Notification.create({
      type: "system",
      severity: "info",
      message: `Xarajat tahrirlandi. Foydalanuvchi: ${userName}. Yangi miqdor: ${formatCurrency(newAmount)}`,
      relatedId: req.user.userId,
      relatedModel: "User",
      branchId: branchId,
      metadata: {
        costId: cost._id,
        oldAmount: cost.amount,
        newAmount: newAmount,
        updatedBy: req.user.firstname || req.user.login
      }
    });

    // 3. Update the record
    const updatedCost = await CostsModel.findByIdAndUpdate(
      cost._id,
      { amount: newAmount, paymentMethod: newMethod, description: newDesc, userName },
      { new: true }
    );

    res.status(200).json(updatedCost);
  } catch (error) {
    next(error);
  }
});

// Delete cost and revert cashbox
router.delete("/delete/:id", authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const branchId = req.user.branchId;
    if (!branchId) return res.status(400).json({ message: "Siz filialga biriktirilmagansiz" });

    const dbConnection = req.db || mongoose.connection;
    const CostsModel = getModel(dbConnection, "Costs", CostsSchema);
    const CashboxModel = getModel(dbConnection, "Cashbox", CashboxSchema);

    const cost = await CostsModel.findOne({ _id: req.params.id, branchId });
    if (!cost) return res.status(404).json({ message: "Xarajat topilmadi" });

    // 1. Revert money to cashbox
    let cashbox = await CashboxModel.findOne();
    if (cashbox) {
      if (cost.paymentMethod === "cash") cashbox.cashBalance += cost.amount;
      else if (cost.paymentMethod === "card") cashbox.cardBalance += cost.amount;
      else if (cost.paymentMethod === "bank") cashbox.bankBalance += cost.amount;

      // 2. Add reversal record to history
      cashbox.transactions.push({
        type: "income",
        amount: cost.amount,
        paymentMethod: cost.paymentMethod,
        description: `Xarajat bekor qilindi: ${cost.description}`,
        date: new Date()
      });
      await cashbox.save();
    }

    // 3. Create notification
    await Notification.create({
      type: "system",
      severity: "info",
      message: `Xarajat bekor qilindi (${formatCurrency(cost.amount)}). Sabab: ${cost.description}`,
      relatedId: req.user.userId,
      relatedModel: "User",
      branchId: branchId,
      metadata: {
        costId: cost._id,
        amount: cost.amount,
        description: cost.description,
        deletedBy: req.user.firstname || req.user.login
      }
    });

    // 4. Delete the record
    await CostsModel.findByIdAndDelete(cost._id);

    res.status(200).json({ message: "Xarajat o'chirildi va mablag' qaytarildi" });
  } catch (error) {
    next(error);
  }
});

function formatCurrency(amount) {
  return new Intl.NumberFormat("uz-UZ").format(amount) + " so'm";
}

module.exports = router;
