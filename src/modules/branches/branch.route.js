const express = require("express");
const BranchController = require("./branch.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.get("/", BranchController.getAllBranches);
router.post("/", BranchController.createBranch);
router.get("/transfer/history", BranchController.getTransferHistory);
router.post("/transfer/send", BranchController.sendTransfer);
router.post("/transfer/receive/:id", BranchController.receiveTransfer);
router.get("/:id/analytics", BranchController.getBranchesAnalytics);
router.get("/:id", BranchController.getBranchById);
router.put("/:id", BranchController.updateBranch);
router.delete("/:id", BranchController.deleteBranch);

module.exports = router;
