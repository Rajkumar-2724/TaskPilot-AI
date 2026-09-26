import express from "express";
import { register, login, verifyLoginOtp, resendLoginOtp, verifyEmail, resendVerification, getMe, getActiveUsers, updateProfile, changePassword, uploadProfilePicture } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/login", login);
router.post("/verify-login-otp", verifyLoginOtp);
router.post("/resend-login-otp", resendLoginOtp);
router.get("/me", protect, getMe);
router.get("/users", protect, getActiveUsers);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);
router.post("/upload-profile", protect, upload.single("image"), uploadProfilePicture);

export default router;
