const mongoose = require("mongoose");
const { getModel } = require("../../helpers/modelFactory");
const { PaymentSchema } = require("../../database/models/Payment");
const { CostsSchema } = require("../../database/models/Costs");
const { ClientSchema } = require("../../database/models/Client");

// Global Models (Main DB)
const Product = require("../../database/models/Product");
const User = require("../../database/models/User");
const DeviceLoginEvent = require("../../database/models/DeviceLoginEvent");

async function loadAutopilotData({ now = new Date(), windowDays = 30, dbConnection, branchId }) {
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - windowDays);

  const connection = dbConnection || mongoose.connection;

  // Tenant-specific models
  const PaymentModel = getModel(connection, "Payment", PaymentSchema);
  const CostsModel = getModel(connection, "Costs", CostsSchema);
  const ClientModel = getModel(connection, "Client", ClientSchema);

  const [payments, products, costs, clients, users, loginEvents] = await Promise.all([
    PaymentModel.find({ createdAt: { $gte: fromDate } }).lean(),
    Product.find().lean(), // Global catalog
    CostsModel.find({ createdAt: { $gte: fromDate } }).lean(),
    ClientModel.find().lean(),
    User.find({ branchId }).select("-password -refreshToken").lean(), // Filter users by branch
    DeviceLoginEvent.find({ createdAt: { $gte: fromDate } }).lean(), // Global but could be filtered later
  ]);

  return {
    now,
    fromDate,
    windowDays,
    payments,
    products,
    costs,
    clients,
    users,
    loginEvents,
  };
}

module.exports = {
  loadAutopilotData,
};
