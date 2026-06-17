const ProductService = require("./product.service");
const AppError = require("../../shared/errors/AppError");

class ProductController {
  async getAllProducts(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ProductService.getProducts(dbConnection, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getLeftoverProducts(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ProductService.getLeftoverProducts(dbConnection, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getFinishedProducts(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ProductService.getFinishedProducts(dbConnection, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async createProduct(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const product = await ProductService.createProduct(dbConnection, req.body, req.user);
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  }

  async addBatch(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      await ProductService.addBatch(dbConnection, req.body, req.user);
      res.status(201).json({ success: true, message: "Kirim bajarildi" });
    } catch (err) {
      next(err);
    }
  }

  async getBatches(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ProductService.getBatches(dbConnection, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getBatchDetails(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ProductService.getBatchDetails(dbConnection, req.params.batchNumber);
      if (!result) return next(new AppError("Topilmadi", 404));
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async updateProduct(req, res, next) {
    try {
      const product = await ProductService.updateProduct(req.params.id, req.body);
      if (!product) return next(new AppError("Topilmadi", 404));
      res.status(200).json(product);
    } catch (err) {
      next(err);
    }
  }

  async deleteProduct(req, res, next) {
    try {
      const success = await ProductService.deleteProduct(req.params.id, req.user);
      if (!success) return next(new AppError("Topilmadi", 404));
      res.status(200).json({ message: "Mahsulot o'chirildi" });
    } catch (err) {
      next(err);
    }
  }

  async getProductByBarcode(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const product = await ProductService.getProductByBarcode(dbConnection, req.params.barcode);
      if (!product) return next(new AppError("Topilmadi", 404));
      res.status(200).json(product);
    } catch (err) {
      next(err);
    }
  }

  async getProductById(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const product = await ProductService.getProductById(dbConnection, req.params.id);
      if (!product) return next(new AppError("Topilmadi", 404));
      res.status(200).json(product);
    } catch (err) {
      next(err);
    }
  }

  async getTransfers(req, res, next) {
    try {
      const result = await ProductService.getTransfers(req.user);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAllProductNames(req, res, next) {
    try {
      const result = await ProductService.getAllProductNames();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ProductController();
