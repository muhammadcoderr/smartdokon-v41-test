const mongoose = require("mongoose");
const SupplierService = require("./supplier.service");
const AppError = require("../../shared/errors/AppError");

class SupplierController {
  async getAllSuppliers(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      const result = await SupplierService.getSuppliers(dbConnection, req.query);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getSupplierById(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      const result = await SupplierService.getSupplierById(dbConnection, req.params.id);
      if (!result) return next(new AppError("Supplier not found", 404));
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async createSupplier(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      const supplier = await SupplierService.createSupplier(dbConnection, req.body);
      res.status(201).json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  }

  async updateSupplier(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      const supplier = await SupplierService.updateSupplier(dbConnection, req.params.id, req.body);
      res.status(200).json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  }

  async deleteSupplier(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      await SupplierService.deleteSupplier(dbConnection, req.params.id);
      res.status(200).json({ success: true, message: "Ta'minotchi o'chirildi" });
    } catch (err) {
      next(err);
    }
  }

  async getSupplierFinancialSummary(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      const result = await SupplierService.getSupplierFinancialSummary(dbConnection, req.params.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async makePayment(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection") || mongoose.connection;
      await SupplierService.makePayment(dbConnection, req.params.id, req.body, req.user);
      res.status(200).json({ success: true, message: "To'lov muvaffaqiyatli saqlandi" });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SupplierController();
