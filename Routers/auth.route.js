const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const SellerSchema = require("../Models/Seller");
const authenticateToken = require("../middleware/authenticateToken");
const upload = require("../middleware/upload");
const { authLimiter } = require("../middleware/rateLimiters");
const { getClientIp, recordDeviceLoginEvent } = require("../services/deviceTrackingService");
const DeviceLoginEvent = require("../Models/DeviceLoginEvent");

// Import models
const ClientSchema = require("../Models/Client");
const Notification = require("../Models/Notification");
const moment = require("moment");

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET_KEY + "_refresh";
const BCRYPT_ROUNDS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const loginAttempts = new Map();
const cookieSecure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE || "lax";
const refreshCookieOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: "/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const getClientIdentifier = (req) => getClientIp(req);

const isLoginRateLimited = (key) => {
  const record = loginAttempts.get(key);
  if (!record) {
    return false;
  }

  if (Date.now() > record.expiresAt) {
    loginAttempts.delete(key);
    return false;
  }

  return record.count >= MAX_LOGIN_ATTEMPTS;
};

const recordFailedLogin = (key) => {
  const now = Date.now();
  const existing = loginAttempts.get(key);

  if (!existing || now > existing.expiresAt) {
    loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
    return;
  }

  existing.count += 1;
  loginAttempts.set(key, existing);
};

const clearFailedLogins = (key) => {
  loginAttempts.delete(key);
};

const resolveAuthenticatedUserModel = (req) => {
  if (req.user.role === "admin" || req.user.role === "sotuvchi") {
    return SellerSchema;
  }

  return ClientSchema;
};

// Utility function to hash passwords with bcryptjs
const hashPassword = async (password) => {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
};

// Verify password with bcryptjs
const verifyPassword = async (inputPassword, hashedPassword) => {
  return await bcrypt.compare(inputPassword, hashedPassword);
};

const deleteUploadedAsset = (assetPath) => {
  if (!assetPath || !assetPath.startsWith("/uploads/")) {
    return;
  }

  const absolutePath = path.join(__dirname, "..", assetPath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

router.get("/verify-user", authenticateToken, async (req, res) => {
  try {
    const seller = await SellerSchema.findById(req.user.userId)
      .select("-password -refreshToken")
      .lean();

    if (!seller) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });
    }

    res.json(seller);
  } catch (error) {
    console.error("Foydalanuvchi tekshirish xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

router.get("/login-history", authenticateToken, async (req, res) => {
  try {
    const events = await DeviceLoginEvent.find({ sellerId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      events: events.map((event) => ({
        _id: event._id,
        deviceId: event.deviceId || "",
        deviceName: event.deviceName || "Noma'lum qurilma",
        userAgent: event.userAgent || "",
        ipAddress: event.ipAddress || "unknown",
        source: event.source || "web",
        createdAt: event.createdAt,
      })),
    });
  } catch (error) {
    console.error("Login history error:", error);
    res.status(500).json({ message: "Kirish tarixini yuklashda xatolik" });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { login, password } = req.body;
    const loginKey = `${String(login || "").toLowerCase()}|${getClientIdentifier(req)}`;

    if (isLoginRateLimited(loginKey)) {
      return res.status(429).json({ message: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." });
    }

    const seller = await SellerSchema.findOne({ login });

    if (!seller) {
      recordFailedLogin(loginKey);
      return res.status(401).json({ message: "Login yoki parol xato!" });
    }

    // Check if password matches using bcryptjs
    let passwordMatch = false;
    try {
      passwordMatch = await verifyPassword(password, seller.password);
    } catch (err) {
      // Fallback for old plain-text passwords or migration
      passwordMatch = (seller.password === password);

      // If it's a plain-text match, hash it now for future use
      if (passwordMatch && !seller.password.startsWith('$2')) {
        seller.password = await hashPassword(password);
        await seller.save();
      }
    }

    if (!passwordMatch) {
      recordFailedLogin(loginKey);
      return res.status(401).json({ message: "Login yoki parol xato!" });
    }

    // Sotuvchi statusini tekshirish
    if (seller.status === "inactive") {
      return res.status(403).json({ message: "Sizning hisobingiz faol emas!" });
    }

    if (!JWT_SECRET_KEY) {
      return res
        .status(500)
        .json({ message: "Serverda JWT_SECRET_KEY topilmadi!" });
    }

    // Generate access token (short-lived)
    const accessToken = jwt.sign(
      { sellerId: seller._id, login: seller.login, role: seller.type, permissions: seller.permissions },
      JWT_SECRET_KEY,
      { expiresIn: "10h" }
    );

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { sellerId: seller._id, login: seller.login, role: seller.type, permissions: seller.permissions },
      REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Save refresh token to database
    seller.refreshToken = refreshToken;
    seller.lastseen = new Date();
    await seller.save();
    await recordDeviceLoginEvent(req, seller, "web").catch((error) => {
      console.error("Device login event save error:", error);
    });
    clearFailedLogins(loginKey);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    // Create Welcome Notification
    setImmediate(async () => {
        try {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const device = req.headers['user-agent'] || 'Noma\'lum qurilma';
            const time = moment().format('DD.MM.YYYY HH:mm:ss');
            
            await Notification.create({
                type: "system",
                message: `Tizimga kirish!\n\n👤 Foydalanuvchi: ${seller.firstname} (${seller.login})\n🕒 Vaqt: ${time}\n📍 IP: ${ip}\n📱 Qurilma: ${device}`,
                relatedId: seller._id,
                relatedModel: 'Seller' 
            });
        } catch (error) {
            console.error("Login notification error:", error);
        }
    });

    res.json({
      accessToken,
      seller: {
        _id: seller._id,
        firstname: seller.firstname,
        login: seller.login,
        phone: seller.phone,
        avatar: seller.avatar,
        banner: seller.banner,
        status: seller.status,
        type: seller.type,
        permissions: seller.permissions,
        lastseen: seller.lastseen
      }
    });
  } catch (error) {
    console.error("Login xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

// Refresh token endpoint
router.post("/refresh-token", authLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired refresh token" });
      }

      try {
        const seller = await SellerSchema.findById(decoded.sellerId);

        if (!seller || seller.refreshToken !== refreshToken) {
          return res.status(403).json({ message: "Refresh token mismatch" });
        }

        // Rotate refresh token on every successful refresh to reduce replay risk
        const newAccessToken = jwt.sign(
          { sellerId: seller._id, login: seller.login, role: seller.type, permissions: seller.permissions },
          JWT_SECRET_KEY,
          { expiresIn: "10h" }
        );

        const newRefreshToken = jwt.sign(
          { sellerId: seller._id, login: seller.login, role: seller.type, permissions: seller.permissions },
          REFRESH_TOKEN_SECRET,
          { expiresIn: "7d" }
        );

        seller.refreshToken = newRefreshToken;
        await seller.save();
        res.cookie("refreshToken", newRefreshToken, refreshCookieOptions);

        res.json({ accessToken: newAccessToken });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });
  } catch (error) {
    console.error("Refresh token xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

// Logout endpoint
router.post("/logout", authLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Clear refresh token from database
    await SellerSchema.findByIdAndUpdate(userId, { refreshToken: null });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      path: "/auth",
    });

    res.json({ message: "Successfully logged out" });
  } catch (error) {
    console.error("Logout xatoligi:", error);
    res.status(500).json({ message: "Ichki server xatosi" });
  }
});

router.post("/change-password", authLimiter, authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    let userId;

    if (req.user && req.user.userId) {
      userId = req.user.userId;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    // Validate request
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters long" });
    }

    const UserModel = resolveAuthenticatedUserModel(req);
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password using bcryptjs
    let passwordMatch = false;
    try {
      passwordMatch = await verifyPassword(currentPassword, user.password);
    } catch (err) {
      // Fallback for plain-text passwords
      passwordMatch = (user.password === currentPassword);
    }

    if (!passwordMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password using bcryptjs
    user.password = await hashPassword(newPassword);
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

// Upload avatar endpoint
router.post("/upload-avatar", authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    let userId;

    if (req.user && req.user.userId) {
      userId = req.user.userId;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Rasm faylli yuborilmadi" });
    }

    // Generate avatar URL
    const avatarUrl = `/uploads/${req.file.filename}`;

    const UserModel = resolveAuthenticatedUserModel(req);

    // Get old avatar to delete it
    const user = await UserModel.findById(userId);
    if (user) {
      deleteUploadedAsset(user.avatar);
    }

    // Update user with new avatar URL
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Avatar muvaffaqiyatli yuklandi",
      user: updatedUser,
      avatarUrl: avatarUrl
    });
  } catch (error) {
    console.error("Avatar upload error:", error);

    // Delete uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    if (error.message.includes('Faqat rasm')) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Avatar yuklashda xatolik",
      error: error.message
    });
  }
});

router.post("/upload-banner", authenticateToken, upload.single("banner"), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Banner rasmi yuborilmadi" });
    }

    const bannerUrl = `/uploads/${req.file.filename}`;
    const UserModel = resolveAuthenticatedUserModel(req);
    const user = await UserModel.findById(userId);

    if (user) {
      deleteUploadedAsset(user.banner);
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { banner: bannerUrl },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Banner muvaffaqiyatli yuklandi",
      user: updatedUser,
      bannerUrl,
    });
  } catch (error) {
    console.error("Banner upload error:", error);

    if (req.file) {
      const filePath = path.join(__dirname, "../uploads", req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    if (error.message.includes("Faqat rasm")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Banner yuklashda xatolik",
      error: error.message,
    });
  }
});

// Update profile endpoint
router.put("/update-profile", authenticateToken, async (req, res) => {
  try {
    let userId;

    if (req.user && req.user.userId) {
      userId = req.user.userId;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    const allowedFields =
      req.user.role === "admin" || req.user.role === "sotuvchi"
        ? ["firstname", "phone", "avatar", "banner"]
        : ["firstname", "phone", "avatar", "banner", "birthday", "address"];

    const updateData = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    const UserModel = resolveAuthenticatedUserModel(req);

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

// Get user profile endpoint
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    let userId;

    // Extract the correct user ID based on the token structure
    if (req.user && req.user.userId) {
      userId = req.user.userId;
    } else {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    const UserModel = resolveAuthenticatedUserModel(req);

    // Find the user
    const user = await UserModel.findById(userId).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
