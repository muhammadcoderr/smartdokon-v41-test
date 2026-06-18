const PaymentSchema = require("../../Models/Payment");
const Product = require("../../Models/Product");
const CostsSchema = require("../../Models/Costs");
const ClientSchema = require("../../Models/Client");
const SellerSchema = require("../../Models/Seller");
const DeviceLoginEvent = require("../../Models/DeviceLoginEvent");

async function loadAutopilotData({ now = new Date(), windowDays = 30 }) {
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - windowDays);

  const [payments, products, costs, clients, sellers, loginEvents] = await Promise.all([
    PaymentSchema.find({ createdAt: { $gte: fromDate } }).lean(),
    Product.find().lean(),
    CostsSchema.find({ createdAt: { $gte: fromDate } }).lean(),
    ClientSchema.find().lean(),
    SellerSchema.find().select("-password -refreshToken").lean(),
    DeviceLoginEvent.find({ createdAt: { $gte: fromDate } }).lean(),
  ]);

  return {
    now,
    fromDate,
    windowDays,
    payments,
    products,
    costs,
    clients,
    sellers,
    loginEvents,
  };
}

module.exports = {
  loadAutopilotData,
};
