const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { JWT_SECRET } = require("../utilities/config");
const Employee = require("../Models/Employee");

/* ===================== HELPERS ===================== */

const getToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      return parts[1];
    }
  }

  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
};


const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
  algorithms: ["HS256"],
  ignoreExpiration: false
});
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new Error("TokenExpired");
    if (err.name === "JsonWebTokenError") throw new Error("InvalidToken");
    throw err;
  }
};

const validateUser = async (decodedId) => {
  if (!mongoose.Types.ObjectId.isValid(decodedId)) {
    throw new Error("InvalidUserId");
  }

  const user = await Employee.findById(decodedId).lean();
  if (!user) throw new Error("UserNotFound");
if (!user.workingStatus || user.employmentStatus !== "active") {
  throw new Error("AccountDeactivated");
}

  return user;
};

const createUserObject = (user) => ({
  _id: user._id,
  id: user._id.toString(),
  empId: user.empId,
  name: user.name,
  email: user.email,
  role: user.role,
  isHr: !!user.isHr,
  department: user.department,
  designation: user.designation,
  status: user.status,
  employmentStatus: user.employmentStatus,
  workingStatus: user.workingStatus,
  joiningDate: user.dateJoined || user.joiningDate || null
});

/* ===================== TOKEN INVALIDATION ===================== */
/* Instead of blacklist → use passwordChangedAt */

const checkTokenValidity = (decoded, user) => {
  if (!user.passwordChangedAt) return;

  const passwordChangedTime = Math.floor(
    new Date(user.passwordChangedAt).getTime() / 1000
  );

  if (decoded.iat < passwordChangedTime) {
    throw new Error("TokenInvalidated");
  }
};

/* ===================== ERROR HANDLER ===================== */

const handleAuthError = (error, res) => {
  if (error.message === "TokenExpired") {
    return res.status(401).json({ success: false, message: "Token expired" });
  }
  if (error.message === "InvalidToken") {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
  if (error.message === "InvalidUserId") {
    return res.status(401).json({ success: false, message: "Invalid user ID" });
  }
  if (error.message === "UserNotFound") {
    return res.status(401).json({ success: false, message: "User not found" });
  }
  if (error.message === "AccountDeactivated") {
    return res.status(403).json({
      success: false,
      message: "Account is deactivated",
    });
  }
  if (error.message === "TokenInvalidated") {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please login again.",
    });
  }
  if (error.message === "SuspiciousSession") {
    return res.status(403).json({
      success: false,
      message: "Suspicious session detected",
    });
  }

  console.error("Auth error:", error);
  return res.status(500).json({ success: false, message: "Server error" });
};

/* ===================== CORE AUTH ===================== */

const coreAuth = async (req, token) => {
const decoded = verifyToken(token);

if (!decoded || (!decoded.id && !decoded._id)) {
  throw new Error("InvalidToken");
}

const userId = decoded.id || decoded._id;

  const user = await validateUser(userId);

  checkTokenValidity(decoded, user);

  return createUserObject(user);
};

/* ===================== MIDDLEWARE ===================== */

const portalAuth = {
  // Any logged-in user
  authMiddleware: async (req, res, next) => {
    try {
      const token = getToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: "No token provided" });
      }

      req.user = await coreAuth(req, token);
      next();
    } catch (error) {
      return handleAuthError(error, res);
    }
  },

  // Admin only
  adminMiddleware: async (req, res, next) => {
    try {
      const token = getToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: "No token provided" });
      }

      const user = await coreAuth(req, token);

      if (user.role !== "admin" && !user.isHr) {
        return res.status(403).json({
          success: false,
          message: "Admin or HR access required",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return handleAuthError(error, res);
    }
  },

  // Employee only
  employeeMiddleware: async (req, res, next) => {
    try {
      const token = getToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: "No token provided" });
      }

      const user = await coreAuth(req, token);

      if (user.role !== "employee") {
        return res.status(403).json({
          success: false,
          message: "Employee access required",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return handleAuthError(error, res);
    }
  },
};

module.exports = portalAuth;