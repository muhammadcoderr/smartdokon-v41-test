const express = require("express");
const productRouter = require("./modules/products/product.route");
const paymentRouter = require("./modules/payments/payment.route");
const branchRouter = require("./modules/branches/branch.route");
const supplierRouter = require("./modules/suppliers/supplier.route");
const clientRouter = require("./modules/clients/client.route");
const authRouter = require("./modules/auth/auth.route");

const router = express.Router();

// Modullarni ulash (Frontend kutgan nomlar bilan)
router.use("/product", productRouter);
router.use("/payment", paymentRouter);
router.use("/branch", branchRouter);
router.use("/supplier", supplierRouter);
router.use("/client", clientRouter);
router.use("/auth", authRouter);

// Qolgan tizim marshrutlari (System module)
router.use("/system", require("./modules/system/system.route"));
router.use("/dashboard", require("./modules/system/dashboard.route"));
router.use("/bonus", require("./modules/system/bonus.route"));
router.use("/bot-settings", require("./modules/system/bot-settings.route"));
router.use("/check-settings", require("./modules/system/check-setting.route"));
router.use("/notifications", require("./modules/system/notification.route"));
router.use("/inventory", require("./modules/system/inventory.route"));
router.use("/costs", require("./modules/system/costs.route"));
router.use("/debts", require("./modules/system/debts.route"));
router.use("/cashbox", require("./modules/system/cashbox.route"));
router.use("/users", require("./modules/system/user.route"));
router.use("/returned", require("./modules/system/returned.route"));
router.use("/branch-revision", require("./modules/system/branch-revision.route"));

module.exports = router;
