const rateLimit = require("express-rate-limit");

const createLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });

const authLimiter = createLimiter(
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  "Auth so'rovlari juda ko'p. Keyinroq qayta urinib ko'ring."
);

const apiLimiter = createLimiter(
  Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  Number(process.env.API_RATE_LIMIT_MAX) || 300,
  "Juda ko'p so'rov yuborildi. Keyinroq qayta urinib ko'ring."
);

module.exports = {
  authLimiter,
  apiLimiter,
};
