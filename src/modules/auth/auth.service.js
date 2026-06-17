const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const User = require("../../shared/database/models/User");
const Client = require("../../shared/database/models/Client");
const Branch = require("../../shared/database/models/Branch");
const Notification = require("../../shared/database/models/Notification");
const DeviceLoginEvent = require("../../shared/database/models/DeviceLoginEvent");
const AppError = require("../../shared/errors/AppError");
const { recordDeviceLoginEvent } = require("../../shared/services/deviceTrackingService");

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET_KEY + "_refresh";
const BCRYPT_ROUNDS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const loginAttempts = new Map();

class AuthService {
  async hashPassword(password) {
    return await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(inputPassword, hashedPassword) {
    return await bcrypt.compare(inputPassword, hashedPassword);
  }

  isLoginRateLimited(key) {
    const record = loginAttempts.get(key);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      loginAttempts.delete(key);
      return false;
    }
    return record.count >= MAX_LOGIN_ATTEMPTS;
  }

  recordFailedLogin(key) {
    const now = Date.now();
    const existing = loginAttempts.get(key);
    if (!existing || now > existing.expiresAt) {
      loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
      return;
    }
    existing.count += 1;
    loginAttempts.set(key, existing);
  }

  clearFailedLogins(key) {
    loginAttempts.delete(key);
  }

  resolveUserModel(role) {
    if (role === "admin" || role === "user") {
      return User;
    }
    return Client;
  }

  async login(login, password, req) {
    const loginKey = `${String(login || "").toLowerCase()}|${req.ip}`;

    if (this.isLoginRateLimited(loginKey)) {
      throw new AppError("Juda ko'p urinish. Keyinroq qayta urinib ko'ring.", 429);
    }

    const user = await User.findOne({ login });

    if (!user) {
      this.recordFailedLogin(loginKey);
      throw new AppError("Login yoki parol xato!", 401);
    }

    let passwordMatch = false;
    try {
      passwordMatch = await this.verifyPassword(password, user.password);
    } catch (err) {
      passwordMatch = (user.password === password);
      if (passwordMatch && !user.password.startsWith('$2')) {
        user.password = await this.hashPassword(password);
        await user.save();
      }
    }

    if (!passwordMatch) {
      this.recordFailedLogin(loginKey);
      throw new AppError("Login yoki parol xato!", 401);
    }

    if (user.status === "inactive") {
      throw new AppError("Sizning hisobingiz faol emas!", 403);
    }

    if (!JWT_SECRET_KEY) {
      throw new AppError("Serverda JWT_SECRET_KEY topilmadi!", 500);
    }

    let dbName = null;
    let isMainBranch = false;
    let mongoUri = null;
    if (user.branchId) {
      const branch = await Branch.findById(user.branchId);
      dbName = branch?.dbName;
      isMainBranch = branch?.isMainBranch || false;
      mongoUri = branch?.mongoUri || null;
    }

    const payload = { 
      userId: user._id, 
      login: user.login, 
      role: user.type, 
      permissions: user.permissions, 
      branchId: user.branchId, 
      dbName, 
      isMainBranch, 
      mongoUri 
    };

    const accessToken = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "10h" });
    const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

    user.refreshToken = refreshToken;
    user.lastseen = new Date();
    await user.save();

    await recordDeviceLoginEvent(req, user, "web").catch(() => {});
    this.clearFailedLogins(loginKey);

    // Notification logic
    setImmediate(async () => {
      try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const device = req.headers['user-agent'] || 'Noma\'lum qurilma';
        const time = moment().format('DD.MM.YYYY HH:mm:ss');
        
        await Notification.create({
          type: "system",
          message: `Tizimga kirish!\n\n👤 Foydalanuvchi: ${user.firstname} (${user.login})\n🕒 Vaqt: ${time}\n📍 IP: ${ip}\n📱 Qurilma: ${device}`,
          relatedId: user._id,
          relatedModel: 'User' 
        });
      } catch (error) {}
    });

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        firstname: user.firstname,
        login: user.login,
        phone: user.phone,
        avatar: user.avatar,
        banner: user.banner,
        status: user.status,
        type: user.type,
        permissions: user.permissions,
        lastseen: user.lastseen,
        branchId: user.branchId,
        isMainBranch: isMainBranch
      }
    };
  }

  async refreshToken(refreshToken) {
    if (!refreshToken) throw new AppError("Refresh token required", 401);

    try {
      const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || user.refreshToken !== refreshToken) {
        throw new AppError("Refresh token mismatch", 403);
      }

      const payload = { 
        userId: user._id,
        login: user.login, 
        role: user.type, 
        permissions: user.permissions,
        branchId: user.branchId
      };

      const newAccessToken = jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: "10h" });
      const newRefreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

      user.refreshToken = newRefreshToken;
      await user.save();

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
      throw new AppError("Invalid or expired refresh token", 403);
    }
  }

  async updateProfile(userId, role, updateData) {
    const UserModel = this.resolveUserModel(role);
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) throw new AppError("User not found", 404);
    return updatedUser;
  }
}

module.exports = new AuthService();
