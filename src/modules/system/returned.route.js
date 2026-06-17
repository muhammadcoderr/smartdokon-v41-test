let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
let ProductSchema = require("../../shared/database/models/Product")
const ProductService = require("../products/product.service");
// post Model
let ReturnedSchema = require("../../shared/database/models/Returned");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireRoles = require("../../shared/middlewares/requireRoles");

router.get("/",authenticateToken, async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === "sotuvchi") {
      filter.branchId = req.user.branchId;
    } else if (req.query.branchId) {
      filter.branchId = req.query.branchId;
    }

    const data = await ReturnedSchema.find(filter).exec();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const client = await ReturnedSchema.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    next(error);
  }
});

router.route("/create").post(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { name, clientname, userName, avialable, status } = req.body;
    const branchId = req.user.branchId;

    if (status === "yaroqli") {
      // Yaroqli mahsulotlarni Product bazasiga qo'shish
      const existingProduct = await ProductSchema.findOne({ name });

      if (existingProduct) {
        const conn = req.db || mongoose.connection;
        await ProductService.increaseStock(conn, [
          { productId: existingProduct._id, quantity: parseInt(avialable) }
        ]);
      }
    }

    // Qaytarilgan mahsulotni Returned bazasiga qo'shish
    const newReturned = await ReturnedSchema.create({
      name,
      clientname,
      userName,
      avialable: parseInt(avialable),
      status,
      branchId
    });

    res.status(201).json(newReturned);
  } catch (error) {
    next(error);
  }
});

// Update post
router.route("/update/:id").put(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const data = await ReturnedSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    console.log("post updated successfully !");
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete post
router.route("/delete/:id").delete(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const data = await ReturnedSchema.findByIdAndDelete(req.params.id);
    if (data) {
      res.status(200).json({
        msg: "Post deleted successfully",
      });
    } else {
      res.status(404).json({
        msg: "Post not found",
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
