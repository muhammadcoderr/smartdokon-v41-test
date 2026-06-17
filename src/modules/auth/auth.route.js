const express = require("express");
const router = express.Router();
const AuthController = require("./auth.controller");
const authenticateToken = require("../../shared/middlewares/authenticateToken");
const upload = require("../../shared/middlewares/upload");
const { authLimiter } = require("../../shared/middlewares/rateLimiters");

// Public routes
router.post("/login", authLimiter, AuthController.login);
router.post("/refresh-token", authLimiter, AuthController.refreshToken);

// Protected routes
router.use(authenticateToken);

router.get("/verify-user", AuthController.verifyUser);
router.get("/login-history", AuthController.getLoginHistory);
router.post("/logout", AuthController.logout);
router.post("/change-password", authLimiter, AuthController.changePassword);
router.get("/profile", AuthController.getProfile);
router.put("/update-profile", AuthController.updateProfile);

// File uploads
router.post("/upload-avatar", upload.single('avatar'), AuthController.uploadAvatar);
router.post("/upload-banner", upload.single('banner'), AuthController.uploadBanner);

module.exports = router;
