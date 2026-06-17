const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Bu amal uchun ruxsat yetarli emas" });
  }

  next();
};

module.exports = requireRoles;
