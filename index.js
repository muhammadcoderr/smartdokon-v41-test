const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const seedDefaultUsers = require("./helper/basic-seed"); // Import basic seeding helper
const initCronJobs = require("./cronJobs"); // Import cron jobs
const os = require("os");
const sanitizeInput = require("./middleware/sanitizeInput");
const { apiLimiter } = require("./middleware/rateLimiters");
const { resolveUploadsDir } = require("./services/storagePaths");

const app = express();
app.disable("x-powered-by");

const warnOnWeakSecurityConfig = () => {
  const weakSecrets = [];

  if (!process.env.JWT_SECRET_KEY || process.env.JWT_SECRET_KEY.length < 24) {
    weakSecrets.push("JWT_SECRET_KEY");
  }

  if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET.length < 24) {
    weakSecrets.push("REFRESH_TOKEN_SECRET");
  }

  if (weakSecrets.length > 0) {
    console.warn(`Security warning: weak or missing secrets detected: ${weakSecrets.join(", ")}`);
  }

  if (!process.env.CORS_ORIGIN) {
    console.warn("Security warning: CORS_ORIGIN is not set, falling back to local development origins only.");
  }
};

warnOnWeakSecurityConfig();

const redactBody = (body) => {
  if (!body || typeof body !== "object") {
    return body;
  }

  const sensitiveKeys = new Set([
    "password",
    "currentPassword",
    "newPassword",
    "confirmPassword",
    "refreshToken",
    "accessToken",
    "token",
    "botToken",
    "clientBotToken",
  ]);

  if (Array.isArray(body)) {
    return body.map(redactBody);
  }

  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      sensitiveKeys.has(key) ? "[REDACTED]" : redactBody(value),
    ])
  );
};

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));
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

// Serve uploaded files statically
const uploadsPath = resolveUploadsDir();
app.use('/uploads', express.static(uploadsPath));

//MongoDB Connecting
let cachedPromise = null;

const BotManager = require("./Bot/BotManager");

const connectToDatabase = async () => {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is not defined");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 5000, // Fail quickly if mongo is down
      })
      .then((mongoose) => {
        console.log("Connected to MongoDB!");
        seedDefaultUsers(); // Seed default users
        initCronJobs(); // Initialize cron jobs
        BotManager.init(); // Initialize bots after DB connection
        return mongoose;
      })
      .catch((error) => {
        console.error("MongoDB connection error:", error);
        cachedPromise = null; // Reset promise on failure
        throw error;
      });
  }
  
  return cachedPromise;
};

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  // Skip DB connection for static files or simple health checks if any
  if (req.path.startsWith('/uploads')) {
    return next();
  }
  
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

//connecting
// app.listen moved to the end


// Optional HTTP debug logging (disabled by default)
const shouldLogHttp = process.env.DEBUG_HTTP === "true";
app.use((req, res, next) => {
  if (shouldLogHttp) {
    console.log(`${req.method} ${req.url}`);
    if (req.method !== "GET" && req.method !== "DELETE") {
      console.log("Request Body:", redactBody(req.body));
    }
  }
  next();
});

const ClientRoute = require("./Routers/Client.route");
const CostsRoute = require("./Routers/Costs.route");
const PaymentRoute = require("./Routers/Payment.route");
const ProductRoute = require("./Routers/Product.route");
const SellerRoute = require("./Routers/Seller.route");
const ReturnedRoute = require("./Routers/Returned.route");
const DebtsRoute = require("./Routers/Debts.route");
const CashboxRoute = require("./Routers/Cashbox.route");
const AuthRoute = require("./Routers/auth.route.js");
const DashboardRoute = require("./Routers/Dashboard.route.js");
const SupplierRoute = require("./Routers/Suppliers.route.js");
app.use("/api/client", ClientRoute);
app.use("/api/costs", CostsRoute);
app.use("/api/payment", PaymentRoute);
app.use("/api/product", ProductRoute);
app.use("/api/bonus", require("./Routers/Bonus.route"));
app.use("/api/seller", SellerRoute);
app.use("/api/returned", ReturnedRoute);
app.use("/api/debts", DebtsRoute);
app.use("/api/cashbox", CashboxRoute);
app.use("/api/auth", AuthRoute);
app.use("/api/dashboard", DashboardRoute);
app.use("/api/supplier", SupplierRoute);
app.use("/api/inventory", require("./Routers/Inventory.route"));
app.use("/api/bot-settings", require("./Routers/BotSettings.route"));
app.use("/api/notifications", require("./Routers/Notification.route"));
app.use("/api/check-settings", require("./Routers/CheckSetting.route"));
app.use("/api/system", require("./Routers/System.route"));

// Initialize Telegram Bots Manager (moved to connectToDatabase)
// const BotManager = require("./Bot/BotManager");

//errors
app.use(function (err, req, res, next) {
  console.error(err.message);
  if (!err.statusCode) err.statusCode = 500;
  res.status(err.statusCode).json({
    message: err.statusCode >= 500 ? "Internal server error" : err.message,
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
