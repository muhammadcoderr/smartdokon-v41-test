const mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();

// Models and Factory
const { DebtsSchema } = require("../../shared/database/models/Debts");
const { getModel } = require("../../shared/helpers/modelFactory");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireRoles = require("../../shared/middlewares/requireRoles");

/**
 * Multi-DB Model Factory for Debts
 */
const getDebtsModel = (req) => {
  const connection = req.db || mongoose.connection;
  return getModel(connection, "Debts", DebtsSchema);
};

// Get all debts (Scoped to Tenant DB)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { clientId, clientName } = req.query;
    const Debts = getDebtsModel(req);
    let query = {};
    
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      // Agar clientName ham kelgan bo'lsa aniqroq qidiramiz
      if (clientName) {
        query.$or = [{ clientname: clientName }, { clientId: clientId }];
      } else {
        query.clientId = clientId;
      }
    } else if (clientName) {
      query.clientname = { $regex: clientName, $options: "i" };
    }

    const data = await Debts.find(query).sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get single debt (Scoped to Tenant DB)
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const Debts = getDebtsModel(req);
    const debt = await Debts.findById(req.params.id);
    if (!debt) return res.status(404).json({ error: 'Debt not found' });
    res.json(debt);
  } catch (error) {
    next(error);
  }
});

// Create debt (Scoped to Tenant DB)
router.route("/create").post(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const Debts = getDebtsModel(req);
    const data = await Debts.create({ ...req.body, branchId: req.user.branchId });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Update debt (Scoped to Tenant DB)
router.route("/update/:id").put(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const Debts = getDebtsModel(req);
    const data = await Debts.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!data) return res.status(404).json({ error: "Debt not found" });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete debt (Scoped to Tenant DB)
router.route("/delete/:id").delete(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const Debts = getDebtsModel(req);
    const data = await Debts.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ msg: "Debt not found" });
    res.status(200).json({ msg: "Debt deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
