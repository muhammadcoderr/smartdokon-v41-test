const express = require("express");
const ProductController = require("./product.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.get("/get-product", ProductController.getAllProducts);
router.get("/get-productname", ProductController.getAllProductNames);
router.get("/get-leftover", ProductController.getLeftoverProducts);
router.get("/get-finished", ProductController.getFinishedProducts);
router.post("/create", ProductController.createProduct);
router.post("/add-batch", ProductController.addBatch);
router.get("/batches", ProductController.getBatches);
router.get("/batches/:batchNumber", ProductController.getBatchDetails);
router.get("/transfers", ProductController.getTransfers);
router.put("/update/:id", ProductController.updateProduct);
router.delete("/delete/:id", ProductController.deleteProduct);
router.get("/by-barcode/:barcode", ProductController.getProductByBarcode);
router.get("/:id", ProductController.getProductById);

module.exports = router;
