const jwt = require("jsonwebtoken");
const { getTenantConnection } = require("../database/tenantManager");
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const authenticateToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Kirish rad etildi - token topilmadi" });
  }

  jwt.verify(token, JWT_SECRET_KEY, async (err, decoded) => {
    if (err) {
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ message: "Token yaroqsiz" });
      }
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ message: "Token muddati tugagan" });
      }
      return res.status(403).json({ message: "Autentifikatsiya xatoligi" });
    }

    if (!decoded.userId) {
      return res.status(403).json({ message: "Token xato - foydalanuvchi ID si yo'q" });
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || [],
      branchId: decoded.branchId,
      dbName: decoded.dbName,
      isMainBranch: decoded.isMainBranch
    };

    // Dinamik ulanishni o'rnatish
    if (decoded.dbName) {
      try {
        req.db = await getTenantConnection(decoded.dbName, decoded.mongoUri);
      } catch (dbError) {
        console.error("Multi-DB ulanish xatoligi:", dbError);
        return res.status(500).json({ message: "Ma'lumotlar bazasiga ulanishda xatolik" });
      }
    }

    next();
  });
};

module.exports = authenticateToken;
