const express = require("express");
const UsersController = require("../controllers/UsersController");
const { resetFirstLoginPassword } = require("../controllers/UsersController");
const portalAuth = require("../middleware/portalAuth");
const { getProfileCompletion, } = require("../controllers/employee.controller");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");


const UsersRoutes = express.Router();
UsersRoutes.use(sanitizeRequestData)

/* ================= AUTH ================= */
UsersRoutes.post("/login", UsersController.login);
UsersRoutes.post("/forgot/send-otp", UsersController.sendOTP);
UsersRoutes.post("/forgot/reset-password", UsersController.resetPassword);
UsersRoutes.get("/completion", portalAuth.employeeMiddleware, getProfileCompletion);

UsersRoutes.get('/employees', portalAuth.authMiddleware, UsersController.getAllEmployees);
UsersRoutes.get("/employees/basic", portalAuth.authMiddleware, UsersController.getEmployeeBasicList);
UsersRoutes.get("/employees/:id", portalAuth.authMiddleware, UsersController.getEmployeeById);
UsersRoutes.put("/reset-first-password", portalAuth.authMiddleware, resetFirstLoginPassword);
module.exports = UsersRoutes;
