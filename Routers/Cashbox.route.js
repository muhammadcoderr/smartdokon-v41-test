const express = require("express");
const router = express.Router();
const Cashbox = require("../Models/Cashbox");
const authenticateToken = require("../middleware/authenticateToken");
const requireRoles = require("../middleware/requireRoles");
const SellerSchema = require("../Models/Seller");
const ClientSchema = require("../Models/Client");
const Handover = require("../Models/Handover");

// 🔹 Kassa holatini olish (naqd, karta, bank miqdorini ko‘rish)
router.get("/",authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.sellerId;
    
    // Get user information to determine role
    const user = await SellerSchema.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      cashbox = await Cashbox.create({ cashBalance: 0, cardBalance: 0, bankBalance: 0, transactions: [] });
    }
    res.status(200).json({
      cashBalance: cashbox.cashBalance,
      cardBalance: cashbox.cardBalance,
      bankBalance: cashbox.bankBalance,
      transactions: cashbox.transactions,
      userRole: user.type,
      userId: user._id,
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// 🔹 Kassaga pul qo‘shish (depozit)
router.post("/deposit",authenticateToken, requireRoles("admin"), async (req, res) => {
  try {
    const { amount, paymentMethod, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri summa" });
    }
    if (!["cash", "card", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ message: "To‘lov usuli noto‘g‘ri" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      cashbox = await Cashbox.create({ cashBalance: 0, cardBalance: 0, bankBalance: 0, transactions: [] });
    }

    if (paymentMethod === "cash") {
      cashbox.cashBalance += amount;
    } else if (paymentMethod === "card") {
      cashbox.cardBalance += amount;
    } else if (paymentMethod === "bank") {
      cashbox.bankBalance += amount;
    }

    cashbox.transactions.push({
      type: "income",
      amount,
      paymentMethod,
      description,
    });

    await cashbox.save();
    res.status(200).json({ message: "Kassaga pul qo‘shildi", cashbox });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// 🔹 Kassadan pul sarflash (rasxod)
router.post("/expense",authenticateToken, requireRoles("admin"), async (req, res) => {
  try {
    const { amount, paymentMethod, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri summa" });
    }
    if (!["cash", "card", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ message: "To‘lov usuli noto‘g‘ri" });
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
      description,
    });

    await cashbox.save();
    res.status(200).json({ message: "Pul sarflandi", cashbox });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

//  Tranzaksiyani qaytarish
router.post("/return",authenticateToken, requireRoles("admin"), async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ message: "Tranzaksiya ID si ko'rsatilmagan" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      return res.status(404).json({ message: "Kassa topilmadi" });
    }

    const transactionIndex = cashbox.transactions.findIndex(
      (transaction) => transaction._id.toString() === transactionId
    );

    if (transactionIndex === -1) {
      return res.status(404).json({ message: "Tranzaksiya topilmadi" });
    }

    const transaction = cashbox.transactions[transactionIndex];
    let returnAmount = transaction.amount;

    if (transaction.type === "income") {
      returnAmount = -returnAmount;
    }

    if (transaction.paymentMethod === "cash") {
      cashbox.cashBalance += returnAmount;
    } else if (transaction.paymentMethod === "card") {
      cashbox.cardBalance += returnAmount;
    } else if (transaction.paymentMethod === "bank") {
      cashbox.bankBalance += returnAmount;
    }

    cashbox.transactions.splice(transactionIndex, 1);

    await cashbox.save();
    res.status(200).json({ message: "Tranzaksiya qaytarildi", cashbox });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});


// 🔹 Get supervisors list
router.get("/supervisors", authenticateToken, async (req, res) => {
  try {
    const supervisors = await SellerSchema.find({ type: 'admin' })
      .select('_id firstname phone')
      .sort({ name: 1 });
    
    res.status(200).json(supervisors);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// 🔹 Get handover history
router.get("/handovers", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.sellerId;
    
    if (!userId) {
      return res.status(401).json({ message: "Foydalanuvchi aniqlanmadi" });
    }

    const user = await SellerSchema.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }
    
    let handovers;
    if (user.type === 'admin') {
      // For admin - show handovers where they are either supervisor OR employee
      handovers = await Handover.find({
        $or: [
          { supervisorId: userId },
          { employeeId: userId }
        ]
      })
      .populate('employeeId', 'firstname phone')
      .populate('supervisorId', 'firstname phone')
      .sort({ date: -1 });
    } else {
      // For regular employees - only show their own handovers
      handovers = await Handover.find({ employeeId: userId })
        .populate('supervisorId', 'firstname phone')
        .sort({ date: -1 });
    }
    
    res.status(200).json(handovers);
  } catch (error) {
    console.error("Handover history error:", error);
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// 🔹 Supervisorga pul topshirish (handover)
router.post("/handover", authenticateToken, async (req, res) => {
  try {
    const { amount, paymentMethod, supervisorId, description } = req.body;
    const employeeId = req.user.userId || req.user.sellerId;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Noto'g'ri summa" });
    }
    if (!["cash", "card", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ message: "To'lov usuli noto'g'ri" });
    }
    if (!supervisorId) {
      return res.status(400).json({ message: "Supervisor ID ko'rsatilmagan" });
    }

    const supervisor = await SellerSchema.findById(supervisorId);
    if (!supervisor || supervisor.type !== 'admin') {
      return res.status(400).json({ message: "Supervisor topilmadi yoki admin emas" });
    }

    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      cashbox = new Cashbox({
        cashBalance: 0,
        cardBalance: 0,
        bankBalance: 0,
        transactions: []
      });
    }

    if (paymentMethod === "cash" && cashbox.cashBalance < amount) {
      return res.status(400).json({ message: "Naqd pul yetarli emas" });
    } else if (paymentMethod === "card" && cashbox.cardBalance < amount) {
      return res.status(400).json({ message: "Karta hisobida yetarli mablag' yo'q" });
    } else if (paymentMethod === "bank" && cashbox.bankBalance < amount) {
      return res.status(400).json({ message: "Bank hisobida yetarli mablag' yo'q" });
    }

    // Create handover record with 'pending' status
    const handover = new Handover({
      employeeId,
      supervisorId,
      amount,
      paymentMethod,
      description,
      status: 'pending', 
      date: new Date()
    });

    await handover.save();

    res.status(200).json({ 
      message: "Topshirish so'rovi yuborildi, supervisor qabul qilishini kuting",
      handover
    });

  } catch (error) {
    console.error("Handover error:", error);
    res.status(500).json({ 
      message: "Server xatosi", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


// Add this route to handle accepting handover money
router.post("/accept-handover", authenticateToken, requireRoles("admin"), async (req, res) => {
  try {
    const { handoverId } = req.body;
    const supervisorId = req.user.userId || req.user.sellerId;
    
    if (!handoverId) {
      return res.status(400).json({ message: "Handover ID ko'rsatilmagan" });
    }

    const handover = await Handover.findById(handoverId);
    if (!handover) {
      return res.status(404).json({ message: "Topshirish topilmadi" });
    }

    if (handover.supervisorId.toString() !== supervisorId) {
      return res.status(403).json({ message: "Bu topshirishni qabul qilish huquqingiz yo'q" });
    }

    if (handover.status === 'completed') {
      return res.status(400).json({ message: "Bu topshirish allaqachon qabul qilingan" });
    }

    // Get cashbox
    let cashbox = await Cashbox.findOne();
    if (!cashbox) {
      cashbox = new Cashbox({
        cashBalance: 0,
        cardBalance: 0,
        bankBalance: 0,
        transactions: []
      });
    }

    // Add money to cashbox
    if (handover.paymentMethod === "cash") {
      cashbox.cashBalance -= handover.amount;
    } else if (handover.paymentMethod === "card") {
      cashbox.cardBalance -= handover.amount;
    } else if (handover.paymentMethod === "bank") {
      cashbox.bankBalance -= handover.amount;
    }

    // Add transaction record
    const newTransaction = {
      type: "expense",
      amount: handover.amount,
      paymentMethod: handover.paymentMethod,
      description: `Xodimdan qabul qilindi: ${handover.description}`,
      date: new Date()
    };

    cashbox.transactions.push(newTransaction);
    await cashbox.save();

    // Get the transaction ID from the newly created transaction
    const transactionId = cashbox.transactions[cashbox.transactions.length - 1]._id;

    // Update handover status and assign transactionId
    handover.status = 'completed';
    handover.transactionId = transactionId;
    await handover.save();

    res.status(200).json({ 
      message: "Pul muvaffaqiyatli qabul qilindi",
      handover,
      newBalance: {
        cash: cashbox.cashBalance,
        card: cashbox.cardBalance,
        bank: cashbox.bankBalance
      }
    });

  } catch (error) {
    console.error("Accept handover error:", error);
    res.status(500).json({ 
      message: "Server xatosi", 
      error: error.message
    });
  }
});


module.exports = router;
