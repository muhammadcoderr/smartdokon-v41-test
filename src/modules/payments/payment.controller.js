const PaymentService = require("./payment.service");
const AppError = require("../../shared/errors/AppError");

class PaymentController {
  async getPayments(req, res, next) {
    try {
      const result = await PaymentService.getPayments(req.user, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async createPayment(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      if (!req.user.branchId) {
        return next(new AppError("Siz birorta ham filialga biriktirilmagansiz", 400));
      }
      const payment = await PaymentService.createPayment(dbConnection, req.body, req.user);
      res.status(201).json(payment);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PaymentController();
