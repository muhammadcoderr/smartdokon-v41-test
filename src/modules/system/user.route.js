let mongoose = require("mongoose");
let express = require("express");
let router = express.Router();
let bcrypt = require("bcryptjs");
let PaymentSchema = require("../../shared/database/models/Payment");
let User = require("../../shared/database/models/User");
let ProductSchema = require("../../shared/database/models/Product");
const DeviceLoginEvent = require("../../shared/database/models/DeviceLoginEvent");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const requireAdmin = require("../../shared/middlewares/requireAdmin");

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

    const result = await User.paginate(query, options);

    res.json({
      data: result.docs.map((doc) => {
        const user =
          typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
        delete user.password;
        delete user.refreshToken;
        return user;
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

    const data = await User.find().select("-password -refreshToken");

    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get("/edit/:id", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const userId = req.params.id;
    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.get("/:username", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
    }

    const userLogin = req.params.username;
    const user = await User.findOne({
      $or: [{ login: userLogin }, { firstname: userLogin }],
    }).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const salesData = await PaymentSchema.find({
      $or: [
        { userId: String(user._id) },
        { userName: user.firstname },
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

    const loginEvents = await DeviceLoginEvent.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const responseData = {
      user: user,
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
    next(error);
  }
});

router.route("/create").post(requireAdmin, async (req, res, next) => {
  try {
    if (!req.body.firstname) {
      return res.status(400).json({ error: "Ism talab qilinadi" });
    }

    // Check if login already exists
    const existingUser = await User.findOne({ login: req.body.login });
    if (existingUser) {
      return res.status(400).json({ error: "Bu login allaqachon mavjud!" });
    }

    // Hash password before saving
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    }

    req.body.createdBy = req.user.userId;

    const data = await User.create(req.body);
    const user = data.toObject();
    delete user.password;
    delete user.refreshToken;
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.route("/update/:id").put(requireAdmin, async (req, res, next) => {
  try {
    // Check if login already exists (excluding current user)
    if (req.body.login) {
      const existingUser = await User.findOne({
        login: req.body.login,
        _id: { $ne: req.params.id }
      });
      if (existingUser) {
        return res.status(400).json({ error: "Bu login allaqachon mavjud!" });
      }
    }

    // Hash password if it's being updated
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    }

    const data = await User.findByIdAndUpdate(
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
      const userId = req.params.id;
      const currentUserId = req.user.userId;

      // Get current user to check if they are admin
      const currentUser = await User.findById(currentUserId);

      if (!currentUser) {
        return res.status(401).json({
          msg: "Foydalanuvchi topilmadi"
        });
      }

      // Only admin can delete users
      if (currentUser.type !== "admin") {
        return res.status(403).json({
          msg: "Sizda bu amalni bajarish uchun ruxsat yo'q!"
        });
      }

      // Admin cannot delete themselves
      if (userId === currentUserId) {
        return res.status(403).json({
          msg: "O'zingizni o'chira olmaysiz!"
        });
      }

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          msg: "Foydalanuvchi topilmadi",
        });
      }

      // Cannot delete the one who added you
      if (String(user._id) === String(currentUser.createdBy)) {
        return res.status(403).json({
          msg: "Sizni qo'shgan adminni o'chira olmaysiz!"
        });
      }

      // Delete the user
      await User.findByIdAndDelete(userId);

      res.status(200).json({
        msg: "Foydalanuvchi muvaffaqiyatli o'chirildi",
        deletedUser: {
          _id: user._id,
          firstname: user.firstname
        }
      });
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
