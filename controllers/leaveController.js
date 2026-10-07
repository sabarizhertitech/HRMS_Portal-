const LeaveRequest = require("../Models/LeaveRequest");
const Employee = require("../Models/Employee");
const LeaveCategory = require("../Models/LeaveCategory");
const LeaveBalance = require("../Models/LeaveBalance");
const mongoose = require("mongoose");
const Attendance = require("../Models/Attendance.model");
const getCachedSignedUrl = require("../utilities/s3CachedUrl");
const { notifyAdmins, sendPushNotification } = require("../utilities/notificationService");
const { sendLeaveRequestEmail } = require("../utilities/emailService");
const moment = require("moment-timezone");

const apiLogger = require('../utils/apiLogger');
const Notification = require("../Models/Notification");

const PermissionRequest = require("../Models/PermissionRequest");
const { isEmployeeInProbation } = require("../utilities/probationHelper");
const { calculateServiceMonths, calculateCategoryLeaves } = require("../utilities/financialYearUtil");
const { createLog } = require("../utilities/logService");

const getCurrentFinancialYear = (date = new Date()) => {
  const d = new Date(date);
  const month = d.getMonth(); // 0-indexed: 0 is Jan, 3 is April
  const year = d.getFullYear();
  if (month >= 3) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};

// POST /api/leaves - Create Leave or WFH Request
const createRequest = async (req, res) => {
  try {
    const {
      requestType, // "leave" or "wfh"
      leaveType,
      otherLeaveType,
      dayType,
      fromDate,
      toDate,
      startTime,
      endTime,
      noOfDays,
      reasonType,
      otherReason,
      detailedReason,
    } = req.body;

    const userId = req.user.id;

    // ✅ Validate required fields
    if (!requestType || !dayType || !fromDate || !reasonType) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
        required: ["requestType", "dayType", "fromDate", "reasonType"],
      });
    }

    // ─── STEP 4: Only "leave" and "wfh" are valid — "permission" removed ───
    if (!["leave", "wfh"].includes(requestType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request type. Must be 'leave' or 'wfh'",
      });
    }

    // ✅ Leave type required for leave request
    if (requestType === "leave" && !leaveType) {
      return res.status(400).json({
        success: false,
        message: "Leave type is required",
      });
    }

    // ✅ Validate leave type
    let category = null;

    if (requestType === "leave") {

      // Others is a custom leave type
      if (leaveType === "Others") {

        if (!otherLeaveType || !otherLeaveType.trim()) {
          return res.status(400).json({
            success: false,
            message: "Please enter Other Leave Type",
          });
        }

      } else {

        const year = getCurrentFinancialYear(fromDate);
        const doc = await LeaveCategory.findOne({ financialYear: year });

        if (doc && doc.categories) {
          category = doc.categories.find(
            cat => cat.name.toLowerCase() === leaveType.toLowerCase()
          );
        }

        if (!category) {
          return res.status(400).json({
            success: false,
            message: `Invalid leave type '${leaveType}' for financial year ${year}`,
          });
        }

      }

    }

    const employee = await Employee.findById(userId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // ─── Probation & Gender Validation ───
    const inProbation = isEmployeeInProbation(employee);

    if (requestType === "leave" && leaveType && leaveType !== "Others") {
      const normLeaveType = leaveType.toLowerCase();
      const empGender = (employee.gender || "male").toLowerCase();

      if (normLeaveType.includes("maternity") && empGender !== "female") {
        return res.status(400).json({
          success: false,
          message: "Maternity Leave is applicable for female employees only.",
        });
      }

      if (normLeaveType.includes("paternity") && empGender !== "male") {
        return res.status(400).json({
          success: false,
          message: "Paternity Leave is applicable for male employees only.",
        });
      }


    }

    const joiningDate = new Date(employee.dateJoined);
    const currentDate = new Date();

    const serviceMonths =
      (currentDate.getFullYear() - joiningDate.getFullYear()) * 12 +
      (currentDate.getMonth() - joiningDate.getMonth());

    const employeeType = employee.status;

    let allowedLeaves = 0;
    let minRequiredMonths = 0;

    if (leaveType !== "Others") {
      allowedLeaves = calculateCategoryLeaves(category, serviceMonths, inProbation);
      if (category && category.tiers && category.tiers.length > 0) {
        minRequiredMonths = category.tiers[category.tiers.length - 1].eligibleMonths;
      } else {
        minRequiredMonths = category ? (category.eligibleMonths || 0) : 0;
      }
    }

    // ✅ Minimum Service Eligibility
    if (
      requestType === "leave" &&
      leaveType !== "Others" &&
      minRequiredMonths > 0 &&
      serviceMonths < minRequiredMonths
    ) {
      return res.status(400).json({
        success: false,
        message: `Minimum ${minRequiredMonths} months service required for ${category.name}`,
      });
    }


    // ✅ Employee leave eligibility
    if (
      requestType === "leave" &&
      leaveType !== "Others"
    ) {
      if (allowedLeaves === 0) {
        return res.status(400).json({
          success: false,
          message: "You are not eligible for this leave type",
        });
      }
    }

    // ================= HALF DAY OFFICE TIME VALIDATION =================
    if (
      requestType === "leave" &&
      dayType === "Half Day"
    ) {

      if (!startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: "Start Time and End Time are required for Half Day Leave",
        });
      }

      const OFFICE_START = "10:00";
      const OFFICE_END = "18:30";

      if (startTime < OFFICE_START) {
        return res.status(400).json({
          success: false,
          message: "Half Day Leave cannot start before 10:00 AM",
        });
      }

      if (endTime > OFFICE_END) {
        return res.status(400).json({
          success: false,
          message: "Half Day Leave cannot end after 6:30 PM",
        });
      }

      if (startTime >= endTime) {
        return res.status(400).json({
          success: false,
          message: "End Time must be greater than Start Time",
        });
      }

    }

    // ✅ Prevent overlapping leave requests
    const overlappingLeave = await LeaveRequest.findOne({
      employeeId: employee._id,
      status: {
        $in: ["Pending", "Approved"],
      },
      $or: [
        {
          fromDate: { $lte: toDate },
          toDate: { $gte: fromDate },
        },
      ],
    });

    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: "Leave request already exists for selected dates",
      });
    }

    // ✅ Sick Leave medical proof validation
    if (
      requestType === "leave" &&
      leaveType === "SL" &&
      noOfDays > 2 &&
      !req.file
    ) {
      return res.status(400).json({
        success: false,
        message: "Medical certificate required for sick leave above 2 days",
      });
    }

    let finalLeaveDates = Array.isArray(req.body.leaveDates) && req.body.leaveDates.length > 0
      ? req.body.leaveDates
      : [];

    if (finalLeaveDates.length === 0 && fromDate) {
      if (dayType === "Half Day") {
        const startStr = moment(fromDate).tz("Asia/Kolkata").format("YYYY-MM-DD");
        finalLeaveDates = [startStr];
      } else {
        const start = moment(fromDate).tz("Asia/Kolkata");
        const end = moment(toDate || fromDate).tz("Asia/Kolkata");
        let curr = start.clone();
        while (!curr.isAfter(end, "day")) {
          finalLeaveDates.push(curr.format("YYYY-MM-DD"));
          curr.add(1, "day");
        }
      }
    }

    const request = await LeaveRequest.create({
      employeeId: employee._id,
      employeeName: employee.name,
      designation: employee.designation,
      requestType,
      leaveType: leaveType || null,
      otherLeaveType: (otherLeaveType && otherLeaveType.trim()) ? otherLeaveType.trim() : undefined,
      dayType,
      fromDate,
      toDate,
      startTime: (startTime && startTime.trim()) ? startTime.trim() : undefined,
      endTime: (endTime && endTime.trim()) ? endTime.trim() : undefined,
      noOfDays,
      reasonType,
      otherReason: (otherReason && otherReason.trim()) ? otherReason.trim() : undefined,
      detailedReason: (detailedReason && detailedReason.trim()) ? detailedReason.trim() : undefined,
      leaveDates: finalLeaveDates,
      status: "Pending",
    });

    // ─── STEP 5: Removed "permission" label block ───
    // requestLabel is now only "Leave" or "WFH"
    let requestLabel = "Leave";

    if (requestType === "wfh") {
      requestLabel = "WFH";
    }

    const notificationTitle = `New ${requestLabel} Request`;
    const notificationMessage = `${employee.name} has requested ${requestType} from ${new Date(fromDate).toLocaleDateString()}.`;

    await notifyAdmins(
      notificationTitle,
      notificationMessage,
      { requestId: request._id.toString(), type: requestType }
    );

    // Save in-app notification for Admins
    await new Notification({
      type:
        requestType === "leave"
          ? "LEAVE_REQUEST"
          : "WFH_REQUEST",
      fromEmployee: employee._id,
      toAdmin: true,
      title: notificationTitle,
      message: notificationMessage,
      metadata: {
        ticketId: request._id.toString(),
        requestType: requestType,
      },
    }).save();

    // ─── ADDED: Notify the employee that their request was sent successfully ───
    const employeeTitle = `${requestLabel} Request Sent`;
    const employeeMessage = `Your ${requestType} request from ${new Date(fromDate).toLocaleDateString()} has been sent to the Admin successfully.`;

    // Send Push Notification to Employee
    await sendPushNotification(employee._id, employeeTitle, employeeMessage, {
      requestId: request._id.toString(),
      type: requestType
    });

    // Save in-app notification for Employee
    await new Notification({
      type: requestType === "leave" ? "LEAVE_REQUEST" : "WFH_REQUEST",
      toEmployee: employee._id,
      title: employeeTitle,
      message: employeeMessage,
      metadata: {
        ticketId: request._id.toString(),
        requestType: requestType,
      },
    }).save();

    res.status(201).json({
      success: true,
      message:
        requestType === "leave"
          ? "Leave requested successfully"
          : "WFH requested successfully",
      data: request,
    });

    // Fire email asynchronously after response is sent
    sendLeaveRequestEmail(employee, request, "create").catch(err => {
      console.error("[LeaveController] Async email error on leave creation:", err);
    });

  } catch (err) {
    console.error("Create request error:", err);
    res.status(500).json({
      success: false,
      message: "Server error creating request",
    });
  }
};

// GET /api/leaves - Get My Leave Requests (with filters)
const getMyLeaves = async (req, res) => {
  try {
    const { status, requestType, notify } = req.query;
    const userId = req.user.id;

    const initialMatch = {
      employeeId: new mongoose.Types.ObjectId(userId),
    };

    // ✅ If called with ?notify=true, filter unnotified approved/rejected leaves in DB
    if (notify === "true") {
      initialMatch.isNotified = false;
      initialMatch.status = { $in: ["Approved", "Rejected", "Leave Cancel"] };
    }

    const pipeline = [
      { $match: initialMatch },
    ];

    // ✅ Filter by Status (when not in notify mode)
    if (!notify && status && status !== "All") {
      pipeline.push({
        $match: { status },
      });
    }

    // ✅ Filter by Request Type (leave / wfh)
    if (requestType && requestType !== "All") {
      pipeline.push({
        $match: { requestType },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "employees",
          localField: "employeeId",
          foreignField: "_id",
          as: "employeeDetails",
        },
      },
      {
        $unwind: {
          path: "$employeeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          employeeId: 1,
          employeeName: 1,
          designation: 1,
          requestType: 1,
          leaveType: 1,
          otherLeaveType: 1,
          dayType: 1,
          fromDate: 1,
          toDate: 1,
          startTime: 1,
          endTime: 1,
          noOfDays: 1,
          reasonType: 1,
          otherReason: 1,
          detailedReason: 1,
          remark: 1,
          leaveDates: 1,
          status: 1,
          isNotified: 1,
          createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
          updatedAt: { $ifNull: ["$updatedAt", { $toDate: "$_id" }] },
          employee: {
            _id: "$employeeDetails._id",
            name: "$employeeDetails.name",
            empId: "$employeeDetails.empId",
            department: "$employeeDetails.department",
            designation: "$employeeDetails.designation",
            photo: "$employeeDetails.photo",
          },
        },
      },
      { $sort: { createdAt: -1 } }
    );

    const requests = await LeaveRequest.aggregate(pipeline);

    const updatedRequests = await Promise.all(
      requests.map(async (r) => {
        if (r.employee?.photo) {
          r.employee.avatar = await getCachedSignedUrl(r.employee.photo);
        }
        return r;
      })
    );

    res.json({
      success: true,
      message: "Requests fetched successfully",
      data: updatedRequests,
    });
  } catch (err) {
    console.error("Get requests error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching requests",
    });
  }
};

// GET MY PERMISSIONS - Employee fetches their own permission requests
const getMyPermissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const matchStage = {
      employeeId: new mongoose.Types.ObjectId(userId),
    };

    // Optional status filter (PENDING / APPROVED / REJECTED)
    if (status && status !== "All") {
      matchStage.status = status.toUpperCase();
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "employees",
          localField: "employeeId",
          foreignField: "_id",
          as: "employeeDetails",
        },
      },
      {
        $unwind: {
          path: "$employeeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          employeeId: 1,
          from: 1,
          to: 1,
          reason: 1,
          status: 1,
          permissionMode: 1,
          rejectReason: 1,
          permissionType: 1,
          createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
          updatedAt: { $ifNull: ["$updatedAt", { $toDate: "$_id" }] },
          employee: {
            _id: "$employeeDetails._id",
            name: "$employeeDetails.name",
            empId: "$employeeDetails.empId",
            department: "$employeeDetails.department",
            designation: "$employeeDetails.designation",
            photo: "$employeeDetails.photo",
          },
        },
      },
      { $sort: { createdAt: -1 } }
    ];

    const requests = await PermissionRequest.aggregate(pipeline);

    // Get signed URL for photo if present
    const updatedRequests = await Promise.all(
      requests.map(async (r) => {
        if (r.employee?.photo) {
          r.employee.avatar = await getCachedSignedUrl(r.employee.photo);
        }
        return r;
      })
    );

    // Normalize fields so the FE table (which expects fromDate, startTime, endTime) works
    const normalized = updatedRequests.map((r) => {
      const fromDate = r.from
        ? r.from.toISOString().slice(0, 10)
        : null;

      const startTime = r.from
        ? r.from.toISOString().slice(11, 16)
        : null;

      const endTime = r.to
        ? r.to.toISOString().slice(11, 16)
        : null;

      const durationMinutes =
        r.from && r.to
          ? Math.floor(
            (new Date(r.to) - new Date(r.from)) /
            (1000 * 60)
          )
          : 0;

      return {
        ...r,

        requestType: "permission",

        fromDate,

        toDate: fromDate,

        startTime,

        endTime,

        reasonType:
          r.permissionType || "Permission",

        detailedReason:
          r.reason || "",

        permissionType:
          r.permissionType || "",

        noOfDays:
          durationMinutes,

        dayType:
          "Permission",
      };
    });

    res.json({
      success: true,
      message: "Permission requests fetched successfully",
      data: normalized,
    });
  } catch (err) {
    console.error("getMyPermissions error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching permission requests",
    });
  }
};

// UPDATE LEAVE - Employee updates pending request
const updateLeave = async (req, res) => {
  try {
    const {
      leaveType,
      otherLeaveType,
      dayType,
      fromDate,
      toDate,
      startTime,
      endTime,
      noOfDays,
      reasonType,
      otherReason,
      detailedReason,
    } = req.body;

    const { id } = req.params;

    const request = await LeaveRequest.findOne({
      _id: id,
      employeeId: req.user.id,
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // ✅ Only Pending can be updated
    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Only pending ${request.requestType} requests can be updated`,
      });
    }

    // ✅ If it's a leave request, perform eligibility and validation checks
    if (request.requestType === "leave") {
      const finalLeaveType = leaveType !== undefined ? leaveType : request.leaveType;
      const finalFromDate = fromDate !== undefined ? fromDate : request.fromDate;

      if (!finalLeaveType) {
        return res.status(400).json({
          success: false,
          message: "Leave type is required",
        });
      }

      let category = null;

      if (finalLeaveType === "Others") {
        if (!otherLeaveType || !otherLeaveType.trim()) {
          return res.status(400).json({
            success: false,
            message: "Please enter Other Leave Type",
          });
        }
      } else {
        const year = getCurrentFinancialYear(finalFromDate);
        const doc = await LeaveCategory.findOne({ financialYear: year });

        if (doc && doc.categories) {
          category = doc.categories.find(
            (cat) => cat.name.toLowerCase() === finalLeaveType.toLowerCase()
          );
        }

        if (!category) {
          return res.status(400).json({
            success: false,
            message: `Invalid leave type '${finalLeaveType}' for financial year ${year}`,
          });
        }
      }

      const employee = await Employee.findById(req.user.id);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const joiningDate = new Date(employee.dateJoined);
      const currentDate = new Date();
      const serviceMonths =
        (currentDate.getFullYear() - joiningDate.getFullYear()) * 12 +
        (currentDate.getMonth() - joiningDate.getMonth());
      const employeeType = employee.status;

      let allowedLeaves = 0;
      let minRequiredMonths = 0;

      if (finalLeaveType !== "Others") {
        if (category.tiers && category.tiers.length > 0) {
          const matchedTier = category.tiers.find(t => serviceMonths >= t.eligibleMonths);
          if (matchedTier) allowedLeaves = matchedTier.leaveCount;
          minRequiredMonths = category.tiers[category.tiers.length - 1].eligibleMonths;
        } else {
          allowedLeaves = category.leaveCount || 0;
          minRequiredMonths = category.eligibleMonths || 0;
        }
      }

      // ✅ Minimum Service Eligibility
      if (
        finalLeaveType !== "Others" &&
        minRequiredMonths > 0 &&
        serviceMonths < minRequiredMonths
      ) {
        return res.status(400).json({
          success: false,
          message: `Minimum ${minRequiredMonths} months service required for ${category.name}`,
        });
      }

      // ✅ Employee leave eligibility
      if (
        finalLeaveType !== "Others" &&
        allowedLeaves === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "You are not eligible for this leave type",
        });
      }

      // ✅ Sick Leave medical proof validation on update
      const isSickLeave = finalLeaveType && (finalLeaveType.toLowerCase() === "sick leave" || finalLeaveType === "SL");
      const finalNoOfDays = noOfDays !== undefined ? noOfDays : request.noOfDays;
      if (isSickLeave && finalNoOfDays > 2 && !req.file && !request.medicalCertificate) {
        return res.status(400).json({
          success: false,
          message: "Medical certificate required for sick leave above 2 days",
        });
      }
    }

    // ================= HALF DAY OFFICE TIME VALIDATION =================

    const finalDayType = dayType ?? request.dayType;
    const finalStartTime = startTime ?? request.startTime;
    const finalEndTime = endTime ?? request.endTime;

    if (
      request.requestType === "leave" &&
      finalDayType === "Half Day"
    ) {

      if (!finalStartTime || !finalEndTime) {
        return res.status(400).json({
          success: false,
          message: "Start Time and End Time are required for Half Day Leave",
        });
      }

      const OFFICE_START = "10:00";
      const OFFICE_END = "18:30";

      if (finalStartTime < OFFICE_START) {
        return res.status(400).json({
          success: false,
          message: "Half Day Leave cannot start before 10:00 AM",
        });
      }

      if (finalEndTime > OFFICE_END) {
        return res.status(400).json({
          success: false,
          message: "Half Day Leave cannot end after 6:30 PM",
        });
      }

      if (finalStartTime >= finalEndTime) {
        return res.status(400).json({
          success: false,
          message: "End Time must be greater than Start Time",
        });
      }

    }

    // ✅ Update fields
    if (leaveType !== undefined) request.leaveType = leaveType || null;
    request.otherLeaveType = (otherLeaveType && otherLeaveType.trim()) ? otherLeaveType.trim() : undefined;
    request.dayType = dayType;
    request.fromDate = fromDate;
    request.toDate = toDate;
    request.startTime = (startTime && startTime.trim()) ? startTime.trim() : undefined;
    request.endTime = (endTime && endTime.trim()) ? endTime.trim() : undefined;
    request.noOfDays = noOfDays;
    request.reasonType = reasonType;
    request.otherReason = (otherReason && otherReason.trim()) ? otherReason.trim() : undefined;
    request.detailedReason = (detailedReason && detailedReason.trim()) ? detailedReason.trim() : undefined;

    if (req.body.leaveDates && Array.isArray(req.body.leaveDates) && req.body.leaveDates.length > 0) {
      request.leaveDates = req.body.leaveDates;
    } else if (fromDate) {
      if (dayType === "Half Day") {
        request.leaveDates = [moment(fromDate).tz("Asia/Kolkata").format("YYYY-MM-DD")];
      } else {
        const start = moment(fromDate).tz("Asia/Kolkata");
        const end = moment(toDate || fromDate).tz("Asia/Kolkata");
        const dates = [];
        let curr = start.clone();
        while (!curr.isAfter(end, "day")) {
          dates.push(curr.format("YYYY-MM-DD"));
          curr.add(1, "day");
        }
        request.leaveDates = dates;
      }
    }

    await request.save();

    res.status(200).json({
      success: true,
      message:
        request.requestType === "leave"
          ? "Leave updated successfully"
          : "WFH updated successfully",
      data: request,
    });
  } catch (err) {
    console.error("Update request error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating request",
    });
  }
};

// UPDATE LEAVE STATUS - Admin/Manager approve/reject, Employee cancel
const updateLeaveStatus = async (req, res) => {
  try {
    const { status, remark } = req.body;

    const validStatuses = ["Pending", "Approved", "Rejected", "Cancelled"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const request = await LeaveRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // ✅ EMPLOYEE LOGIC (ONLY CANCEL)
    if (req.user.role === "employee") {
      if (status !== "Cancelled") {
        return res.status(403).json({
          success: false,
          message: "Employees can only cancel requests",
        });
      }

      if (request.status !== "Pending") {
        return res.status(400).json({
          success: false,
          message: "Only pending requests can be cancelled",
        });
      }
    }

    // ✅ ADMIN LOGIC (APPROVE / REJECT)
    if (req.user.role === "admin") {
      if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Admin can only approve or reject",
        });
      }
    }

    // ✅ UPDATE LEAVE BALANCE ON APPROVAL
    if (
      status === "Approved" &&
      request.status !== "Approved" &&
      request.requestType === "leave"
    ) {
      const employee = await Employee.findById(request.employeeId);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const leaveType = request.leaveType;

      // Others does not have a leave balance
      if (leaveType === "Others") {

        request.status = status;

        if (remark !== undefined) {
          request.remark = remark;
        }

        await request.save();

        return res.json({
          success: true,
          message: `${request.requestType.toUpperCase()} request ${status}`,
          data: request,
        });

      }
      const year = getCurrentFinancialYear(request.fromDate);

      let leaveBalDoc = await LeaveBalance.findOne({ employeeId: employee._id });
      if (!leaveBalDoc) {
        leaveBalDoc = new LeaveBalance({ employeeId: employee._id, leaveBalances: {} });
      }
      if (!leaveBalDoc.leaveBalances) {
        leaveBalDoc.leaveBalances = {};
      }
      if (!leaveBalDoc.leaveBalances[year]) {
        leaveBalDoc.leaveBalances[year] = {};
      }

      if (!leaveBalDoc.leaveBalances[year][leaveType]) {
        // Dynamically initialize from LeaveCategory if missing
        const leaveDoc = await LeaveCategory.findOne({ financialYear: year });
        if (leaveDoc && leaveDoc.categories) {
          const joiningDate = new Date(employee.dateJoined || employee.createdAt || new Date());
          const currentDate = new Date();
          const serviceMonths =
            (currentDate.getFullYear() - joiningDate.getFullYear()) * 12 +
            (currentDate.getMonth() - joiningDate.getMonth());

          leaveDoc.categories.forEach(category => {
            let allowedLeaves = 0;
            if (category.tiers && category.tiers.length > 0) {
              const matchedTier = category.tiers.find(t => serviceMonths >= t.eligibleMonths);
              allowedLeaves = matchedTier ? matchedTier.leaveCount : 0;
            } else {
              allowedLeaves = category.leaveCount || 0;
            }

            if (!leaveBalDoc.leaveBalances[year][category.name]) {
              leaveBalDoc.leaveBalances[year][category.name] = {
                total: allowedLeaves,
                used: 0,
                remaining: allowedLeaves,
              };
            }
          });
        }
      }

      if (!leaveBalDoc.leaveBalances[year][leaveType]) {
        return res.status(400).json({
          success: false,
          message: `Leave category '${leaveType}' not found in balances for year ${year}`,
        });
      }

      leaveBalDoc.leaveBalances[year][leaveType].used += request.noOfDays;
      leaveBalDoc.leaveBalances[year][leaveType].remaining -= request.noOfDays;

      // ✅ Required: Mongoose won't detect mutations in nested objects without this
      leaveBalDoc.markModified("leaveBalances");

      await leaveBalDoc.save();
    }

    request.status = status;
    if (remark !== undefined) request.remark = remark;

    // ✅ WFH → UPDATE ATTENDANCE (unchanged)
    if (status === "Approved" && request.requestType === "wfh") {
      const moment = require("moment-timezone");
      const Attendance = require("../Models/Attendance.model");

      const start = moment(request.fromDate).tz("Asia/Kolkata").startOf("day");
      const end = moment(request.toDate || request.fromDate)
        .tz("Asia/Kolkata")
        .startOf("day");

      let current = start.clone();

      while (!current.isAfter(end, "day")) {
        const dateStr = current.format("YYYY-MM-DD");

        const existingAttendance = await Attendance.findOne({
          employeeId: request.employeeId,
          date: dateStr,
        });

        let remarksText = "WFH";

        if (existingAttendance) {
          const isLate =
            existingAttendance.lateEntryCount > 0 ||
            (existingAttendance.remarks || "")
              .toLowerCase()
              .includes("late");

          if (isLate) {
            remarksText = "Persent - WFH";
          }
        }

        await Attendance.findOneAndUpdate(
          {
            employeeId: request.employeeId,
            date: dateStr,
          },
          {
            $set: {
              status: "Present",
              remarks: remarksText,
            },
            $setOnInsert: {
              employeeId: request.employeeId,
              date: dateStr,
            },
          },
          { upsert: true, new: true }
        );

        current.add(1, "day");
      }
    }

    // ✅ LEAVE APPROVED → UPDATE ATTENDANCE
    if (status === "Approved" && request.requestType === "leave") {
      const moment = require("moment-timezone");
      const Attendance = require("../Models/Attendance.model");

      const start = moment(request.fromDate).tz("Asia/Kolkata").startOf("day");
      const end = moment(request.toDate || request.fromDate)
        .tz("Asia/Kolkata")
        .startOf("day");

      let current = start.clone();

      while (!current.isAfter(end, "day")) {
        const dateStr = current.format("YYYY-MM-DD");
        const leaveStatus = request.dayType === "Half Day" ? "Half Day Leave" : "Leave";
        const remarksText = request.dayType === "Half Day" ? "Half Day Leave Approved" : "Leave Approved";

        await Attendance.findOneAndUpdate(
          {
            employeeId: request.employeeId,
            date: dateStr,
          },
          {
            $set: {
              status: leaveStatus,
              remarks: remarksText,
            },
            $setOnInsert: {
              employeeId: request.employeeId,
              date: dateStr,
            },
          },
          { upsert: true, new: true }
        );

        current.add(1, "day");
      }
    }

    // ─── STEP 8 & 9: Removed entire permission → Attendance block ───
    // Attendance never stores permission in the new design.
    // PermissionRequest is handled separately via its own controller.

    await request.save();

    // Fire email asynchronously after saving
    (async () => {
      try {
        const employeeObj = await Employee.findById(request.employeeId);
        const approverObj = req.user && req.user.id ? await Employee.findById(req.user.id) : null;
        if (employeeObj) {
          await sendLeaveRequestEmail(employeeObj, request, "status_update", approverObj);
        }
      } catch (err) {
        console.error("[LeaveController] Async email error on status update:", err);
      }
    })();

    // ✅ NOTIFY EMPLOYEE OF STATUS UPDATE
    if (["Approved", "Rejected"].includes(status)) {
      try {
        const Notification = require("../Models/Notification");

        // ─── STEP 9: No more "permission" label — only leave / wfh ───
        let requestLabel = "Leave";

        if (request.requestType === "wfh") {
          requestLabel = "WFH";
        }

        const title = `${requestLabel} Request ${status}`;
        const body = `Your ${request.requestType} request from ${new Date(request.fromDate).toLocaleDateString()} has been ${status.toLowerCase()}.`;

        await sendPushNotification(request.employeeId, title, body, {
          requestId: request._id.toString(),
          type: request.requestType,
          status: status,
        });

        // Save in-app notification for Employee
        await new Notification({
          type:
            request.requestType === "leave"
              ? `LEAVE_${status.toUpperCase()}`
              : `WFH_${status.toUpperCase()}`,
          toEmployee: request.employeeId,
          title: title,
          message: body,
          metadata: {
            ticketId: request._id.toString(),
            requestType: request.requestType,
          },
        }).save();

      } catch (pushErr) {
        console.error("[LeaveController] Error sending status update push:", pushErr);
      }
    }

    res.json({
      success: true,
      message: `${request.requestType.toUpperCase()} request ${status}`,
      data: request,
    });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating status",
    });
  }
};

// GET ALL LEAVE REQUESTS - Admin panel (All leaves)
const getAllRequestsAdmin = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { status } = req.query;

    const pipeline = [];

    // ✅ Filter by Status
    if (status && status !== "All") {
      pipeline.push({
        $match: { status },
      });
    }

    // ✅ Filter by requestType: "leave" only
    pipeline.push({
      $match: { requestType: "leave" },
    });

    pipeline.push(
      {
        $lookup: {
          from: "employees",
          localField: "employeeId",
          foreignField: "_id",
          as: "employeeDetails",
        },
      },
      {
        $unwind: {
          path: "$employeeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          requestType: 1,
          leaveType: 1,
          otherLeaveType: 1,
          dayType: 1,
          fromDate: 1,
          toDate: 1,
          startTime: 1,
          endTime: 1,
          noOfDays: 1,
          reasonType: 1,
          otherReason: 1,
          detailedReason: 1,
          status: 1,
          remark: 1,
          createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
          updatedAt: { $ifNull: ["$updatedAt", { $toDate: "$_id" }] },
          employee: {
            _id: "$employeeDetails._id",
            name: "$employeeDetails.name",
            empId: "$employeeDetails.empId",
            department: "$employeeDetails.department",
            designation: "$employeeDetails.designation",
            photo: "$employeeDetails.photo",
            email: "$employeeDetails.email",
            dateJoined: "$employeeDetails.dateJoined",
            probationPeriod: "$employeeDetails.probationPeriod",
            probationPeriodMonths: "$employeeDetails.probationPeriodMonths",
            isProbation: "$employeeDetails.isProbation",
            createdAt: "$employeeDetails.createdAt",
            leaveBalances: "$employeeDetails.leaveBalances",
          },
        },
      },
      { $sort: { createdAt: -1 } }
    );

    const requests = await LeaveRequest.aggregate(pipeline);
    const targetYear = getCurrentFinancialYear();
    const categoryDoc = await LeaveCategory.findOne({ financialYear: targetYear });
    const configuredCategories = categoryDoc ? categoryDoc.categories : [];

    const updatedRequests = await Promise.all(
      requests.map(async (r) => {
        if (r.employee?.photo) {
          r.employee.avatar = await getCachedSignedUrl(r.employee.photo);
        }

        if (r.employee && configuredCategories.length > 0) {
          const emp = r.employee;
          const leaveBalDoc = await LeaveBalance.findOne({ employeeId: emp._id });
          const empBalances = leaveBalDoc?.leaveBalances || {};
          const inProbation = isEmployeeInProbation(emp);
          const joiningDate = emp.dateJoined || emp.createdAt || new Date();
          const actualServiceMonths = calculateServiceMonths(joiningDate, new Date());

          const existingYearBal = empBalances[targetYear] ? { ...empBalances[targetYear] } : {};
          const dynamicBalances = {};

          configuredCategories.forEach((cat) => {
            const allowedLeaves = calculateCategoryLeaves(cat, actualServiceMonths, inProbation);
            const existingBal = existingYearBal[cat.name] || {};
            const used = existingBal.used || 0;
            dynamicBalances[cat.name] = {
              total: allowedLeaves,
              used,
              remaining: Math.max(0, allowedLeaves - used),
            };
          });

          r.employee.leaveBalances = {
            ...empBalances,
            [targetYear]: dynamicBalances,
          };
        }

        return r;
      })
    );

    res.status(200).json({
      success: true,
      message: "All leave requests fetched successfully",
      data: updatedRequests,
    });
  } catch (err) {
    console.error("Get all leaves error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching requests",
    });
  }
};

// GET ALL WFH REQUESTS - Admin panel (All WFH)
const getAllWFHRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { status } = req.query;

    const pipeline = [];

    // ✅ Filter by Status
    if (status && status !== "All") {
      pipeline.push({
        $match: { status },
      });
    }

    // ✅ Filter by requestType: "wfh" only
    pipeline.push({
      $match: { requestType: "wfh" },
    });

    pipeline.push(
      {
        $lookup: {
          from: "employees",
          localField: "employeeId",
          foreignField: "_id",
          as: "employeeDetails",
        },
      },
      {
        $unwind: {
          path: "$employeeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          requestType: 1,
          dayType: 1,
          fromDate: 1,
          toDate: 1,
          startTime: 1,
          endTime: 1,
          noOfDays: 1,
          reasonType: 1,
          otherReason: 1,
          detailedReason: 1,
          status: 1,
          remark: 1,
          createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
          updatedAt: { $ifNull: ["$updatedAt", { $toDate: "$_id" }] },
          employee: {
            _id: "$employeeDetails._id",
            name: "$employeeDetails.name",
            empId: "$employeeDetails.empId",
            department: "$employeeDetails.department",
            designation: "$employeeDetails.designation",
            photo: "$employeeDetails.photo",
            email: "$employeeDetails.email",
          },
        },
      },
      { $sort: { createdAt: -1 } }
    );

    const requests = await LeaveRequest.aggregate(pipeline);

    const updatedRequests = await Promise.all(
      requests.map(async (r) => {
        if (r.employee?.photo) {
          r.employee.avatar = await getCachedSignedUrl(r.employee.photo);
        }
        return r;
      })
    );

    res.status(200).json({
      success: true,
      message: "All WFH requests fetched successfully",
      data: updatedRequests,
    });
  } catch (err) {
    console.error("Get all WFH error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching WFH requests",
    });
  }
};

// ─── STEP 7: getAllPermissionRequests now queries PermissionRequest collection ───
const getAllPermissionRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const pipeline = [
      // ─── STEP 7: Replaced requestType:"permission" match with status-based match ───
      {
        $match: {
          status: {
            $in: [
              "PENDING",
              "APPROVED",
              "REJECTED",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "employees",
          localField: "employeeId",
          foreignField: "_id",
          as: "employeeDetails",
        },
      },
      {
        $unwind: {
          path: "$employeeDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,

          from: 1,

          to: 1,

          reason: 1,

          permissionType: 1,

          type: 1,
          status: 1,
          permissionMode: 1,
          remark: 1,
          createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] },
          updatedAt: { $ifNull: ["$updatedAt", { $toDate: "$_id" }] },
          employee: {
            _id: "$employeeDetails._id",
            name: "$employeeDetails.name",
            empId: "$employeeDetails.empId",
            department: "$employeeDetails.department",
            designation: "$employeeDetails.designation",
            photo: "$employeeDetails.photo",
          },
        }
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ];

    // ─── STEP 7: Query PermissionRequest instead of LeaveRequest ───
    const requests = await PermissionRequest.aggregate(pipeline);

    const updatedRequests = await Promise.all(
      requests.map(async (r) => {
        if (r.employee?.photo) {
          r.employee.avatar = await getCachedSignedUrl(r.employee.photo);
        }
        return r;
      })
    );

    return res.json({
      success: true,
      data: updatedRequests,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const updatePermissionStatus = async (req, res) => {
  try {
    const { status, remark } = req.body;

    const request =
      await PermissionRequest.findById(
        req.params.id
      );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Permission request not found",
      });
    }

    request.status =
      status.toUpperCase();

    request.remark = remark || "";

    await request.save();

    // ✅ UPDATE ATTENDANCE REMARKS RETROACTIVELY
    if (status.toUpperCase() === "APPROVED") {
      try {
        const moment = require("moment-timezone");
        const Attendance = require("../Models/Attendance.model");
        const dateStr = moment(request.from).tz("Asia/Kolkata").format("YYYY-MM-DD");

        await Attendance.findOneAndUpdate(
          {
            employeeId: request.employeeId,
            date: dateStr,
            remarks: "Informed Permission"
          },
          {
            $set: { remarks: "Approved Permission" }
          }
        );
      } catch (attErr) {
        console.error("[LeaveController] Error updating attendance remark for permission:", attErr);
      }
    }

    try {
      const title = `Permission Request ${status}`;
      const body = `Your permission request has been ${status.toLowerCase()}.`;

      await sendPushNotification(request.employeeId, title, body, {
        requestId: request._id.toString(),
        type: "permission",
        status: status,
      });

      await new Notification({
        type: `PERMISSION_${status.toUpperCase()}`,
        toEmployee: request.employeeId,
        title: title,
        message: body,
        metadata: {
          ticketId: request._id.toString(),
          requestType: "permission",
        },
      }).save();
    } catch (pushErr) {
      console.error("[LeaveController] Error sending permission status push:", pushErr);
    }

    return res.json({
      success: true,
      message: `Permission ${status}`,
      data: request,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// GET MY LEAVE BALANCE
const getMyLeaveBalance = async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id)
      .select("name designation gender isProbation probationPeriod probationPeriodMonths dateJoined");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const inProbation = isEmployeeInProbation(employee);
    const empGender = (employee.gender || "male").toLowerCase();

    let probationEndDate = null;
    if (employee.dateJoined && employee.probationPeriodMonths) {
      const joiningDate = new Date(employee.dateJoined);
      probationEndDate = new Date(joiningDate);
      probationEndDate.setMonth(probationEndDate.getMonth() + Number(employee.probationPeriodMonths));
    }

    const year = req.query.year || getCurrentFinancialYear();
    const categoryDoc = await LeaveCategory.findOne({ financialYear: year });
    const configuredCategories = categoryDoc ? categoryDoc.categories : [];

    const joiningDate = employee.dateJoined || new Date();
    const currentDate = new Date();
    const actualServiceMonths = calculateServiceMonths(joiningDate, currentDate);

    let serviceMonthsForQuota = actualServiceMonths;
    if (inProbation) {
      serviceMonthsForQuota = 0; // Probation tier configured by Admin (eligibleMonths = 0)
    } else {
      const probMonths = Number(employee.probationPeriodMonths) || 12;
      serviceMonthsForQuota = Math.max(actualServiceMonths, probMonths); // Permanent tier configured by Admin
    }

    const leaveBalDoc = await LeaveBalance.findOne({ employeeId: employee._id });
    const employeeBalances = leaveBalDoc?.leaveBalances && leaveBalDoc.leaveBalances[year]
      ? { ...leaveBalDoc.leaveBalances[year] }
      : {};

    const correctedBalances = {};

    configuredCategories.forEach((cat) => {
      const lowerName = cat.name.toLowerCase();

      // Filter gender-specific categories
      if (empGender !== "female" && lowerName.includes("maternity")) return;
      if (empGender !== "male" && lowerName.includes("paternity")) return;

      const allowedLeaves = calculateCategoryLeaves(cat, actualServiceMonths, inProbation);
      const existingBal = employeeBalances[cat.name] || {};
      const used = existingBal.used || 0;

      correctedBalances[cat.name] = {
        total: allowedLeaves,
        used,
        remaining: Math.max(0, allowedLeaves - used),
      };
    });

    // Count approved "Others" leave requests
    const othersUsedCount = await LeaveRequest.countDocuments({
      employeeId: employee._id,
      requestType: "leave",
      leaveType: "Others",
      status: "Approved",
    });

    // Add Others count to response
    correctedBalances["Others"] = {
      used: othersUsedCount,
    };

    return res.json({
      success: true,
      data: correctedBalances,
      inProbation,
      probationEndDate,
    });
  } catch (err) {
    console.error("Get leave balance error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching leave balances",
    });
  }
};

// ─── STEP 6: createPermissionRequest now saves to PermissionRequest model ───
const createPermissionRequest = async (req, res) => {
  try {
    const {
      fromDate,
      fromTime,
      toTime,
      reasonType,
      detailedReason,
      permissionType,   // MORNING | AFTERNOON | EVENING
    } = req.body;

    if (
      !fromDate ||
      !fromTime ||
      !toTime ||
      !detailedReason
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    // Validate permissionType if provided
    const VALID_PERMISSION_TYPES = ["MORNING", "AFTERNOON", "EVENING"];
    if (permissionType && !VALID_PERMISSION_TYPES.includes(permissionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid permissionType. Must be MORNING, AFTERNOON, or EVENING",
      });
    }

    const employee = await Employee.findById(req.user.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const from = new Date(`${fromDate}T${fromTime}:00`);
    const to = new Date(`${fromDate}T${toTime}:00`);

    if (to <= from) {
      return res.status(400).json({
        success: false,
        message: "To time must be greater than From time",
      });
    }

    // ─── Save to PermissionRequest with permissionType ───
    const request = await PermissionRequest.create({
      employeeId: employee._id,
      from,
      to,
      reason: detailedReason,
      status: "PENDING",
      ...(permissionType && { permissionType }),
    });

    createLog({
      category: "permission",
      referenceId: request._id,
      description: `${employee.name} (${employee.empId || employee.email}) requested permission for ${new Date(from).toLocaleDateString()} (${new Date(from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Reason: ${detailedReason}`,
    });

    await notifyAdmins(
      "New Permission Request",
      `${employee.name} submitted a permission request`,
      {
        permissionId:
          request._id.toString(),
      }
    );

    await new Notification({
      type: "PERMISSION_REQUEST",

      fromEmployee:
        employee._id,

      toAdmin: true,

      title:
        "New Permission Request",

      message:
        `${employee.name} submitted a permission request`,

      metadata: {
        ticketId:
          request._id.toString(),
        requestType:
          "permission",
      },
    }).save();

    // ─── ADDED: Notify the employee that their permission request was sent successfully ───
    const empTitle = "Permission Request Sent";
    const empMessage = `Your permission request for ${new Date(from).toLocaleDateString()} has been sent to the Admin successfully.`;

    await sendPushNotification(employee._id, empTitle, empMessage, {
      requestId: request._id.toString(),
      type: "permission"
    });

    await new Notification({
      type: "PERMISSION_REQUEST",
      toEmployee: employee._id,
      title: empTitle,
      message: empMessage,
      metadata: {
        ticketId: request._id.toString(),
        requestType: "permission",
      },
    }).save();

    return res.status(201).json({
      success: true,
      message: "Permission request submitted",
      data: request,
    });

  } catch (error) {
    console.error("createPermissionRequest", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const dismissLeaveNotification = async (req, res) => {
  try {
    const leaveId = req.params.id;
    const leave = await LeaveRequest.findById(leaveId);

    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave request not found" });
    }

    leave.isNotified = true;
    await leave.save();

    return res.status(200).json({ success: true, message: "Notification dismissed successfully" });
  } catch (error) {
    console.error("dismissLeaveNotification Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createRequest,
  getMyLeaves,
  getMyPermissions,
  getMyLeaveBalance,
  updateLeaveStatus,
  updatePermissionStatus,
  updateLeave,
  getAllRequestsAdmin,
  getAllPermissionRequests,
  getAllWFHRequests,
  createPermissionRequest,
  dismissLeaveNotification,
};

module.exports = apiLogger(module.exports, 'leaveController.js');