const express = require("express");
const portalAuth = require("../middleware/portalAuth");
const editRequestController = require("../controllers/editRequestController");
const ProfileFunction = require("../controllers/profileController");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");
const upload = require("../middleware/uploadMemory");

const ProfileEditRoutes = express.Router();

/* ===================== Employee Profile Edit ====================== */

ProfileEditRoutes.post(
  "/employee/request-edit",
  portalAuth.employeeMiddleware,
  sanitizeRequestData,
  editRequestController.sendEditRequest
);

ProfileEditRoutes.get(
  "/info/can-edit",
  portalAuth.employeeMiddleware,
  editRequestController.canEditProfile
);

ProfileEditRoutes.get(
  "/employee/my-requests",
  portalAuth.employeeMiddleware,
  editRequestController.getMyRequests
);

/* ===================== Admin Profile Edit ====================== */

ProfileEditRoutes.get(
  "/admin/edit-requests/pending",
  portalAuth.adminMiddleware,
  editRequestController.getPendingRequests
);

ProfileEditRoutes.put(
  "/admin/edit-request/:requestId",
  portalAuth.adminMiddleware,
  sanitizeRequestData,
  editRequestController.updateRequestStatus
);

/* =================== Profile OTP =================== */

ProfileEditRoutes.post(
  "/send-profile-otp",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.sendProfileOtp
);

ProfileEditRoutes.post(
  "/verify-profile-otp",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.verifyProfileOtp
);

/* =================== Password OTP =================== */

ProfileEditRoutes.post(
  "/send-password-change-otp",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.sendPasswordChangeOtp
);

ProfileEditRoutes.post(
  "/verify-otp-change-password",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.verifyOtpAndChangePassword
);

ProfileEditRoutes.post(
  "/resend-password-change-otp",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.resendPasswordChangeOtp
);

/* =================== Profile =================== */

ProfileEditRoutes.get(
  "/get-profile",
  portalAuth.authMiddleware,
  ProfileFunction.getProfile
);

ProfileEditRoutes.put(
  "/update-profile",
  portalAuth.authMiddleware,
  upload.single("photo"),
  sanitizeRequestData,
  ProfileFunction.updateProfile
);

ProfileEditRoutes.put(
  "/change-password",
  portalAuth.authMiddleware,
  sanitizeRequestData,
  ProfileFunction.changePassword
);

module.exports = ProfileEditRoutes;