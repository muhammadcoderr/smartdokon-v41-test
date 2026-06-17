const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { InventorySchema } = require("../../shared/database/models/Inventory");
const ProductSchema = require("../../shared/database/models/Product"); // Global Catalog (Main DB)
const { CostsSchema } = require("../../shared/database/models/Costs");
const { StockSchema } = require("../../shared/database/models/Stock");
const { getModel } = require("../../shared/helpers/modelFactory");
const authenticateToken = require("../../shared/middlewares/authenticateToken");

/**
 * Multi-DB Model Factories
 */
const getInventoryModel = (req) => getModel(req.db || mongoose.connection, "Inventory", InventorySchema);
const getCostsModel = (req) => getModel(req.db || mongoose.connection, "Costs", CostsSchema);
const getStockModel = (req) => getModel(req.db || mongoose.connection, "Stock", StockSchema);

// Get all inventory sessions with pagination (Scoped to Tenant DB)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const Inventory = getInventoryModel(req);
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    };

    const data = await Inventory.paginate({}, options);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

// Get a single inventory session (Scoped to Tenant DB)
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const Inventory = getInventoryModel(req);
    const data = await Inventory.findById(req.params.id);
    if (!data) return res.status(404).json({ msg: "Inventarizatsiya topilmadi" });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

// Create a new inventory session (Scoped to Tenant DB)
router.post("/create", authenticateToken, async (req, res, next) => {
  try {
    const { notes, items } = req.body;
    const Inventory = getInventoryModel(req);
    const Stock = getStockModel(req);
    const Costs = getCostsModel(req);

    // Calculate total discrepancy value based on arrival price
    let totalDiscrepancyValue = 0;
    const processedItems = items.map(item => {
      const diff = Number(item.actualQuantity || 0) - Number(item.expectedQuantity || 0);
      totalDiscrepancyValue += diff * Number(item.arrivalPrice || 0);
      return {
        ...item,
        difference: diff
      };
    });

    const newInventory = await Inventory.create({
      checker: req.user.userId,
      checkerName: req.body.checkerName || "Noma'lum",
      notes,
      items: processedItems,
      totalDiscrepancyValue,
      status: "completed"
    });

    // If there's a negative discrepancy (loss), create a cost record in Tenant DB
    if (totalDiscrepancyValue < 0) {
      try {
        await Costs.create({
          amount: Math.abs(totalDiscrepancyValue),
          description: `Inventarizatsiya kamomadi (ID: ${newInventory._id})`,
          category: "inventarizatsiya_zarari",
          paymentMethod: "other",
          date: new Date(),
          sellername: req.body.checkerName || "Admin",
          branchId: req.user.branchId
        });
      } catch (costErr) {
        console.error("Zararni xarajatga yozishda xatolik:", costErr);
      }
    }

    // Update branch stocks based on actual counts (Tenant DB)
    for (const item of items) {
        await Stock.findOneAndUpdate(
            { product: item.productId },
            { $set: { quantity: Number(item.actualQuantity) } },
            { upsert: true }
        );
        
        // Also update global legacy avialable field (Main DB)
        await ProductSchema.findByIdAndUpdate(item.productId, {
            avialable: Number(item.actualQuantity)
        });
    }

    res.status(201).json(newInventory);
  } catch (error) {
    next(error);
  }
});

// Delete an inventory session (Scoped to Tenant DB)
router.delete("/delete/:id", authenticateToken, async (req, res, next) => {
  try {
    const Inventory = getInventoryModel(req);
    const data = await Inventory.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ msg: "Inventarizatsiya topilmadi" });
    res.status(200).json({ msg: "Muvaffaqiyatli o'chirildi" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
