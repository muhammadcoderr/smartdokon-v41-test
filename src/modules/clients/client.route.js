const express = require("express");
const ClientController = require("./client.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.get("/get-all", ClientController.getAllClientsAggregated);
router.get("/get-clientname", ClientController.getAllClientNames);
router.get("/get-client/debts", ClientController.getClientsWithDebts);
router.get("/", ClientController.getClientsPaginated);
router.post("/create", ClientController.createClient);
router.post("/pay-debt/:id", ClientController.payDebt);
router.post("/add-client/debt/:id", ClientController.addDebt);
router.get("/:id", ClientController.getClientById);
router.put("/update/:id", ClientController.updateClient);
router.delete("/delete/:id", ClientController.deleteClient);

module.exports = router;
