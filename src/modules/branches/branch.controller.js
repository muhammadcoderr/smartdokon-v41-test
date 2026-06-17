const BranchService = require("./branch.service");
const AppError = require("../../shared/errors/AppError");

class BranchController {
  async getAllBranches(req, res, next) {
    try {
      const branches = await BranchService.getAllBranches();
      res.status(200).json(branches);
    } catch (err) {
      next(err);
    }
  }

  async getBranchById(req, res, next) {
    try {
      const branch = await BranchService.getBranchById(req.params.id);
      if (!branch) return next(new AppError("Branch not found", 404));
      res.status(200).json(branch);
    } catch (err) {
      next(err);
    }
  }

  async createBranch(req, res, next) {
    try {
      const branch = await BranchService.createBranch(req.body);
      res.status(201).json(branch);
    } catch (err) {
      next(err);
    }
  }

  async updateBranch(req, res, next) {
    try {
      const branch = await BranchService.updateBranch(req.params.id, req.body);
      if (!branch) return next(new AppError("Branch not found", 404));
      res.status(200).json(branch);
    } catch (err) {
      next(err);
    }
  }

  async deleteBranch(req, res, next) {
    try {
      await BranchService.deleteBranch(req.params.id);
      res.status(200).json({ message: "Branch deleted successfully" });
    } catch (err) {
      next(err);
    }
  }

  async getTransferHistory(req, res, next) {
    try {
      const history = await BranchService.getTransferHistory(req.user, req.query);
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  }

  async sendTransfer(req, res, next) {
    try {
      const transfer = await BranchService.sendTransfer(req.body, req.user);
      res.status(201).json(transfer);
    } catch (err) {
      next(err);
    }
  }

  async receiveTransfer(req, res, next) {
    try {
      const transfer = await BranchService.receiveTransfer(req.params.id, req.user);
      res.status(200).json(transfer);
    } catch (err) {
      next(err);
    }
  }

  async getBranchesAnalytics(req, res, next) {
    try {
      const analytics = await BranchService.getBranchesAnalytics(req.user);
      res.status(200).json(analytics);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new BranchController();
