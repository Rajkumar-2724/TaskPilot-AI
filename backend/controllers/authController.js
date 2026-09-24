import asyncHandler from "express-async-handler";
import crypto from "crypto";
import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";
import { cloudinaryEnabled } from "../config/cloudinary.js";
import cloudinary from "../config/cloudinary.js";

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(otp, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyOtpHash = (otp, stored) => {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(otp, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

// @desc Register new user
// @route POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email and password are required");
  }
  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(400);
    throw new Error("An account with this email already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    role: "Member",
  });

  sendEmail({
    to: user.email,
    subject: "Welcome to TaskPilot AI",
    html: emailTemplates.welcome(user.name),
  }).catch(() => {});

  res.status(201).json({
    success: true,
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});

// @desc Login
// @route POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("This account has been deactivated");
  }

  res.json({
    success: true,
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});

// @desc Send OTP to email for login
// @route POST /api/auth/send-otp
export const sendLoginOtp = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("This account has been deactivated");
  }

  const otp = generateOtp();
  user.otpHash = hashOtp(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  user.otpAttempts = 0;
  await user.save();

  const emailResult = await sendEmail({
    to: user.email,
    subject: "Your TaskPilot AI login code",
    html: emailTemplates.loginOtp(user.name, otp, OTP_EXPIRY_MINUTES),
  });

  res.json({
    success: true,
    message: emailResult.sent
      ? `Verification code sent to ${user.email}`
      : `Verification code generated but email delivery failed${emailResult.reason ? `: ${emailResult.reason}` : ""}`,
    email: user.email,
    ...(process.env.NODE_ENV === "development" ? { devOtp: otp } : {}),
  });
});

// @desc Verify OTP and complete login
// @route POST /api/auth/verify-otp
export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+otpHash +otpExpiresAt +otpAttempts");
  if (!user) {
    res.status(401);
    throw new Error("Invalid email");
  }
  if (!user.otpHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    res.status(400);
    throw new Error("OTP expired. Please request a new one.");
  }
  if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
    res.status(429);
    throw new Error("Too many incorrect attempts. Please request a new OTP.");
  }

  const valid = verifyOtpHash(otp, user.otpHash);
  if (!valid) {
    user.otpAttempts += 1;
    await user.save();
    res.status(401);
    throw new Error(`Invalid OTP. ${MAX_OTP_ATTEMPTS - user.otpAttempts} attempt(s) remaining.`);
  }

  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  await user.save();

  res.json({
    success: true,
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

// @desc List active users (for reassignment pickers)
// @route GET /api/auth/users
export const getActiveUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: true })
    .select("name email role profilePicture")
    .sort("name");
  res.json({ success: true, count: users.length, users });
});

// @desc Update profile
// @route PUT /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, bio, phone, skills } = req.body;
  const user = await User.findById(req.user._id);

  if (name) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (phone !== undefined) user.phone = phone;
  if (skills) user.skills = skills;

  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc Change password
// @route PUT /api/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Current and new password are required");
  }
  if (newPassword.length < 6) {
    res.status(400);
    throw new Error("New password must be at least 6 characters");
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(currentPassword))) {
    res.status(401);
    throw new Error("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: "Password updated successfully" });
});

// @desc Upload profile picture
// @route POST /api/auth/upload-profile
export const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }

  let imageUrl;
  if (cloudinaryEnabled) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "taskpilot-ai/profile-pictures",
    });
    imageUrl = result.secure_url;
  } else {
    imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  }

  const user = await User.findById(req.user._id);
  user.profilePicture = imageUrl;
  await user.save();

  res.json({ success: true, profilePicture: imageUrl, user: user.toSafeObject() });
});
