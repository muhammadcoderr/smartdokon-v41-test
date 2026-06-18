let mongoose = require("mongoose"),
  express = require("express"),
  router = express.Router();

// post Model
let DebtsSchema = require("../Models/Debts");
const authenticateToken = require("../middleware/authenticateToken");
const requireRoles = require("../middleware/requireRoles");

router.get("/",authenticateToken, async (req, res, next) => {
  try {
    const data = await DebtsSchema.find().exec();
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.get('/:id',authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const client = await DebtsSchema.findById(clientId);

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
    const data = await DebtsSchema.create(req.body);
    console.log(data);
    res.json(data);
  } catch (error) {
    next(error);
  }
});




// Update post
router.route("/update/:id").put(authenticateToken, requireRoles("admin", "sotuvchi"), async (req, res, next) => {
  try {
    const data = await DebtsSchema.findByIdAndUpdate(req.params.id, req.body, {
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
    const data = await DebtsSchema.findByIdAndDelete(req.params.id);
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
