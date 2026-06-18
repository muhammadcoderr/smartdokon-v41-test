const express = require("express");
const router = express.Router();
const InventorySchema = require("../Models/Inventory");
const ProductSchema = require("../Models/Product");
const CostsSchema = require("../Models/Costs");
const authenticateToken = require("../middleware/authenticateToken");

// Get all inventory sessions with pagination
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: { path: "checker", select: "firstname" },
    };

    const data = await InventorySchema.paginate({}, options);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

// Get a single inventory session
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const data = await InventorySchema.findById(req.params.id).populate("checker", "firstname");
    if (!data) return res.status(404).json({ msg: "Inventarizatsiya topilmadi" });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

// Create a new inventory session
router.post("/create", authenticateToken, async (req, res, next) => {
  try {
    const { notes, items } = req.body;

    // Calculate total discrepancy value based on arrival price
    let totalDiscrepancyValue = 0;
    const processedItems = items.map(item => {
      const diff = item.actualQuantity - item.expectedQuantity;
      totalDiscrepancyValue += diff * item.arrivalPrice;
      return {
        ...item,
        difference: diff
      };
    });

    const newInventory = await InventorySchema.create({
      checker: req.user.userId,
      checkerName: req.body.checkerName || "Noma'lum",
      notes,
      items: processedItems,
      totalDiscrepancyValue,
      status: "completed"
    });

    // If there's a negative discrepancy (loss), create a cost record
    if (totalDiscrepancyValue < 0) {
      try {
        await CostsSchema.create({
          amount: Math.abs(totalDiscrepancyValue),
          description: `Inventarizatsiya kamomadi (ID: ${newInventory._id})`,
          category: "inventarizatsiya_zarari",
          paymentMethod: "other",
          date: new Date(),
          createdBy: req.user.userId
        });
      } catch (costErr) {
        console.error("Zararni xarajatga yozishda xatolik:", costErr);
        // We don't fail the whole request if cost creation fails
      }
    }

    // Update product stocks based on actual counts
    const updatePromises = items.map(item => {
      return ProductSchema.findByIdAndUpdate(item.productId, {
        avialable: item.actualQuantity
      });
    });
    await Promise.all(updatePromises);

    res.status(201).json(newInventory);
  } catch (error) {
    next(error);
  }
});

// Delete an inventory session
router.delete("/delete/:id", authenticateToken, async (req, res, next) => {
  try {
    const data = await InventorySchema.findByIdAndDelete(req.params.id);
    if (!data) return res.status(404).json({ msg: "Inventarizatsiya topilmadi" });
    res.status(200).json({ msg: "Muvaffaqiyatli o'chirildi" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
