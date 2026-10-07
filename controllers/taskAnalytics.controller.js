/**
 * Task Analytics Controller
 * Handles HTTP requests, authentication scoping, and returns standardized analytics responses.
 * Delegates all calculation logic to taskAnalytics.service.js.
 */

const taskAnalyticsService = require("../Services/taskAnalytics.service");

/**
 * Check if the authenticated user has Admin or HR privileges
 */
function isUserAdmin(req) {
  const role = req.user?.role?.toLowerCase() || "";
  const isHr = Boolean(req.user?.isHr);
  return role === "admin" || role === "superadmin" || isHr;
}

/**
 * GET /tasks/analytics/my-performance
 * Returns performance summary, rates, time & phase analysis for the logged-in employee.
 */
exports.getMyPerformance = async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await taskAnalyticsService.getEmployeePerformance(currentUserId, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET MY PERFORMANCE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/my-tasks
 * Returns individual task history and metrics for the logged-in employee with pagination.
 */
exports.getMyTasks = async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await taskAnalyticsService.getEmployeePerformance(currentUserId, req.query);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const startIndex = (page - 1) * limit;
    const paginatedTasks = result.tasks.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      success: true,
      tasks: paginatedTasks,
      total: result.tasks.length,
      page,
      limit,
      totalPages: Math.ceil(result.tasks.length / limit),
    });
  } catch (error) {
    console.error("GET MY TASKS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/employee/:employeeId
 * Returns detailed performance for a specific employee.
 * Accessible to Admin/HR, or to the employee themselves.
 */
exports.getEmployeePerformance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const currentUserId = String(req.user?._id || req.user?.id || "");
    const isAdmin = isUserAdmin(req);

    // If request comes from EmployeePerformanceModal which expects the legacy structure
    if (req.query.trendRange || req.headers["x-legacy-analytics"] === "true") {
      return taskAnalyticsService.getEmployeePerformanceDetailsLegacy(req, res);
    }

    // Role check: Normal employee can only view their own analytics
    if (!isAdmin && currentUserId !== String(employeeId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only view your own performance analytics",
      });
    }

    const result = await taskAnalyticsService.getEmployeePerformance(employeeId, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET EMPLOYEE PERFORMANCE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/admin/team
 * Admin-only team overview (completion, on-time rates, project and category breakdowns).
 */
exports.getAdminTeam = async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ success: false, message: "Access denied: Admin/HR privileges required" });
    }

    const result = await taskAnalyticsService.getTeamPerformance(req.query, req.user?.role, req.user?._id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET ADMIN TEAM ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/admin/employees
 * Admin-only ranked list of employees with transparent performance scores and confidence labels.
 */
exports.getAdminEmployees = async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ success: false, message: "Access denied: Admin/HR privileges required" });
    }

    const result = await taskAnalyticsService.getTeamPerformance(req.query, req.user?.role, req.user?._id);
    return res.status(200).json({
      success: true,
      rankedEmployees: result.rankedEmployees,
      total: result.rankedEmployees.length,
    });
  } catch (error) {
    console.error("GET ADMIN EMPLOYEES ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/admin/tasks
 * Admin-only task analytics list with pagination.
 */
exports.getAdminTasks = async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ success: false, message: "Access denied: Admin/HR privileges required" });
    }

    const legacyData = await taskAnalyticsService.getLegacyTaskAnalytics(
      req.query,
      req.user?.role,
      Boolean(req.user?.isHr),
      req.user?._id
    );

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const startIndex = (page - 1) * limit;
    const paginatedTasks = (legacyData.tasks || []).slice(startIndex, startIndex + limit);

    return res.status(200).json({
      success: true,
      tasks: paginatedTasks,
      total: legacyData.tasks?.length || 0,
      page,
      limit,
      totalPages: Math.ceil((legacyData.tasks?.length || 0) / limit),
    });
  } catch (error) {
    console.error("GET ADMIN TASKS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /tasks/analytics/trends
 * Returns daily/weekly/monthly performance trends over time.
 */
exports.getTrends = async (req, res) => {
  try {
    const granularity = req.query.granularity || "daily";
    const result = await taskAnalyticsService.getPerformanceTrends(req.query, granularity);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET TRENDS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Legacy Adapter: GET /creat/tasks/analytics and GET /creat/analytics
 * Preserves 100% of the existing API response structure expected by TaskAnalytics.jsx.
 */
exports.getTaskAnalyticsLegacy = async (req, res) => {
  try {
    const userRole = req.user?.role?.toLowerCase() || "";
    const isHr = Boolean(req.user?.isHr);
    const currentUserId = req.user?._id || req.user?.id;

    const data = await taskAnalyticsService.getLegacyTaskAnalytics(
      req.query,
      userRole,
      isHr,
      currentUserId
    );

    return res.status(200).json(data);
  } catch (error) {
    console.error("GET TASK ANALYTICS LEGACY ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
