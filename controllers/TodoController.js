const Todo = require("../Models/Todo");

/* ================= MAIN FUNCTION ================= */
const Todolist = {

  /* ===== CREATE TODO ===== */
  createTodo: async (req, res) => {
    try {
      const { title, description, date } = req.body;
      const employeeId = req.user.id;

      if (!title || !description || !date || isNaN(new Date(date))) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
        });
      }

      const newTodo = await Todo.create({
        employeeId,
        title,
        description,
        dueDate: date,
        status: "pending",
        createdDate: new Date(),
      });


      return res.status(201).json({
        success: true,
        message: "Todo created",
        data: newTodo,
      });

    } catch (error) {
      console.error("Create Todo Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== GET TODOS ===== */
  getTodos: async (req, res) => {
    try {
      const userId = req.user.id;

      const {
        dateFilter,
        statusFilter,
        fromDate,
        toDate,
      } = req.query;

      let query = {};
      
      // Everyone sees only their own todos
      query.employeeId = userId;

      // ✅ DATE FILTER
      if (dateFilter && dateFilter !== "all") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "today") {
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);

          query.dueDate = { $gte: today, $lt: tomorrow };
        }

        if (dateFilter === "yesterday") {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);

          query.dueDate = { $gte: yesterday, $lt: today };
        }

        if (dateFilter === "this_week") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // ✅ Monday start (fix)
          const day = today.getDay();
          const diff = day === 0 ? -6 : 1 - day;

          const start = new Date(today);
          start.setDate(today.getDate() + diff);
          start.setHours(0, 0, 0, 0);

          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          end.setHours(23, 59, 59, 999); 

          query.dueDate = { $gte: start, $lte: end };
        }

        if (dateFilter === "this_month") {
          const start = new Date(today.getFullYear(), today.getMonth(), 1);
          start.setHours(0, 0, 0, 0);

          const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);

          query.dueDate = { $gte: start, $lte: end };
        }

        if (dateFilter === "custom") {
          if (fromDate || toDate) {
            query.dueDate = query.dueDate || {};
            if (fromDate) query.dueDate.$gte = new Date(fromDate);
            if (toDate) query.dueDate.$lte = new Date(toDate);
          }
        }
      }

      if (statusFilter && statusFilter !== "all") {
        query.status = statusFilter;
      }

      const todos = await Todo.find(query)
        .populate("employeeId", "name empId")
        .sort({
          dueDate: 1,
          createdAt: -1,
        })
        .lean();

      return res.status(200).json({
        success: true,
        data: todos,
      });

    } catch (error) {
      console.error("Get Todo Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== DELETE TODO ===== */
  deleteTodo: async (req, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.user.id;

      const filter = { _id: id, employeeId };

      const deleted = await Todo.findOneAndDelete(filter);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Not found or unauthorized",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Todo deleted",
      });

    } catch (error) {
      console.error("Delete Todo Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== COMPLETE TODO ===== */
  completeTodo: async (req, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.user.id;

      const filter = { _id: id, employeeId };

      const updated = await Todo.findOneAndUpdate(
        filter,
        {
          status: "completed",
          completedDate: new Date()
        },
        { new: true }
      );


      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Todo not found or unauthorized",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Todo completed",
        data: updated,
      });

    } catch (error) {
      console.error("Complete Todo Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== UPDATE TODO ===== */
  updateTodo: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, date, status } = req.body;
      const employeeId = req.user.id;

      if (!title || !description || !date || isNaN(new Date(date))) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
        });
      }

      const filter = { _id: id, employeeId };

      const updateData = { title, description, dueDate: date };
      if (status) {
        updateData.status = status;
        if (status === "completed") {
          updateData.completedDate = new Date();
        } else {
          updateData.completedDate = null;
        }
      }

      const updatedTodo = await Todo.findOneAndUpdate(
        filter,
        updateData,
        { new: true }
      );

      if (!updatedTodo) {
        return res.status(404).json({
          success: false,
          message: "Todo not found or unauthorized",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Todo updated",
        data: updatedTodo,
      });

    } catch (error) {
      console.error("Update Todo Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

};

module.exports = Todolist;

const apiLogger = require('../utils/apiLogger');
module.exports = apiLogger(module.exports, 'TodoController.js');
