const express = require("express");
const Todolist = require("../controllers/TodoController");
const portalAuth = require("../middleware/portalAuth");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");

const TodoRoutes = express.Router();
TodoRoutes.use(sanitizeRequestData)

/* ================= TODO ================= */

TodoRoutes.post("/create", portalAuth.authMiddleware, Todolist.createTodo);
TodoRoutes.get("/all", portalAuth.authMiddleware, Todolist.getTodos);
TodoRoutes.delete("/:id", portalAuth.authMiddleware, Todolist.deleteTodo);
TodoRoutes.put("/complete/:id", portalAuth.authMiddleware, Todolist.completeTodo);
TodoRoutes.put("/update/:id", portalAuth.authMiddleware, Todolist.updateTodo);
module.exports = TodoRoutes;