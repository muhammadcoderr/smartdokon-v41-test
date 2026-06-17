const AppError = require("./AppError");
const logger = require("../utils/logger");

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log the error
  logger.error(err.message, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode,
    userId: req.user?._id
  });

  if (process.env.NODE_ENV === "development") {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    // Production: Foydalanuvchiga kamroq ma'lumot berish
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      // Noma'lum dasturlash xatolari
      console.error("ERROR 💥", err);
      res.status(500).json({
        status: "error",
        message: "Nimadir juda noto'g'ri ketdi!",
      });
    }
  }
};

module.exports = globalErrorHandler;
