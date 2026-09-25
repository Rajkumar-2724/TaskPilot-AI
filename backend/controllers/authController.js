import asyncHandler from "express-async-handler";
import crypto from "crypto";
import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";
import { cloudinaryEnabled } from "../config/cloudinary.js";
import cloudinary from "../config/cloudinary.js";

const VERIFICATION_EXPIRY_MINUTES = 30;
const MAX_VERIFICATION_ATTEMPTS = 5;

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

const issueVerificationCode = async (user) => {
  const code = generateOtp();
  user.verificationCodeHash = hashOtp(code);
  user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);
  user.verificationAttempts = 0;
  await user.save();
  return code;
};

const deliverVerificationCode = async (user) => {
  const code = await issueVerificationCode(user);
  return sendEmail({
    to: user.email,
    subject: "Verify your TaskPilot AI email address",
    html: emailTemplates.emailVerification(user.name, code, VERIFICATION_EXPIRY_MINUTES),
  });
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
    isEmailVerified: false,
  });

  const emailResult = await deliverVerificationCode(user);

  res.status(201).json({
    success: true,
    requiresEmailVerification: true,
    email: user.email,
    emailDelivered: emailResult.sent,
    message: emailResult.sent
      ? `Verification code sent to ${user.email}`
      : "Account created, but the verification email could not be sent. Request a new code once email delivery is configured.",
  });
});

// @desc Verify email address and activate account
// @route POST /api/auth/verify-email
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400);
    throw new Error("Email and verification code are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select("+verificationCodeHash +verificationExpiresAt +verificationAttempts");
  if (!user) {
    res.status(404);
    throw new Error("No account found for this email");
  }

  if (user.isEmailVerified) {
    res.json({
      success: true,
      alreadyVerified: true,
      message: "Email is already verified",
      user: user.toSafeObject(),
      token: generateToken(user._id),
    });
    return;
  }

  if (!user.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
    res.status(400);
    throw new Error("Verification code expired. Request a new one.");
  }
  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    res.status(429);
    throw new Error("Too many incorrect attempts. Request a new code.");
  }

  if (!verifyOtpHash(code, user.verificationCodeHash)) {
    user.verificationAttempts += 1;
    await user.save();
    res.status(401);
    throw new Error(`Invalid code. ${MAX_VERIFICATION_ATTEMPTS - user.verificationAttempts} attempt(s) remaining.`);
  }

  user.isEmailVerified = true;
  user.verificationCodeHash = null;
  user.verificationExpiresAt = null;
  user.verificationAttempts = 0;
  await user.save();

  sendEmail({
    to: user.email,
    subject: "Your TaskPilot AI email is verified",
    html: emailTemplates.emailVerified(user.name),
  }).catch(() => {});

  res.json({
    success: true,
    message: "Email verified successfully",
    user: user.toSafeObject(),
    token: generateToken(user._id),
  });
});

// @desc Resend the email verification code
// @route POST /api/auth/resend-verification
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    res.status(404);
    throw new Error("No account found for this email");
  }
  if (user.isEmailVerified) {
    res.json({ success: true, alreadyVerified: true, message: "Email is already verified" });
    return;
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("This account has been deactivated");
  }

  const emailResult = await deliverVerificationCode(user);

  res.json({
    success: true,
    sent: emailResult.sent,
    message: emailResult.sent
      ? `A new verification code was sent to ${user.email}`
      : "The verification email could not be sent. Please try again later.",
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
  if (!user.isEmailVerified) {
    res.status(403);
    const err = new Error("Please verify your email address before signing in. Check your inbox or request a new verification code.");
    err.errorCode = "EMAIL_NOT_VERIFIED";
    throw err;
  }

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
