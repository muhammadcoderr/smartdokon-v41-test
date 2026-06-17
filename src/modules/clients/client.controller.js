const ClientService = require("./client.service");
const AppError = require("../../shared/errors/AppError");
const Branch = require("../../shared/database/models/Branch");
const { getTenantConnection } = require("../../shared/database/tenantManager");

class ClientController {
  async getAllClientsAggregated(req, res, next) {
    try {
      const result = await ClientService.getAllClientsAggregated(req.user, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getClientsPaginated(req, res, next) {
    try {
      const { branchId } = req.query;
      const isMainAdmin = req.user.role === 'admin' && req.user.isMainBranch;

      let targetDb = req.db || req.app.get("dbConnection");
      if (isMainAdmin && branchId) {
          const branch = await Branch.findById(branchId);
          if (branch?.dbName) targetDb = await getTenantConnection(branch.dbName);
      }

      const result = await ClientService.getClientsPaginated(targetDb, req.query);
      res.status(200).json({
        data: result.docs,
        totalPages: result.totalPages,
        currentPage: result.page,
      });
    } catch (err) {
      next(err);
    }
  }

  async createClient(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      if (!req.user.branchId) return next(new AppError("Siz filialga biriktirilmagansiz", 400));
      const client = await ClientService.createClient(dbConnection, req.body, req.user);
      res.status(201).json(client);
    } catch (err) {
      next(err);
    }
  }

  async payDebt(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const client = await ClientService.payDebt(dbConnection, req.params.id, req.body);
      res.status(200).json({ success: true, client });
    } catch (err) {
      next(err);
    }
  }

  async addDebt(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const client = await ClientService.addDebt(dbConnection, req.params.id, req.body);
      res.status(200).json({ success: true, client });
    } catch (err) {
      next(err);
    }
  }

  async updateClient(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const client = await ClientService.updateClient(dbConnection, req.params.id, req.body);
      if (!client) return next(new AppError("Client not found", 404));
      res.status(200).json(client);
    } catch (err) {
      next(err);
    }
  }

  async deleteClient(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const client = await ClientService.deleteClient(dbConnection, req.params.id);
      if (!client) return next(new AppError("Client not found", 404));
      res.status(200).json({ msg: "O'chirildi" });
    } catch (err) {
      next(err);
    }
  }

  async getClientById(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const client = await ClientService.getClientById(dbConnection, req.params.id);
      if (!client) return next(new AppError("Client not found", 404));
      res.status(200).json({ client });
    } catch (err) {
      next(err);
    }
  }

  async getAllClientNames(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ClientService.getAllClientNames(dbConnection);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getClientsWithDebts(req, res, next) {
    try {
      const dbConnection = req.db || req.app.get("dbConnection");
      const result = await ClientService.getClientsWithDebts(dbConnection, req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ClientController();
