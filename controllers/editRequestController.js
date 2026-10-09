const EditRequest = require("../Models/EditRequest");
const Employee = require("../Models/Employee");
const EmployeeDetails = require("../Models/EmployeeDetails");
const { notifyAdmins } = require("../utilities/notificationService");

/* =====================================================
   1. EMPLOYEE → SEND EDIT REQUEST
===================================================== */
exports.sendEditRequest = async (req, res) => {
  try {
    const employeeId = req.user._id;
    const { requestMessage, requestedFields } = req.body;

    if (!requestMessage?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Request message is required"
      });
    }

    if (!Array.isArray(requestedFields) || requestedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be requested"
      });
    }

    const pending = await EditRequest.findOne({
      employeeId,
      status: "pending"
    });

    if (pending) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending edit request"
      });
    }

    const employee = await Employee.findById(employeeId).select("name empId");
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const request = await EditRequest.create({
      employeeId,
      requestMessage: requestMessage.trim(),
      requestedFields,
      approvedFields: [],
      status: "pending"
    });

    // ✅ NOTIFY ADMINS
    await notifyAdmins(
      "New Profile Edit Request",
      `${employee.name} has requested to update their profile.`,
      { requestId: request._id.toString(), type: "PROFILE_EDIT" }
    );

    return res.status(201).json({
      success: true,
      message: "Edit request sent successfully",
      request
    });
  } catch (err) {
    console.error("sendEditRequest error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/* =====================================================
   2. ADMIN → GET ALL PENDING REQUESTS
===================================================== */
exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await EditRequest.find({ status: "pending" })
      .populate("employeeId", "name empId empIdString email picture photo profilePicture _id")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (err) {
    console.error("getPendingRequests error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =====================================================
   3. ADMIN → GET ALL REQUESTS (HISTORY)
===================================================== */
exports.getAllRequests = async (req, res) => {
  try {
    const requests = await EditRequest.find()
      .populate("employeeId", "name empId empIdString email picture photo profilePicture _id")
      .populate("actionBy", "name empId empIdString email _id")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (error) {
    console.error("❌ Get All Requests Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching requests"
    });
  }
};

/* =====================================================
   4. ADMIN → APPROVE / REJECT REQUEST (SECURE) - FIXED
===================================================== */
exports.updateRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, approvedFields = [], adminNote = "" } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'approved' or 'rejected'"
      });
    }

    const request = await EditRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found"
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Request already processed"
      });
    }

    request.actionBy = req.user._id;
    request.actionAt = new Date();
    request.adminNote = adminNote;

    /* ===== HANDLE APPROVAL ===== */
    if (status === "approved") {
      if (!Array.isArray(approvedFields) || approvedFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Approved fields are required when approving"
        });
      }

      //  Only allow fields that were actually requested
      const safeApprovedFields = approvedFields.filter(f =>
        request.requestedFields.includes(f)
      );

      if (safeApprovedFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Approved fields must be a subset of the requested fields"
        });
      }

      request.status = "approved";
      request.approvedFields = safeApprovedFields;

      // Invalidate other pending requests of same employee
      await EditRequest.updateMany(
        {
          employeeId: request.employeeId,
          _id: { $ne: request._id },
          status: "pending"
        },
        { status: "used" }
      );


    } else {
      // 🔥 REJECT → DIRECTLY CLOSE
      request.status = "used";

    }

    await request.save();


    return res.json({
      success: true,
      message: `Request ${status} successfully`,
      request
    });
  } catch (err) {
    console.error("❌ updateRequestStatus error:", err);
    console.error("❌ Stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error"
    });
  }
};

/* =====================================================
   5. EMPLOYEE → CAN EDIT PROFILE CHECK
   ✅ FIX: Check approved request FIRST before isFirstTime.
      Previously, isFirstTime check fired first and returned
      allowedFields: [] bypassing the approved request logic.
      Now approved request is always checked first so employees
      with admin-approved fields always get them regardless of
      isProfileCompleted flag.
===================================================== */
exports.canEditProfile = async (req, res) => {
  try {
    const employeeId = req.user._id;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        canEdit: false,
        message: "Employee not found",
      });
    }

    /* =========================
       1. CHECK APPROVED REQUEST FIRST (highest priority)
       Must come before isFirstTime so that employees with
       an admin-approved request always receive their
       allowedFields, even if isProfileCompleted is still false.
    ========================= */
    const approvedRequest = await EditRequest.findOne({
      employeeId,
      status: "approved",
    }).sort({ actionAt: -1 });

    if (approvedRequest) {
      return res.json({
        success: true,
        canEdit: true,
        allowedFields: approvedRequest.approvedFields || [],
        message: "Edit request approved",
      });
    }

    const details = await EmployeeDetails.findOne({ empId: employeeId });
    if (details && details.profileApprovalStatus === "rejected") {
      return res.json({
        success: true,
        canEdit: true,
        isRejected: true,
        profileApprovalStatus: "rejected",
        rejectionRemark: details.rejectionRemark || "",
        rejectedFields: details.rejectedFields || [],
        allowedFields: details.rejectedFields && details.rejectedFields.length > 0 ? details.rejectedFields : [],
        message: details.rejectionRemark || "Profile rejected by admin",
      });
    }

    if (details && details.profileApprovalStatus === "pending") {
      return res.json({
        success: true,
        canEdit: false,
        isPendingApproval: true,
        profileApprovalStatus: "pending",
        message: "Profile is pending Admin review and approval",
      });
    }

    /* =========================
       2. FIRST TIME USER
       Only reaches here if no approved request exists.
    ========================= */
    if (employee.isProfileCompleted === false || !employee.profileCompletedAt) {
      return res.json({
        success: true,
        canEdit: true,
        allowedFields: [],
        isFirstTime: true,
        message: "First-time profile setup",
      });
    }

    /* =========================
       3. CHECK PENDING
    ========================= */
    const pendingRequest = await EditRequest.findOne({
      employeeId,
      status: "pending",
    });

    if (pendingRequest) {
      return res.json({
        success: true,
        canEdit: false,
        hasPendingRequest: true,
        message: "Request pending",
      });
    }

    /* =========================
       4. CHECK USED / REJECTED
    ========================= */
    const usedRequest = await EditRequest.findOne({
      employeeId,
      status: "used",
    }).sort({ actionAt: -1 });

    if (usedRequest) {
      return res.json({
        success: true,
        canEdit: false,
        wasRejected: true,
        message: "Request already used",
      });
    }

    /* =========================
       5. DEFAULT (LOCKED)
    ========================= */
    return res.json({
      success: true,
      canEdit: false,
      message: "Profile locked. Submit edit request.",
    });

  } catch (err) {
    console.error("canEditProfile error:", err);
    return res.status(500).json({
      success: false,
      canEdit: false,
      message: "Server error",
    });
  }
};

/* =====================================================
   6. EMPLOYEE → GET MY REQUEST HISTORY
===================================================== */
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await EditRequest.find({
      employeeId: req.user._id
    })
      .populate("employeeId", "name empId empIdString email _id")
      .populate("actionBy", "name empId empIdString")
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (error) {
    console.error("❌ Get My Requests Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/* =====================================================
   7. EMPLOYEE → MARK REQUEST AS USED (AFTER SUCCESSFUL SAVE)
===================================================== */
exports.markRequestUsed = async (req, res) => {
  try {
    const employeeId = req.user._id;
    // Find the latest APPROVED request for this employee
    const request = await EditRequest.findOne({
      employeeId,
      status: "approved"
    }).sort({ createdAt: -1 });

    if (!request) {
      return res.status(200).json({
        success: true,
        message: "No approved request found to mark as used"
      });
    }

    // Mark it as "used" - one-time edit completed
    request.status = "used";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Edit request marked as used successfully"
    });
  } catch (error) {
    console.error("❌ Mark Request Used Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while marking request as used"
    });
  }
};