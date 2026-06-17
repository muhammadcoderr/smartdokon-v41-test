const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin ruxsati talab qilinadi" });
  }

  next();
};

module.exports = requireAdmin;
