const { v4: uuidv4 } = require("uuid");
let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
const mongoosePaginate = require("mongoose-paginate-v2");
let ProductSchema = require("../Models/Product");
let ProductBatch = require("../Models/ProductBatch");
const monitorStock = require("../Bot/monitorStock");
const deletedProduct = require("../Bot/deletedProduct");
const changeStream = ProductSchema.watch();
const authenticateToken = require("../middleware/authenticateToken");

// Add caching for categories and product names
const NodeCache = require("node-cache");
const Supplier = require("../Models/Supplier");
const SupplierTransaction = require("../Models/SupplierTransaction");
const Cashbox = require("../Models/Cashbox");
const Notification = require("../Models/Notification");
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

const applySupplierPurchase = async ({
  supplier,
  product,
  quantity,
  arrivalprice,
  paymentMethod,
  userId,
}) => {
  const totalPurchaseAmount = Number(arrivalprice || 0) * Number(quantity || 0);

  if (!supplier || totalPurchaseAmount <= 0) {
    return;
  }

  const transaction = new SupplierTransaction({
    supplierId: supplier._id,
    type: "purchase",
    amount: totalPurchaseAmount,
    paymentMethod: paymentMethod || "credit",
    description: `Sotib olindi: ${product.name} (${quantity} ${product.unit || "dona"})`,
    productIds: [product._id],
    createdBy: userId || null,
  });
  await transaction.save();

  const updateData = {
    $inc: { totalPurchased: totalPurchaseAmount },
  };

  if (paymentMethod && paymentMethod !== "credit") {
    updateData.$inc.totalPaid = totalPurchaseAmount;
    const updateField = `${paymentMethod}Balance`;
    await Cashbox.findOneAndUpdate(
      {},
      {
        $inc: { [updateField]: -totalPurchaseAmount },
        $push: {
          transactions: {
            type: "expense",
            amount: totalPurchaseAmount,
            paymentMethod: paymentMethod,
            description: `Ta'minotchidan mahsulot olindi: ${supplier.name}`,
            relatedSupplierId: supplier._id,
          },
        },
      },
      { upsert: true }
    );
  } else {
    updateData.$inc.totalDebt = totalPurchaseAmount;
  }
  await Supplier.findByIdAndUpdate(supplier._id, updateData);
};

const generateBatchNumber = () => {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = String(date.getTime()).slice(-6);
  return `KIR-${datePart}-${timePart}`;
};

changeStream.on("change", async (change) => {
  if (change.operationType === "update") {
    // Clear relevant cache on updates
    cache.del(["categories", "productNames"]);

    const updatedProduct = await ProductSchema.findById(change.documentKey._id);
    if (updatedProduct && updatedProduct.avialable <= 1) {
      monitorStock.monitorStock(updatedProduct);
    }
  }
});

    // Updated Product API with date filtering
router.get("/get-product", authenticateToken, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const includeSummary = req.query.summary !== "false";

    let query = {};

    // Date filtering
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    } else if (req.query.startDate) {
      query.updatedAt = { $gte: new Date(req.query.startDate) };
    } else if (req.query.endDate) {
      query.updatedAt = {
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    }

    // Category filtering
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Unit filtering
    if (req.query.unit) {
      query.unit = req.query.unit;
    }

    // Name filtering
    if (req.query.name) {
      query.$or = [
        { name: { $regex: req.query.name, $options: "i" } },
        { barcode: { $regex: req.query.name, $options: "i" } },
        { barcodes: { $regex: req.query.name, $options: "i" } },
      ];
    }

    const facet = {
      paginatedResults: [
        { $sort: { updatedAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            name: 1,
            arrivalprice: 1,
            sellingprice: 1,
            avialable: 1,
            category: 1,
            barcode: 1,
            barcodes: 1,
            unit: 1,
            updatedAt: 1,
          },
        },
      ],
      totalCount: [{ $count: "count" }],
    };

    if (includeSummary) {
      facet.categories = [
        { $group: { _id: "$category" } },
        { $project: { _id: 0, category: "$_id" } },
      ];
      facet.aggregateData = [
        {
          $group: {
            _id: null,
            totalSellingPrice: {
              $sum: { $multiply: ["$sellingprice", "$avialable"] },
            },
            totalArrivalPrice: {
              $sum: { $multiply: ["$arrivalprice", "$avialable"] },
            },
            totalItems: { $sum: "$avialable" },
          },
        },
      ];
    }

    const pipeline = [{ $match: query }, { $facet: facet }];

    const [result] = await ProductSchema.aggregate(pipeline);

    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);
    const categories = (result.categories || []).map((item) => item.category).filter(Boolean);
    const aggregateData = result.aggregateData?.[0] || {
      totalSellingPrice: 0,
      totalArrivalPrice: 0,
      totalItems: 0,
    };

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
      totalSellingPrice: aggregateData.totalSellingPrice,
      totalArrivalPrice: aggregateData.totalArrivalPrice,
      totalProfit: aggregateData.totalSellingPrice - aggregateData.totalArrivalPrice,
      totalItems: aggregateData.totalItems,
      categories: categories,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalCount: totalDocs,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

//  Get leftover products
router.get("/get-leftover", authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const months = parseInt(req.query.months) || 2;
    const currentDate = new Date();
    const cutoffDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - months,
      currentDate.getDate()
    );

    let matchStage = { updatedAt: { $lt: cutoffDate } };

    if (req.query.name) {
      matchStage.name = { $regex: req.query.name, $options: "i" };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          paginatedResults: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await ProductSchema.aggregate(pipeline);
    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
    });
  } catch (error) {
    next(error);
  }
});

// Get product names with caching
router.get("/get-productname", authenticateToken, async (req, res, next) => {
  try {
    let productNames = cache.get("productNames");

    if (!productNames) {
      const products = await ProductSchema.find({}, { name: 1, _id: 0 }).lean();
      productNames = products.map((product) => product.name);

      cache.set("productNames", productNames, 300); // 5 minutes
    }

    res.json(productNames);
  } catch (error) {
    next(error);
  }
});

router.get("/batches", authenticateToken, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const query = {};

    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + "T23:59:59.999Z"),
      };
    } else if (req.query.startDate) {
      query.createdAt = { $gte: new Date(req.query.startDate) };
    } else if (req.query.endDate) {
      query.createdAt = { $lte: new Date(req.query.endDate + "T23:59:59.999Z") };
    }

    if (req.query.name) {
      query.productName = { $regex: req.query.name, $options: "i" };
    }

    if (req.query.productId && mongoose.Types.ObjectId.isValid(req.query.productId)) {
      query.productId = new mongoose.Types.ObjectId(req.query.productId);
    }

    if (req.query.batchNumber) {
      query.batchNumber = req.query.batchNumber;
    }

    const summary = await ProductBatch.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: { $multiply: ["$quantity", "$arrivalprice"] } },
          batchKeys: { $addToSet: { $ifNull: ["$batchNumber", { $toString: "$_id" }] } },
        },
      },
    ]);

    const groupPipeline = [
      { $match: query },
      {
        $addFields: {
          batchKey: { $ifNull: ["$batchNumber", { $toString: "$_id" }] },
        },
      },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$batchKey",
          batchNumber: { $first: "$batchNumber" },
          createdAt: { $first: "$createdAt" },
          supplierName: { $first: "$supplierName" },
          paymentMethod: { $first: "$paymentMethod" },
          note: { $first: "$note" },
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: { $multiply: ["$quantity", "$arrivalprice"] } },
          items: { $push: "$$ROOT" },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          paginatedResults: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [groupResult] = await ProductBatch.aggregate(groupPipeline);
    const totalGroups = groupResult.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalGroups / limit);

    res.json({
      success: true,
      data: groupResult.paginatedResults,
      totalPages,
      totalBatches: summary[0]?.batchKeys?.length || 0,
      totalQuantity: summary[0]?.totalQuantity || 0,
      totalAmount: summary[0]?.totalAmount || 0,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount: totalGroups,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/batches/:batchNumber", authenticateToken, async (req, res, next) => {
  try {
    const items = await ProductBatch.find({ batchNumber: req.params.batchNumber })
      .sort({ createdAt: 1 })
      .populate("productId", "name barcode unit category")
      .populate("supplierId", "name")
      .populate("createdBy", "firstname lastname login")
      .lean();

    if (!items.length) {
      return res.status(404).json({
        success: false,
        message: "Partiya topilmadi",
      });
    }

    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.arrivalprice || 0),
      0
    );

    res.json({
      success: true,
      data: {
        batchNumber: req.params.batchNumber,
        createdAt: items[0].createdAt,
        supplierName: items[0].supplierName || "",
        paymentMethod: items[0].paymentMethod || "credit",
        note: items[0].note || "",
        items,
        totalQuantity,
        totalAmount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get finished products
router.get("/get-finished", authenticateToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let matchStage = { avialable: { $lt: 5 } };
    if (req.query.name) {
      matchStage.name = { $regex: req.query.name, $options: "i" };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          paginatedResults: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await ProductSchema.aggregate(pipeline);
    const totalDocs = result.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);

    res.json({
      data: result.paginatedResults,
      totalPages: totalPages,
      totalProducts: totalDocs,
    });
  } catch (error) {
    next(error);
  }
});

//  Get product by ID with lean query
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ error: "Invalid product ID format" });
    }
    const client = await ProductSchema.findById(clientId).lean();

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate unique barcode with better collision handling
const generateUniqueBarcode = async () => {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const barcode =
      Date.now().toString().slice(-8) + Math.floor(1000 + Math.random() * 9000);

    // Use lean() and only check existence
    const existingProduct = await ProductSchema.findOne({
      $or: [{ barcode: barcode }, { barcodes: barcode }],
    })
      .lean()
      .select("_id");
    if (!existingProduct) {
      return barcode;
    }
    attempts++;
  }

  // Fallback to UUID if collision keeps happening
  return uuidv4().replace(/-/g, "").slice(0, 12);
};

router.route("/create").post(authenticateToken, async (req, res, next) => {
  try {
    let { barcode, barcodes } = req.body;

    if (!barcodes) barcodes = [];
    
    // If no barcode provided, generate one
    if (!barcode) {
      barcode = await generateUniqueBarcode();
    }

    // Ensure primary barcode is in barcodes array
    if (!barcodes.includes(barcode)) {
      barcodes.push(barcode);
    }

    const {
      supplierId,
      arrivalprice,
      avialable,
      paymentMethod,
      ...productData
    } = req.body;
    let supplier = null;
    if (supplierId) {
      supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return res.status(400).json({
          success: false,
          message: "Supplier not found",
        });
      }
    }

    const product = new ProductSchema({
      ...productData,
      supplierId: supplier ? supplier._id : null,
      supplierName: supplier ? supplier.name : null,
      arrivalprice: arrivalprice,
      avialable: avialable || 0,
      lastPurchaseDate: new Date(),
      lastPurchasePrice: arrivalprice,
      totalPurchased: avialable || 0,
      barcode: barcode,
      barcodes: barcodes,
    });
    await product.save();

    if (product.avialable < 5) {
        await Notification.create({
            type: "low_stock",
            message: `Diqqat! ${product.name} mahsulotidan kam qoldi (${product.avialable} dona).`,
            relatedId: product._id,
            relatedModel: 'Product'
        });
    }

    if ((avialable || 0) > 0) {
      await ProductBatch.create({
        productId: product._id,
        batchNumber: generateBatchNumber(),
        productName: product.name,
        quantity: avialable || 0,
        previousQuantity: 0,
        newQuantity: product.avialable,
        arrivalprice,
        sellingprice: product.sellingprice,
        unit: product.unit,
        category: product.category,
        supplierId: supplier ? supplier._id : null,
        supplierName: supplier ? supplier.name : null,
        paymentMethod: paymentMethod || "credit",
        note: "Yangi mahsulot yaratildi",
        createdBy: req.user ? req.user._id : null,
      });
    }

    await applySupplierPurchase({
      supplier,
      product,
      quantity: avialable || 0,
      arrivalprice,
      paymentMethod,
      userId: req.user ? req.user._id : null,
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error in /create endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Error creating product",
      error: error.message,
    });
  }
});

router.route("/add-batch").post(authenticateToken, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const { supplierId, paymentMethod, note } = req.body;

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Kamida bitta mahsulot kiriting" });
    }

    let supplier = null;
    if (supplierId) {
      supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return res.status(400).json({ success: false, message: "Supplier not found" });
      }
    }

    const batchNumber = req.body.batchNumber || generateBatchNumber();
    const createdBatches = [];
    const updatedProducts = [];

    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({ success: false, message: "Mahsulot ID noto'g'ri" });
      }

      const quantity = Number(item.quantity);
      const arrivalprice = Number(item.arrivalprice);
      const sellingprice = Number(item.sellingprice);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, message: "Kirim miqdori 0 dan katta bo'lishi kerak" });
      }

      if (!Number.isFinite(arrivalprice) || arrivalprice < 0) {
        return res.status(400).json({ success: false, message: "Kelish narxi noto'g'ri" });
      }

      if (!Number.isFinite(sellingprice) || sellingprice < 0) {
        return res.status(400).json({ success: false, message: "Sotuv narxi noto'g'ri" });
      }

      const product = await ProductSchema.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: "Mahsulot topilmadi!" });
      }

      const previousQuantity = product.avialable || 0;
      product.avialable = previousQuantity + quantity;
      product.arrivalprice = arrivalprice;
      product.sellingprice = sellingprice;
      product.lastPurchaseDate = new Date();
      product.lastPurchasePrice = arrivalprice;
      product.totalPurchased = (product.totalPurchased || 0) + quantity;
      if (supplier) {
        product.supplierId = supplier._id;
        product.supplierName = supplier.name;
        product.sellername = supplier.name;
      }
      await product.save();

      const batch = await ProductBatch.create({
        productId: product._id,
        batchNumber,
        productName: product.name,
        quantity,
        previousQuantity,
        newQuantity: product.avialable,
        arrivalprice,
        sellingprice,
        unit: product.unit,
        category: product.category,
        supplierId: supplier ? supplier._id : product.supplierId || null,
        supplierName: supplier ? supplier.name : product.supplierName || null,
        paymentMethod: paymentMethod || "credit",
        note,
        createdBy: req.user ? req.user._id : null,
      });

      await applySupplierPurchase({
        supplier,
        product,
        quantity,
        arrivalprice,
        paymentMethod,
        userId: req.user ? req.user._id : null,
      });

      createdBatches.push(batch);
      updatedProducts.push(product);
    }

    cache.del(["categories", "productNames"]);

    res.status(201).json({
      success: true,
      message: "Mahsulot kirimi muvaffaqiyatli qo'shildi",
      data: {
        batchNumber,
        items: createdBatches,
        products: updatedProducts,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update product
router.route("/update/:id").put(authenticateToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID format" });
    }

    let { barcode, barcodes, arrivalprice, sellingprice, ...otherData } = req.body;

    if (arrivalprice !== undefined && sellingprice !== undefined && Number(arrivalprice) > Number(sellingprice)) {
      return res.status(400).json({ message: "Olish narxi sotish narxidan katta bo'lishi mumkin emas" });
    }

    // Handle barcode updates logic
    if (barcodes || barcode) {
        if (!barcodes) barcodes = [];
        // If we have a primary barcode, ensure it's in the list
        if (barcode && !barcodes.includes(barcode)) {
            barcodes.push(barcode);
        }
        // If we have list but no primary, use first as primary if current primary is empty (handled by schema defaults usually, but good to be explicit)
    }

    const updateData = {
        ...otherData,
    };
    if (barcode) updateData.barcode = barcode;
    if (barcodes) updateData.barcodes = barcodes;


    const data = await ProductSchema.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!data) {
      return res.status(404).json({ message: "Mahsulot topilmadi!" });
    }

    cache.del(["categories", "productNames"]);
    if (data.avialable < 5) {
        await Notification.create({
            type: "low_stock",
            message: `Diqqat! ${data.name} mahsulotidan kam qoldi (${data.avialable} dona).`,
            relatedId: data._id,
            relatedModel: 'Product'
        });
    }
    
    if (data.avialable <= 1) {
      setImmediate(() => monitorStock.monitorStock(data));
    }
    res
      .status(200)
      .json({ message: "Mahsulot muvaffaqiyatli yangilandi", data });
  } catch (error) {
    console.error("Yangilashda xatolik:", error);
    res
      .status(500)
      .json({ message: "Ichki server xatosi", error: error.message });
  }
});

// Delete product
router
  .route("/delete/:id")
  .delete(authenticateToken, async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid product ID format" });
      }

      const data = await ProductSchema.findByIdAndDelete(req.params.id);
      if (data) {
        cache.del(["categories", "productNames"]);

        // Handle deletion notification asynchronously
        setImmediate(() => deletedProduct.deletedProduct(data));

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

// Get product by barcode with index hint
router.get(
  "/by-barcode/:barcode",
  authenticateToken,
  async (req, res, next) => {
    try {
      const barcode = req.params.barcode;
      const product = await ProductSchema.findOne({
        $or: [{ barcode: barcode }, { barcodes: barcode }],
      }).lean();

      if (!product) {
        return res.status(404).json({ message: "Mahsulot topilmadi" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      res
        .status(500)
        .json({ message: "Ichki server xatosi", error: error.message });
    }
  }
);

module.exports = router;

