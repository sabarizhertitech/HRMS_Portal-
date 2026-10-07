const MenuPermission = require("../Models/MenuPermission");
const Employee = require("../Models/Employee");

const MenuPermissionController = {
  // Save permission
  savePermission: async (req, res) => {
    try {
      const { employeeId, menus, isApprover } = req.body;
      if (!employeeId) {
        return res.status(400).json({ message: "Employee ID is required" });
      }

      // Check if permission already exists for this employee
      let existing = await MenuPermission.findOne({ employeeId });
      if (existing) {
        existing.menus = menus || [];
        existing.isApprover = isApprover || false;
        await existing.save();
        return res.status(200).json({ success: true, message: "Permissions updated successfully", data: existing });
      }

      const newPermission = new MenuPermission({
        employeeId,
        menus: menus || [],
        isApprover: isApprover || false
      });

      await newPermission.save();
      return res.status(201).json({ success: true, message: "Permissions saved successfully", data: newPermission });
    } catch (error) {
      console.error("Error in savePermission:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // Update permission
  updatePermission: async (req, res) => {
    try {
      const { empId } = req.params;
      const { menus, isApprover } = req.body;

      let permission = await MenuPermission.findOne({ employeeId: empId });
      if (!permission) {
        // Fallback: create if it doesn't exist
        permission = new MenuPermission({
          employeeId: empId,
          menus: menus || [],
          isApprover: isApprover || false
        });
      } else {
        permission.menus = menus || [];
        if (isApprover !== undefined) {
          permission.isApprover = isApprover;
        }
      }

      await permission.save();
      return res.status(200).json({ success: true, message: "Permissions updated successfully", data: permission });
    } catch (error) {
      console.error("Error in updatePermission:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // Get permission for an employee
  getPermission: async (req, res) => {
    try {
      const { empId } = req.params;
      const permission = await MenuPermission.findOne({ employeeId: empId });
      return res.status(200).json({ success: true, data: permission || { employeeId: empId, menus: [], isApprover: false } });
    } catch (error) {
      console.error("Error in getPermission:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // Get all permissions
  getAllPermissions: async (req, res) => {
    try {
      // Find all employees, then find their permissions
      const employees = await Employee.find({ employmentStatus: "active", workingStatus: true }).select("name empId department role");
      const permissions = await MenuPermission.find({});

      // Map permissions to employees
      const data = employees.map(emp => {
        const perm = permissions.find(p => String(p.employeeId) === String(emp._id));
        return {
          employeeId: emp._id,
          employeeName: emp.name,
          empId: emp.empId,
          department: emp.department,
          role: emp.role,
          menus: perm ? perm.menus : [],
          isApprover: perm ? perm.isApprover : false
        };
      });

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error("Error in getAllPermissions:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // Get all approvers
  getApprovers: async (req, res) => {
    try {
      const employees = await Employee.find({ employmentStatus: "active", workingStatus: true }).select("name empId department role");
      const permissions = await MenuPermission.find({ isApprover: true });
      
      const approverIds = permissions.map(p => String(p.employeeId));
      const approvers = employees.filter(emp => emp.role === 'admin' || approverIds.includes(String(emp._id)));
      
      return res.status(200).json({ success: true, data: approvers });
    } catch (error) {
      console.error("Error in getApprovers:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  },

  // Delete permission
  deletePermission: async (req, res) => {
    try {
      const { empId } = req.params;
      await MenuPermission.deleteOne({ employeeId: empId });
      return res.status(200).json({ success: true, message: "Permissions deleted successfully" });
    } catch (error) {
      console.error("Error in deletePermission:", error);
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
};

module.exports = MenuPermissionController;
