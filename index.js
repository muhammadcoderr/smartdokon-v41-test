const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const seedDefaultUsers = require("./src/core/seeding/basic-seed");
const initCronJobs = require("./src/core/cronJobs");
const sanitizeInput = require("./src/shared/middlewares/sanitizeInput");
const { apiLimiter } = require("./src/shared/middlewares/rateLimiters");
const requestLogger = require("./src/shared/middlewares/requestLogger");
const { resolveUploadsDir } = require("./src/shared/services/storagePaths");
const globalErrorHandler = require("./src/shared/errors/globalErrorHandler");
const v2Router = require("./src/app");
const BotManager = require("./src/bot/BotManager");

const app = express();
app.disable("x-powered-by");

// Security Headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  })
);

// Standard Middlewares
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(sanitizeInput);
app.use(apiLimiter);
app.use(requestLogger);

// Static Files
const uploadsPath = resolveUploadsDir();
app.use('/uploads', express.static(uploadsPath));

// Database Connection
let cachedPromise = null;

const connectToDatabase = async () => {
  if (!process.env.MONGO_URL) {
    const error = new Error("MONGO_URL muhit o'zgaruvchisi topilmadi!");
    console.error(error.message);
    throw error;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 5000,
      })
      .then((mongoose) => {
        console.log("MongoDB-ga muvaffaqiyatli ulanish hosil qilindi!");
        seedDefaultUsers();
        initCronJobs();
        BotManager.init();
        return mongoose;
      })
      .catch((error) => {
        console.error("MongoDB ulanishda xatolik:", error.message);
        cachedPromise = null;
        throw error;
      });
  }
  
  return cachedPromise;
};

app.use(async (req, res, next) => {
  if (req.path.startsWith('/uploads')) return next();
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

// API Routes
app.use("/api", v2Router);

// Global Error Handler
app.use(globalErrorHandler);

// Start Server
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT} manzilida ishlamoqda`);
  });
}

module.exports = app;
