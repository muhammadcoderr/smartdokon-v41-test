const jwt = require("jsonwebtoken");
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const authenticateToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication token missing" });
  }

  jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ message: "Invalid token" });
      }
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ message: "Token expired" });
      }
      return res.status(403).json({ message: "Failed to authenticate token" });
    }

    if (!decoded.sellerId) {
      return res.status(403).json({ message: "Malformed token - missing user ID" });
    }

    req.user = {
      userId: decoded.sellerId,
      role: decoded.role || 'seller',
      permissions: decoded.permissions || []
    };

    next();
  });
};

module.exports = authenticateToken;