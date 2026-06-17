const mongoose = require("mongoose");
const { ClientSchema } = require("../../shared/database/models/Client");
const { getModel } = require("../../shared/helpers/modelFactory");
const Branch = require("../../shared/database/models/Branch");
const { getTenantConnection } = require("../../shared/database/tenantManager");
const Notification = require("../../shared/database/models/Notification");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

class ClientService {
  _getClientModel(dbConnection) {
    return getModel(dbConnection, "Client", ClientSchema);
  }

  async getAllClientsAggregated(user, filters = {}) {
    const { branchId } = filters;
    const isMainAdmin = user.role === 'admin' && user.isMainBranch;
    let combinedClients = [];

    let branchesToQuery = [];
    if (isMainAdmin) {
        branchesToQuery = branchId ? await Branch.find({ _id: branchId }) : await Branch.find({ dbName: { $exists: true } });
    } else if (user.branchId) {
        branchesToQuery = await Branch.find({ _id: user.branchId });
    }

    for (const br of branchesToQuery) {
        if (!br.dbName) continue;
        try {
            const conn = await getTenantConnection(br.dbName);
            const ClientModel = this._getClientModel(conn);
            const clients = await ClientModel.find({}).lean();
            clients.forEach(c => {
                c.branchName = br.name;
                combinedClients.push(c);
            });
        } catch (err) {
            console.error(`Error fetching clients from branch ${br.name}:`, err.message);
        }
    }
    return combinedClients;
  }

  async getClientsPaginated(dbConnection, filters = {}) {
    const { page = 1, limit = 20, name } = filters;
    const Client = this._getClientModel(dbConnection);
    const normalizedName = String(name || "").trim();
    const phoneSearch = normalizedName.replace(/\D/g, "");
    
    let query = {};
    if (normalizedName) {
      const orFilters = [
        { firstname: { $regex: normalizedName, $options: "i" } },
        { login: { $regex: normalizedName, $options: "i" } },
      ];
      if (phoneSearch) orFilters.push({ phone: Number(phoneSearch) });
      query.$or = orFilters;
    }

    return await Client.paginate(query, { page: parseInt(page), limit: parseInt(limit), sort: { firstname: 1 } });
  }

  async createClient(dbConnection, clientData, user) {
    const { getReferal, phone, ...rest } = clientData;
    const Client = this._getClientModel(dbConnection);
    const branchId = user.branchId;

    const existingClient = await Client.findOne({ phone });
    if (existingClient) throw new Error("Ushbu telefon raqami bilan mijoz allaqachon mavjud.");

    const finalData = {
      ...rest,
      phone,
      referralCode: uuidv4().slice(0, 8),
      bonus: 0,
      branchId,
    };

    if (finalData.password) {
      const salt = await bcrypt.genSalt(10);
      finalData.password = await bcrypt.hash(finalData.password, salt);
    }

    if (getReferal) {
      const referrer = await Client.findOne({ referralCode: getReferal });
      if (referrer) { referrer.bonus += 5000; await referrer.save(); }
    }

    const client = await Client.create(finalData);
    await Notification.create({ type: "new_client", message: `Yangi mijoz: ${client.firstname}`, relatedId: client._id, relatedModel: 'Client', branchId });
    return client;
  }

  async payDebt(dbConnection, clientId, paymentData) {
    const { amount, paymentMethod, description } = paymentData;
    const Client = this._getClientModel(dbConnection);
    const client = await Client.findById(clientId);
    if (!client) throw new Error("Mijoz topilmadi");
    
    const totalDebt = (client.debts || []).reduce((acc, debt) => acc + debt.amount, 0);
    if (amount > totalDebt) throw new Error(`Summa qarzdan ko'p`);

    client.paymentHistory.push({ amount, date: new Date(), paymentMethod, description });
    let remainingPayment = parseFloat(amount);
    const sortedDebts = [...client.debts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const updatedDebts = [];
    for (const debt of sortedDebts) {
      const debtAmount = parseFloat(debt.amount);
      if (remainingPayment >= debtAmount) remainingPayment -= debtAmount;
      else if (remainingPayment > 0) {
        updatedDebts.push({ ...debt.toObject(), amount: debtAmount - remainingPayment });
        remainingPayment = 0;
      } else updatedDebts.push(debt);
    }
    client.debts = updatedDebts;
    return await client.save();
  }

  async addDebt(dbConnection, clientId, debtData) {
    const { amount, description, date } = debtData;
    const Client = this._getClientModel(dbConnection);
    const client = await Client.findById(clientId);
    if (!client) throw new Error("Mijoz topilmadi");

    client.debts.push({
      amount: parseFloat(amount),
      description: description || "Qarz qo'shildi",
      date: date || new Date().toISOString(),
    });

    return await client.save();
  }

  async updateClient(dbConnection, clientId, updateData) {
    const Client = this._getClientModel(dbConnection);
    return await Client.findByIdAndUpdate(clientId, updateData, { new: true });
  }

  async deleteClient(dbConnection, clientId) {
    const Client = this._getClientModel(dbConnection);
    return await Client.findByIdAndDelete(clientId);
  }

  async getClientById(dbConnection, clientId) {
    const Client = this._getClientModel(dbConnection);
    return await Client.findById(clientId);
  }

  async getAllClientNames(dbConnection) {
    const Client = this._getClientModel(dbConnection);
    const clients = await Client.find({}).select("_id firstname").lean();
    return clients;
  }

  async getClientsWithDebts(dbConnection, filters = {}) {
    const { name, page = 1, limit = 20 } = filters;
    const Client = this._getClientModel(dbConnection);
    
    let query = { "debts.0": { $exists: true } };
    if (name) {
      query.firstname = { $regex: name, $options: "i" };
    }

    const clients = await Client.find(query).lean();
    
    const processed = clients.map(client => {
      const totalDebt = (client.debts || []).reduce((sum, d) => sum + (d.amount || 0), 0);
      
      // Get the most recent date from debts array if updatedAt is missing
      let lastUpdate = client.updatedAt;
      if (!lastUpdate && client.debts?.length > 0) {
        const sortedDebts = [...client.debts].sort((a, b) => new Date(b.date) - new Date(a.date));
        lastUpdate = sortedDebts[0].date;
      }

      return { ...client, totalDebt, updatedAt: lastUpdate };
    }).filter(c => c.totalDebt > 0);

    // Simple manual pagination for now
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedData = processed.slice(startIndex, startIndex + parseInt(limit));

    return {
      data: paginatedData,
      totalPages: Math.ceil(processed.length / parseInt(limit)),
      totalCount: processed.length
    };
  }
}

module.exports = new ClientService();
