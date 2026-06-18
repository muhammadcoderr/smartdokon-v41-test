let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();
let ProductSchema = require("../Models/Product")
// post Model
let ReturnedSchema = require("../Models/Returned");
const authenticateToken = require("../middleware/authenticateToken");
const requireRoles = require("../middleware/requireRoles");

router.get("/",authenticateToken, async (req, res, next) => {
  try {
    const data = await ReturnedSchema.find().exec();
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/:id',authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const client = await ReturnedSchema.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.route("/create").post(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const { name, clientname, sellername, avialable, status } = req.body;

    if (status === "yaroqli") {
      // Yaroqli mahsulotlarni Product bazasiga qo'shish
      const existingProduct = await ProductSchema.findOne({ name });

      if (existingProduct) {
        // Agar mahsulot mavjud bo'lsa, sonini oshirish
        existingProduct.avialable += parseInt(avialable); // avialable ni raqamga aylantirish
        await existingProduct.save();
      } else {
        // Agar mahsulot mavjud bo'lmasa, yangi mahsulot qo'shish
        await ProductSchema.create({ name, avialable: parseInt(avialable) }); // avialable ni raqamga aylantirish
      }
    }

    // Qaytarilgan mahsulotni Returned bazasiga qo'shish
    const newReturned = await ReturnedSchema.create({
      name,
      clientname,
      sellername,
      avialable: parseInt(avialable), // avialable ni raqamga aylantirish
      status,
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
