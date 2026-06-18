let mongoose = require("mongoose");
let express = require("express");
let router = express.Router();
let bcrypt = require("bcryptjs");
let PaymentSchema = require("../Models/Payment");
let SellerSchema = require("../Models/Seller");
let ProductSchema = require("../Models/Product");
const DeviceLoginEvent = require("../Models/DeviceLoginEvent");
const authenticateToken = require("../middleware/authenticateToken");
const requireAdmin = require("../middleware/requireAdmin");

const BCRYPT_ROUNDS = 10;

// Apply middleware
router.use(authenticateToken);

router.get("/", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const { page = 1, limit = 20, name, type } = req.query;
    const query = {};

    if (name) {
      query.firstname = { $regex: name, $options: "i" };
    }

    if (type) {
      query.type = type;
    }
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await SellerSchema.paginate(query, options);

    res.json({
      data: result.docs.map((doc) => {
        const seller =
          typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
        delete seller.password;
        delete seller.refreshToken;
        return seller;
      }),
      totalPages: result.totalPages,
      currentPage: result.page,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/get-all", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const data = await SellerSchema.find().select("-password -refreshToken");

    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/edit/:id", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const sellerId = req.params.id;
    const seller = await SellerSchema.findById(sellerId).select("-password -refreshToken");

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json(seller);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:username", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const sellerUsername = req.params.username;
    const seller = await SellerSchema.findOne({
      $or: [{ login: sellerUsername }, { firstname: sellerUsername }],
    }).select("-password -refreshToken");

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const salesData = await PaymentSchema.find({
      $or: [
        { sellerId: String(seller._id) },
        { sellername: seller.firstname },
      ],
    }).sort({ createdAt: -1 }).lean();

    const productIds = Array.from(
      new Set(
        salesData.flatMap((sale) =>
          (sale.products || []).map((product) => product.productId).filter(Boolean)
        )
      )
    );

    const products = productIds.length
      ? await ProductSchema.find({ _id: { $in: productIds } }, { name: 1 }).lean()
      : [];
    const productMap = new Map(products.map((product) => [String(product._id), product.name]));

    const hydratedSales = salesData.map((sale) => ({
      ...sale,
      products: (sale.products || []).map((product) => ({
        ...product,
        name: productMap.get(String(product.productId)) || product.productId || "Mahsulot",
      })),
    }));

    const loginEvents = await DeviceLoginEvent.find({ sellerId: seller._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const responseData = {
      seller: seller,
      sales: hydratedSales,
      loginEvents: loginEvents.map((event) => ({
        _id: event._id,
        deviceName: event.deviceName || "Noma'lum qurilma",
        deviceId: event.deviceId || "",
        ipAddress: event.ipAddress || "unknown",
        source: event.source || "web",
        createdAt: event.createdAt,
      })),
    };

    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.route("/create").post(requireAdmin, async (req, res, next) => {
  try {
    if (!req.body.firstname) {
      return res.status(400).json({ error: "Firstname is required" });
    }

    // Check if login already exists
    const existingSeller = await SellerSchema.findOne({ login: req.body.login });
    if (existingSeller) {
      return res.status(400).json({ error: "Bu login allaqachon mavjud!" });
    }

    // Hash password before saving
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    }

    req.body.createdBy = req.user.userId;

    const data = await SellerSchema.create(req.body);
    const seller = data.toObject();
    delete seller.password;
    delete seller.refreshToken;
    res.json(seller);
  } catch (error) {
    next(error);
  }
});

router.route("/update/:id").put(requireAdmin, async (req, res, next) => {
  try {
    // Check if login already exists (excluding current user)
    if (req.body.login) {
      const existingSeller = await SellerSchema.findOne({
        login: req.body.login,
        _id: { $ne: req.params.id }
      });
      if (existingSeller) {
        return res.status(400).json({ error: "Bu login allaqachon mavjud!" });
      }
    }

    // Hash password if it's being updated
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    }

    const data = await SellerSchema.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select("-password -refreshToken");
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router
  .route("/delete/:id")
  .delete(requireAdmin, async (req, res, next) => {
    try {
      const sellerId = req.params.id;
      const currentUserId = req.user.userId;

      // Get current user to check if they are admin
      const currentUser = await SellerSchema.findById(currentUserId);

      if (!currentUser) {
        return res.status(401).json({
          msg: "User not found"
        });
      }

      // Only admin can delete sellers
      if (currentUser.type !== "admin") {
        return res.status(403).json({
          msg: "Sizda bu amalni bajarish uchun ruxsat yo'q!"
        });
      }

      // Admin cannot delete themselves
      if (sellerId === currentUserId) {
        return res.status(403).json({
          msg: "O'zingizni o'chira olmaysiz!"
        });
      }

      // Check if seller exists
      const seller = await SellerSchema.findById(sellerId);
      if (!seller) {
        return res.status(404).json({
          msg: "Sotuvchi topilmadi",
        });
      }

      // Cannot delete the one who added you
      if (String(seller._id) === String(currentUser.createdBy)) {
        return res.status(403).json({
          msg: "Sizni qo'shgan adminni o'chira olmaysiz!"
        });
      }

      // Delete the seller
      await SellerSchema.findByIdAndDelete(sellerId);

      res.status(200).json({
        msg: "Sotuvchi muvaffaqiyatli o'chirildi",
        deletedSeller: {
          _id: seller._id,
          firstname: seller.firstname
        }
      });
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
