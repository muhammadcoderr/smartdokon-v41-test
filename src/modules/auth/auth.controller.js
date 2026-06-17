const AuthService = require("./auth.service");
const User = require("../../shared/database/models/User");
const DeviceLoginEvent = require("../../shared/database/models/DeviceLoginEvent");
const Branch = require("../../shared/database/models/Branch");
const AppError = require("../../shared/errors/AppError");

class AuthController {
  async verifyUser(req, res, next) {
    try {
      const user = await User.findById(req.user.userId)
        .select("-password -refreshToken")
        .lean();

      if (!user) {
        return next(new AppError("Foydalanuvchi topilmadi!", 404));
      }

      let isMainBranch = false;
      if (user.branchId) {
        const branch = await Branch.findById(user.branchId);
        isMainBranch = branch?.isMainBranch || false;
      }

      res.status(200).json({ ...user, isMainBranch });
    } catch (error) {
      next(error);
    }
  }

  async getLoginHistory(req, res, next) {
    try {
      const events = await DeviceLoginEvent.find({ userId: req.user.userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      res.status(200).json({
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
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { login, password } = req.body;
      if (!login || !password) {
        return next(new AppError("Login va parol kiritilishi shart!", 400));
      }

      const result = await AuthService.login(login, password, req);

      const cookieSecure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
      const cookieSameSite = process.env.COOKIE_SAME_SITE || "lax";

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;
      const result = await AuthService.refreshToken(token);

      const cookieSecure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
      const cookieSameSite = process.env.COOKIE_SAME_SITE || "lax";

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({ accessToken: result.accessToken });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const userId = req.user.userId;
      await User.findByIdAndUpdate(userId, { refreshToken: null });

      const cookieSecure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
      const cookieSameSite = process.env.COOKIE_SAME_SITE || "lax";

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/auth",
      });

      res.status(200).json({ message: "Successfully logged out" });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      if (!currentPassword || !newPassword) {
        return next(new AppError("Eski va yangi parollar kiritilishi shart!", 400));
      }

      const UserModel = AuthService.resolveUserModel(req.user.role);
      const user = await UserModel.findById(userId);
      if (!user) return next(new AppError("Foydalanuvchi topilmadi", 404));

      const isMatch = await AuthService.verifyPassword(currentPassword, user.password);
      if (!isMatch) return next(new AppError("Eski parol noto'g'ri", 401));

      user.password = await AuthService.hashPassword(newPassword);
      await user.save();

      res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const role = req.user.role;

      const allowedFields =
        role === "admin" || role === "user"
          ? ["firstname", "phone", "avatar", "banner", "currencyPreference"]
          : ["firstname", "phone", "avatar", "banner", "birthday", "address", "currencyPreference"];

      const updateData = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
      );

      const updatedUser = await AuthService.updateProfile(userId, role, updateData);
      res.status(200).json({ message: "Profile updated successfully", user: updatedUser });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      if (!req.file) return next(new AppError("Rasm faylli yuborilmadi", 400));
      const avatarUrl = `/uploads/${req.file.filename}`;
      const updatedUser = await AuthService.updateProfile(req.user.userId, req.user.role, { avatar: avatarUrl });
      res.status(200).json({ message: "Avatar muvaffaqiyatli yuklandi", user: updatedUser, avatarUrl });
    } catch (error) {
      next(error);
    }
  }

  async uploadBanner(req, res, next) {
    try {
      if (!req.file) return next(new AppError("Banner rasmi yuborilmadi", 400));
      const bannerUrl = `/uploads/${req.file.filename}`;
      const updatedUser = await AuthService.updateProfile(req.user.userId, req.user.role, { banner: bannerUrl });
      res.status(200).json({ message: "Banner muvaffaqiyatli yuklandi", user: updatedUser, bannerUrl });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const UserModel = AuthService.resolveUserModel(req.user.role);
      const user = await UserModel.findById(userId).select("-password -refreshToken");

      if (!user) return next(new AppError("User not found", 404));
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
