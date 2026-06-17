const mongoose = require("mongoose");
const { PaymentSchema } = require("../../shared/database/models/Payment");
const { ClientSchema } = require("../../shared/database/models/Client");
const { CashboxSchema } = require("../../shared/database/models/Cashbox");
const { StockSchema } = require("../../shared/database/models/Stock");
const ProductService = require("../products/product.service");
const { getModel } = require("../../shared/helpers/modelFactory");
const { getAggregatedPayments } = require("../../shared/controllers/analyticsController");

class PaymentService {
  _getModels(dbConnection) {
    return {
      Payment: getModel(dbConnection, "Payment", PaymentSchema),
      Client: getModel(dbConnection, "Client", ClientSchema),
      Cashbox: getModel(dbConnection, "Cashbox", CashboxSchema),
      Stock: getModel(dbConnection, "Stock", StockSchema),
    };
  }

  async getPayments(user, queryParams) {
    const { clientId, limit = 20, page = 1 } = queryParams;

    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      const dbConnection = user.dbConnection || mongoose.connection;
      const { Payment } = this._getModels(dbConnection);
      
      const docs = await Payment.find({ clientId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean();
        
      return { data: docs, totalCount: await Payment.countDocuments({ clientId }) };
    }

    return await getAggregatedPayments(user, queryParams);
  }

  async createPayment(dbConnection, paymentData, user) {
    const { products, clientId, totalPrice, discountPrice, cash, terminal, cashback, indebtedness, type } = paymentData;
    const { Payment, Client, Cashbox, Stock } = this._getModels(dbConnection);
    const branchId = user.branchId;

    // 1. Zaxirani tekshirish
    for (const item of products) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) continue;
      const stock = await Stock.findOne({ product: item.productId });
      if (!stock || stock.quantity < item.quantity) {
        throw new Error(`Mahsulot yetarli emas: ${item.productName || 'Noma\'lum'}. Mavjud: ${stock ? stock.quantity : 0}`);
      }
    }

    // 2. Qoldiqni yangilash (ProductService orqali)
    await ProductService.decreaseStock(dbConnection, products);

    // 3. To'lovni saqlash
    const totalProfit = products.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
    const finalPaymentData = {
      ...paymentData,
      userId: user.userId,
      branchId,
      profit: Number(totalProfit.toFixed(2)),
      status: type === "pos" ? "success" : "waiting",
      totalPrice: Number(totalPrice || 0),
      discountPrice: Number(discountPrice || 0),
      cash: Number(cash || 0),
      terminal: Number(terminal || 0),
      cashback: Number(cashback || 0),
      indebtedness: Number(indebtedness || 0),
    };

    const payment = await Payment.create(finalPaymentData);

    // 4. Mijoz qarzi va bonus
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      try {
        const client = await Client.findById(clientId);
        if (client) {
          if (Number(indebtedness) > 0) {
            client.debts.push({
              description: "POS terminal orqali qarz",
              date: new Date().toISOString(),
              amount: Number(indebtedness),
            });
          }
          if (Number(cashback) > 0) {
            client.bonus = Math.max(0, (client.bonus || 0) - Number(cashback));
          }
          await client.save();
        }
      } catch (e) {
        console.error("[PaymentService] Client update error:", e.message);
      }
    }

    // 5. Kassani yangilash
    try {
      let cashbox = await Cashbox.findOne();
      if (!cashbox) {
        cashbox = await Cashbox.create({ branchId, cashBalance: 0, cardBalance: 0, bankBalance: 0, transactions: [] });
      }

      const cashAmt = Number(cash || 0);
      const termAmt = Number(terminal || 0);

      if (cashAmt > 0) cashbox.cashBalance += cashAmt;
      if (termAmt > 0) cashbox.cardBalance += termAmt;

      if (cashAmt > 0 || termAmt > 0) {
        cashbox.transactions.push({
          type: "income",
          amount: cashAmt + termAmt,
          paymentMethod: cashAmt > 0 ? "cash" : "card",
          description: `Sotuv: ${paymentData.clientName || 'Mijoz'}`,
          date: new Date(),
        });
      }
      await cashbox.save();
    } catch (e) {
      console.error("[PaymentService] Cashbox update error:", e.message);
    }

    return payment;
  }
}

module.exports = new PaymentService();
