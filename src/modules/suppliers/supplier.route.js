const express = require("express");
const SupplierController = require("./supplier.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");

const router = express.Router();

router.use(authenticateToken);

router.get("/", SupplierController.getAllSuppliers);
router.get("/:id", SupplierController.getSupplierById);
router.get("/:id/financial-summary", SupplierController.getSupplierFinancialSummary);
router.post("/", requireAdmin, SupplierController.createSupplier);
router.put("/:id", requireAdmin, SupplierController.updateSupplier);
router.delete("/:id", requireAdmin, SupplierController.deleteSupplier);
router.post("/:id/payment", requireAdmin, SupplierController.makePayment);

module.exports = router;
