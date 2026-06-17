const express = require("express");
const PaymentController = require("./payment.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.get("/", PaymentController.getPayments);
router.post("/create", PaymentController.createPayment);

module.exports = router;
