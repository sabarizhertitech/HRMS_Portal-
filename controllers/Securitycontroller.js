const SecurityRequest = require("../Models/Securityrequest");
const Notification = require("../Models/Notification");
const getCachedSignedUrl = require("../utilities/s3CachedUrl");
const Employee = require("../Models/Employee");
const nodemailer = require("nodemailer");
const { sendPushNotification } = require("../utilities/notificationService");
const mongoose = require("mongoose");
const { uploadToS3 } = require("../utilities/s3Upload");
const generateSignedUrl = require("../utilities/s3SignedUrl");
const { createLog } = require("../utilities/logService");

/**
 * Helper to compute changed fields for a security request before & after edit
 */
const buildSecurityRequestDiffs = async (oldReq, updates, newCheckers, newCcs, reqFiles = [], deletedFilesCount = 0) => {
  const changes = [];

  if (updates.title !== undefined && String(updates.title).trim() !== String(oldReq.title || "").trim()) {
    changes.push({
      fieldName: "Title",
      from: oldReq.title || "",
      to: updates.title.trim(),
    });
  }

  if (updates.description !== undefined && String(updates.description).trim() !== String(oldReq.description || "").trim()) {
    changes.push({
      fieldName: "Description",
      from: oldReq.description || "",
      to: updates.description.trim(),
    });
  }

  if (updates.requestType !== undefined && String(updates.requestType).trim() !== String(oldReq.requestType || "").trim()) {
    changes.push({
      fieldName: "Request Type",
      from: oldReq.requestType || "",
      to: updates.requestType.trim(),
    });
  }

  if (updates.dueDate !== undefined) {
    const oldDue = oldReq.dueDate ? new Date(oldReq.dueDate).toISOString().split("T")[0] : "";
    const newDue = updates.dueDate ? new Date(updates.dueDate).toISOString().split("T")[0] : "";
    if (oldDue !== newDue) {
      changes.push({
        fieldName: "Due Date",
        from: oldDue,
        to: newDue,
      });
    }
  }

  if (newCheckers !== undefined) {
    const oldCheckerIds = (oldReq.checkerId || []).map(c => String(c._id || c));
    const newCheckerIds = (newCheckers || []).map(c => String(c._id || c));
    const isChanged = oldCheckerIds.length !== newCheckerIds.length || oldCheckerIds.some(id => !newCheckerIds.includes(id));
    if (isChanged) {
      const oldEmployees = oldCheckerIds.length ? await Employee.find({ _id: { $in: oldCheckerIds } }).select("name") : [];
      const newEmployees = newCheckerIds.length ? await Employee.find({ _id: { $in: newCheckerIds } }).select("name") : [];
      const oldNames = oldEmployees.map(e => e.name).filter(Boolean).join(", ") || "None";
      const newNames = newEmployees.map(e => e.name).filter(Boolean).join(", ") || "None";
      changes.push({
        fieldName: "Approvers",
        from: oldNames,
        to: newNames,
      });
    }
  }

  if (newCcs !== undefined) {
    const oldCcIds = (oldReq.ccId || []).map(c => String(c._id || c));
    const newCcIds = (newCcs || []).map(c => String(c._id || c));
    const isChanged = oldCcIds.length !== newCcIds.length || oldCcIds.some(id => !newCcIds.includes(id));
    if (isChanged) {
      const oldEmployees = oldCcIds.length ? await Employee.find({ _id: { $in: oldCcIds } }).select("name") : [];
      const newEmployees = newCcIds.length ? await Employee.find({ _id: { $in: newCcIds } }).select("name") : [];
      const oldNames = oldEmployees.map(e => e.name).filter(Boolean).join(", ") || "None";
      const newNames = newEmployees.map(e => e.name).filter(Boolean).join(", ") || "None";
      changes.push({
        fieldName: "CC",
        from: oldNames,
        to: newNames,
      });
    }
  }

  if (deletedFilesCount > 0) {
    changes.push({
      fieldName: "Files",
      from: `${deletedFilesCount} file(s)`,
      to: "Deleted",
    });
  }

  if (reqFiles && reqFiles.length > 0) {
    changes.push({
      fieldName: "Files",
      from: "None",
      to: `Uploaded ${reqFiles.length} new file(s)`,
    });
  }

  return changes;
};



const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendApproverMail = async (to, makerName, checkerName, request, ccEmail = null) => {
  try {

    const mailOptions = {
      from: `"Ertitech HR-Portal" <${process.env.EMAIL_USER}>`,
      to,
      subject: `New Ticket Request - ${request.ticketId}`,
      html: `
        <h2>New Ticket Request</h2>
        <p>Dear ${checkerName},</p>
        <p>A new request has been assigned to you for approval.</p>

        <table border="1" cellpadding="8" cellspacing="0">
          <tr><td><b>Ticket ID</b></td><td>${request.ticketId}</td></tr>
          <tr><td><b>Title</b></td><td>${request.title}</td></tr>
          <tr><td><b>Type</b></td><td>${request.requestType}</td></tr>
          <tr><td><b>Requested By</b></td><td>${makerName}</td></tr>
          <tr><td><b>Due Date</b></td><td>${new Date(request.dueDate).toDateString()}</td></tr>
        </table>

        <p>Please login to portal and take action.</p>

        <br/>
        <p>Regards,<br/>Ertitech HR-Portal</p>
      `,
    };

    if (ccEmail) {
      mailOptions.cc = ccEmail;
    }

    await transporter.sendMail(mailOptions);

  } catch (err) {
    console.error("❌ [MAIL] Approver mail failed:", err.message);
  }
};


const sendDecisionMail = async (
  to,
  makerName,
  checkerName,
  request,
  status,
  remark = ""
) => {
  try {

    await transporter.sendMail({
      from: `"Ertitech HR-Portal" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Ticket Request ${status} - ${request.ticketId}`,
      html: `
        <h2>Ticket Request ${status}</h2>

        <p>Dear ${makerName},</p>

        <p>Your request has been <b>${status}</b>.</p>

        <table border="1" cellpadding="8" cellspacing="0">
          <tr><td><b>Ticket ID</b></td><td>${request.ticketId}</td></tr>
          <tr><td><b>Title</b></td><td>${request.title}</td></tr>
          <tr><td><b>Type</b></td><td>${request.requestType}</td></tr>
          <tr><td><b>Approver</b></td><td>${checkerName}</td></tr>
          <tr><td><b>Status</b></td><td>${status}</td></tr>
          ${remark
          ? `<tr><td><b>Remark</b></td><td>${remark}</td></tr>`
          : ""
        }
        </table>

        <br/>
        <p>Regards,<br/>Ertitech HR-Portal</p>
      `,
    });
  } catch (err) {
    console.error(`❌ [MAIL] Decision mail (${status}) failed:`, err.message);
  }
};

/* ================= HELPER: PUSH LOG ================= */
const pushLog = (request, action, byId, remark = "") => {
  request.logs.push({
    action,
    by: byId || null,
    timestamp: new Date(),
    remark,
  });
};

const generateTicketId = () => {
  const random = Math.floor(1000 + Math.random() * 9000); // 4 digits (starts with 1-9)
  const timestamp = Date.now().toString().slice(-6); // last 6 digits of timestamp
  return random.toString() + timestamp; // total 10 digits
};

/* ================= HELPER: DATE FILTER ================= */
const buildDateFilter = (query) => {
  const { today, yesterday, thisMonth, fromDate, toDate } = query;
  const now = new Date();

  if (today === "true") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86400000);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (yesterday === "true") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(start.getTime() + 86400000);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (thisMonth === "true") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (fromDate && toDate) {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    return { createdAt: { $gte: start, $lte: end } };
  }
  return {};
};

/* ================= MAIN FUNCTION ================= */
const SecurityWorkflow = {



  /* ===== CREATE REQUEST (Maker) ===== */
  createRequest: async (req, res) => {
    try {
      const makerId = req.user.id;
      const { title, description, requestType, checkerId, ccId, dueDate, requestData = {} } = req.body;

      let parsedRequestData = {};
      if (requestData) {
        try {
          parsedRequestData = typeof requestData === 'string' ? JSON.parse(requestData) : requestData;
        } catch (e) {
          parsedRequestData = requestData;
        }
      }

      // Basic validation
      if (!title || !requestType || !checkerId || !dueDate) {
        return res.status(400).json({
          success: false,
          message: "Title, requestType, checkerId, and dueDate are required",
        });
      }

      // Parse arrays of checkers and CCs
      let parsedCheckerIds = [];
      try {
        parsedCheckerIds = typeof checkerId === 'string' ? JSON.parse(checkerId) : checkerId;
        if (!Array.isArray(parsedCheckerIds)) {
          parsedCheckerIds = [parsedCheckerIds];
        }
      } catch (e) {
        parsedCheckerIds = String(checkerId).split(',').map(id => id.trim()).filter(Boolean);
      }

      let parsedCcIds = [];
      if (ccId) {
        try {
          parsedCcIds = typeof ccId === 'string' ? JSON.parse(ccId) : ccId;
          if (!Array.isArray(parsedCcIds)) {
            parsedCcIds = [parsedCcIds];
          }
        } catch (e) {
          parsedCcIds = String(ccId).split(',').map(id => id.trim()).filter(Boolean);
        }
      }

      if (parsedCheckerIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one checker is required",
        });
      }

      // Maker cannot be any of the checkers
      if (parsedCheckerIds.some(id => String(makerId) === String(id))) {
        return res.status(400).json({
          success: false,
          message: "Maker and Checker cannot be the same person",
        });
      }

      // Maker cannot be any of the CCs
      if (parsedCcIds.some(id => String(makerId) === String(id))) {
        return res.status(400).json({
          success: false,
          message: "Maker and CC cannot be the same person",
        });
      }

      // Checkers and CCs cannot overlap
      if (parsedCheckerIds.some(cId => parsedCcIds.some(cc => String(cId) === String(cc)))) {
        return res.status(400).json({
          success: false,
          message: "Checker and CC cannot be the same person",
        });
      }

      // Due date cannot be in the past
      const dueDateObj = new Date(dueDate);
      dueDateObj.setHours(23, 59, 59, 999); // ensure full day validity
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(dueDateObj) || dueDateObj < today) {
        return res.status(400).json({
          success: false,
          message: "Due date is invalid or in the past",
        });
      }

      // OTHER type must have description
      if (requestType === "OTHER" && !description?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Description is required for OTHER request type",
        });
      }

      // CODE type validation
      if (requestType === "CODE") {
        if (!parsedRequestData.repo || !parsedRequestData.branch || !parsedRequestData.commitId) {
          return res.status(400).json({
            success: false,
            message: "Repo, branch, and commitId are required for CODE requests",
          });
        }
      }

      // GIT type validation
      if (requestType === "GIT") {
        if (!parsedRequestData.repo || !parsedRequestData.branch) {
          return res.status(400).json({
            success: false,
            message: "Repo and branch are required for GIT requests",
          });
        }
      }

      // SERVER type validation
      if (requestType === "SERVER") {
        if (!parsedRequestData.serverName) {
          return res.status(400).json({
            success: false,
            message: "Server name is required for SERVER requests",
          });
        }
      }

      if (requestType === "AWS") {
        if (!parsedRequestData.platformService) {
          return res.status(400).json({
            success: false,
            message: "Platform / Service is required",
          });
        }
      }

      if (requestType === "MONGODB") {
        if (!parsedRequestData.dbName) {
          return res.status(400).json({
            success: false,
            message: "Database name is required",
          });
        }
      }

      if (requestType === "OTHER") {
        if (!parsedRequestData.customType) {
          return res.status(400).json({
            success: false,
            message: "Custom type is required",
          });
        }
      }

      // Fetch maker to get empId for S3 key
      const maker = await Employee.findById(makerId);
      const empId = maker?.employeeId || "unknown";

      // Handle file uploads
      const uploadedFiles = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/[^a-z0-9.]/gi, "_").toLowerCase();
          const key = `Operionhub/${empId}_${timestamp}_${safeName}`;
          await uploadToS3(file.buffer, key, file.mimetype);
          uploadedFiles.push({ key, originalName: file.originalname });
        }
      }

      const newRequest = new SecurityRequest({
        ticketId: generateTicketId(),
        title: title.trim(),
        description: description?.trim() || "",
        requestType,
        checkerId: parsedCheckerIds,
        approvers: parsedCheckerIds.map(emp => ({
          employee: emp,
          status: "PENDING"
        })),
        ccId: parsedCcIds,
        makerId,
        dueDate: dueDateObj,
        requestData: parsedRequestData,
        status: "PENDING_APPROVAL",
        files: uploadedFiles,
      });

      // Log CREATED
      pushLog(newRequest, "CREATED", makerId, `Request created by ${maker?.name || "maker"}`);

      await newRequest.save();

      // ── Centralized Activity & Audit Log ──
      const checkerEmployees = await Employee.find({ _id: { $in: parsedCheckerIds } }).select("name");
      const checkerNames = checkerEmployees.map(c => c.name).filter(Boolean);
      const approverText = checkerNames.length > 0 ? checkerNames.join(", ") : "approver(s)";

      createLog({
        category: "security_request",
        referenceId: newRequest._id,
        description: `${maker?.name || "Maker"} created security request assigned to ${approverText}`,
      });

      res.status(201).json({
        success: true,
        message: "Security request created successfully",
        data: newRequest,
      });

      // Async tasks: Save in-app notification, send email, and send push notification
      setImmediate(async () => {
        try {
          // 1. Save In-App Notification for Checker
          for (const checkerId of parsedCheckerIds) {
            await new Notification({
              type: "SECURITY_REQUEST",
              fromEmployee: new mongoose.Types.ObjectId(makerId),
              toEmployee: new mongoose.Types.ObjectId(checkerId),
              title: "New Security Request",
              message: `New security request received: ${title.trim()} (${newRequest.ticketId})`,
              metadata: {
                ticketId: newRequest.ticketId,
                requestType: requestType,
              },
            }).save();
          }

          // 1b. Save In-App Notification for CC
          for (const ccId of parsedCcIds) {
            await new Notification({
              type: "SECURITY_REQUEST",
              fromEmployee: new mongoose.Types.ObjectId(makerId),
              toEmployee: new mongoose.Types.ObjectId(ccId),
              title: "Security Request (CC)",
              message: `You have been CC'd on a security request: ${title.trim()} (${newRequest.ticketId})`,
              metadata: {
                ticketId: newRequest.ticketId,
                requestType: requestType,
              },
            }).save();
          }

          // 2. Fetch involved employees for details
          const checkers = await Employee.find({ _id: { $in: parsedCheckerIds } });
          const ccUsers = await Employee.find({ _id: { $in: parsedCcIds } });

          // 3. Send Approver Email (with optional CC)
          const checkerEmails = checkers.map(c => c.email).filter(Boolean);
          const ccEmails = ccUsers.map(cc => cc.email).filter(Boolean);

          if (checkerEmails.length > 0 && typeof sendApproverMail === "function") {
            try {
              await sendApproverMail(
                checkerEmails.join(","),
                maker?.name || "Maker",
                checkers.map(c => c.name).join(", "),
                newRequest,
                ccEmails.length > 0 ? ccEmails.join(",") : null
              );
            } catch (mailErr) {
              console.error("[SecurityController] Email failed:", mailErr.message);
            }
          }

          // 4. Send Push Notification to Checker
          for (const checkerId of parsedCheckerIds) {
            try {
              await sendPushNotification(
                new mongoose.Types.ObjectId(checkerId),
                "New Security Request",
                `You have a new request from ${maker?.name || "Maker"}: ${title.trim()} (${newRequest.ticketId})`,
                { ticketId: newRequest.ticketId, type: "SECURITY_REQUEST" }
              );
            } catch (pushErr) {
              console.error("[SecurityController] Push notification failed:", pushErr.message);
            }
          }

          // 4b. Send Push Notification to CC
          for (const ccId of parsedCcIds) {
            try {
              await sendPushNotification(
                new mongoose.Types.ObjectId(ccId),
                "Security Request (CC)",
                `You have been CC'd on a request from ${maker?.name || "Maker"}: ${title.trim()} (${newRequest.ticketId})`,
                { ticketId: newRequest.ticketId, type: "SECURITY_REQUEST" }
              );
            } catch (pushErr) {
              console.error("[SecurityController] CC push notification failed:", pushErr.message);
            }
          }

          // 5. Send Confirmation Push Notification to Maker
          if (makerId) {
            try {
              await sendPushNotification(
                new mongoose.Types.ObjectId(makerId),
                "Request Submitted",
                `Your security request "${title.trim()}" (${newRequest.ticketId}) has been submitted successfully.`,
                { ticketId: newRequest.ticketId, type: "SECURITY_REQUEST" }
              );
            } catch (pushErr) {
              console.error("[SecurityController] Maker push notification failed:", pushErr.message);
            }
          }
        } catch (err) {
          console.error("[SecurityController] Background notification task failed:", err);
        }
      });

      return;

    } catch (error) {
      console.error("Create Request Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== GET ALL REQUESTS ===== */
  getRequests: async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const isAdmin = req.user.role === "admin";

      let filter = {};
      if (!isAdmin) {
        filter = {
          $or: [
            { makerId: currentUserId },
            { checkerId: currentUserId },
            { ccId: currentUserId }
          ]
        };
      }

      // Filter by maker or checker if provided in query
      if (req.query.makerId) filter.makerId = req.query.makerId;
      if (req.query.checkerId) filter.checkerId = req.query.checkerId;

      // Extra multi-filters from client search button
      if (req.query.ticketId) {
        const numVal = Number(req.query.ticketId);
        if (!isNaN(numVal)) {
          filter.ticketId = { $in: [req.query.ticketId, numVal] };
        } else {
          const escapedTicket = req.query.ticketId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          filter.ticketId = { $regex: escapedTicket, $options: "i" };
        }
      }
      if (req.query.requestType) {
        filter.requestType = req.query.requestType;
      }
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.dueFrom && req.query.dueTo) {
        const start = new Date(req.query.dueFrom);
        const end = new Date(req.query.dueTo);
        end.setHours(23, 59, 59, 999);
        filter.dueDate = { $gte: start, $lte: end };
      }

      if (req.query.titleDesc) {
        const escapedSearch = req.query.titleDesc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const textSearch = {
          $or: [
            { title: { $regex: escapedSearch, $options: "i" } },
            { description: { $regex: escapedSearch, $options: "i" } }
          ]
        };

        if (filter.$or) {
          filter = {
            $and: [
              { $or: filter.$or },
              textSearch
            ]
          };
        } else {
          filter.$or = textSearch.$or;
        }
      }

      // Date filter
      const dateFilter = buildDateFilter(req.query);
      Object.assign(filter, dateFilter);

      const requests = await SecurityRequest.find(filter)
        .populate("makerId", "name photo designation role")
        .populate("checkerId", "name photo designation role")
        .populate("ccId", "name photo designation role")
        .sort({ createdAt: -1 });

      const updatedRequests = await Promise.all(
        requests.map(async (req) => {
          const obj = req.toObject();

          if (obj.makerId?.photo) {
            obj.makerId.avatar = await getCachedSignedUrl(obj.makerId.photo);
          }

          if (Array.isArray(obj.checkerId)) {
            for (const checker of obj.checkerId) {
              if (checker.photo) {
                checker.avatar = await getCachedSignedUrl(checker.photo);
              }
            }
          } else if (obj.checkerId?.photo) {
            obj.checkerId.avatar = await getCachedSignedUrl(obj.checkerId.photo);
          }

          if (Array.isArray(obj.ccId)) {
            for (const cc of obj.ccId) {
              if (cc.photo) {
                cc.avatar = await getCachedSignedUrl(cc.photo);
              }
            }
          } else if (obj.ccId?.photo) {
            obj.ccId.avatar = await getCachedSignedUrl(obj.ccId.photo);
          }

          // Handle file signed URLs (Expiration logic removed)
          if (obj.files && obj.files.length > 0) {
            obj.files = await Promise.all(obj.files.map(async (file) => {
              return {
                ...file,
                url: await generateSignedUrl(file.key, 180),
                isExpired: false
              };
            }));
          }

          return obj;
        })
      );

      return res.status(200).json({
        success: true,
        data: updatedRequests,
      });

    } catch (error) {
      console.error("Get Requests Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  getPendingForMe: async (req, res) => {
    try {
      const checkerId = req.user.id;
      const requests = await SecurityRequest.find({
        checkerId,
        status: "PENDING_APPROVAL",
      })
        .populate("makerId", "name photo designation")
        .sort({ createdAt: -1 });

      const updatedRequests = await Promise.all(
        requests.map(async (req) => {
          const obj = req.toObject();
          if (obj.makerId?.photo) {
            obj.makerId.avatar = await getCachedSignedUrl(obj.makerId.photo);
          }

          // Handle file signed URLs (Expiration logic removed)
          if (obj.files && obj.files.length > 0) {
            obj.files = await Promise.all(obj.files.map(async (file) => {
              return {
                ...file,
                url: await generateSignedUrl(file.key, 180),
                isExpired: false
              };
            }));
          }

          return obj;
        })
      );

      return res.status(200).json({
        success: true,
        data: updatedRequests,
      });
    } catch (error) {
      console.error("Get Pending For Me Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== GET SINGLE REQUEST ===== */
  getRequestById: async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      const request = await SecurityRequest.findById(id)
        .populate("makerId", "name photo designation role")
        .populate("checkerId", "name photo designation role")
        .populate("ccId", "name photo designation role")
        .populate("logs.by", "name");

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      // Permission check: Must be maker, checker, CC, or an Admin
      const isAdmin = req.user.role === "admin";
      const isMaker = String(request.makerId?._id || request.makerId) === String(currentUserId);
      const isChecker = Array.isArray(request.checkerId)
        ? request.checkerId.some(c => String(c._id || c) === String(currentUserId))
        : String(request.checkerId?._id || request.checkerId) === String(currentUserId);
      const isCC = Array.isArray(request.ccId)
        ? request.ccId.some(c => String(c._id || c) === String(currentUserId))
        : String(request.ccId?._id || request.ccId) === String(currentUserId);

      if (!isAdmin && !isMaker && !isChecker && !isCC) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access to this request",
        });
      }

      const obj = request.toObject();

      if (obj.makerId?.photo) {
        obj.makerId.avatar = await getCachedSignedUrl(obj.makerId.photo);
      }

      if (Array.isArray(obj.checkerId)) {
        for (const checker of obj.checkerId) {
          if (checker.photo) {
            checker.avatar = await getCachedSignedUrl(checker.photo);
          }
        }
      } else if (obj.checkerId?.photo) {
        obj.checkerId.avatar = await getCachedSignedUrl(obj.checkerId.photo);
      }

      if (Array.isArray(obj.ccId)) {
        for (const cc of obj.ccId) {
          if (cc.photo) {
            cc.avatar = await getCachedSignedUrl(cc.photo);
          }
        }
      } else if (obj.ccId?.photo) {
        obj.ccId.avatar = await getCachedSignedUrl(obj.ccId.photo);
      }

      // Handle file signed URLs (Expiration logic removed)
      if (obj.files && obj.files.length > 0) {
        obj.files = await Promise.all(obj.files.map(async (file) => {
          return {
            ...file,
            url: await generateSignedUrl(file.key, 180),
            isExpired: false
          };
        }));
      }

      return res.status(200).json({
        success: true,
        data: obj,
      });

    } catch (error) {
      console.error("Get Request By ID Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== APPROVE REQUEST (Checker only) ===== */
  approveRequest: async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      const request = await SecurityRequest.findById(id);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      // Only checker can approve
      const isChecker = Array.isArray(request.checkerId)
        ? request.checkerId.some(id => String(id) === String(currentUserId))
        : String(request.checkerId) === String(currentUserId);
      if (!isChecker) {
        return res.status(403).json({
          success: false,
          message: "Only the assigned checker can approve this request",
        });
      }

      if (request.status !== "PENDING_APPROVAL") {
        return res.status(400).json({
          success: false,
          message: `Cannot approve a request with status: ${request.status}`,
        });
      }

      // Find and update individual approver
      let approver = request.approvers.find((a) => String(a.employee) === String(currentUserId));

      if (approver) {
        if (approver.status !== "PENDING") {
          return res.status(400).json({
            success: false,
            message: "You have already processed this request",
          });
        }
        approver.status = "APPROVED";
        approver.actionDate = new Date();
        approver.remark = req.body.remark || "";
      } else {
        // Fallback for requests created before migration
        request.approvers.push({
          employee: currentUserId,
          status: "APPROVED",
          actionDate: new Date(),
          remark: req.body.remark || "",
        });
      }

      // Calculate overall status
      const allApproved = request.checkerId.every((checkerId) => {
        const a = request.approvers.find(ap => String(ap.employee) === String(checkerId));
        return a && a.status === "APPROVED";
      });

      if (allApproved) {
        request.status = "APPROVED";
      }

      const checker = await Employee.findById(currentUserId);
      pushLog(
        request,
        "APPROVED",
        currentUserId,
        req.body.remark || `Approved by ${checker?.name || "checker"}`
      );

      await request.save();

      // ── Centralized Activity & Audit Log ──
      const makerUser = await Employee.findById(request.makerId).select("name");
      const makerText = makerUser?.name ? ` created by ${makerUser.name}` : "";
      const remarkText = req.body.remark?.trim() ? `. Remark: ${req.body.remark.trim()}` : "";

      createLog({
        category: "security_request",
        referenceId: request._id,
        description: `${checker?.name || "Checker"} approved security request${makerText}${remarkText}`,
      });

      res.status(200).json({
        success: true,
        message: request.status === "APPROVED" ? "Request fully approved successfully" : "Your approval has been recorded",
        data: request,
      });

      // Only send final notifications if fully approved
      if (request.status === "APPROVED") {
        setImmediate(async () => {
          try {
            await new Notification({
              type: "SECURITY_APPROVED",
              fromEmployee: new mongoose.Types.ObjectId(currentUserId),
              toEmployee: request.makerId,
              title: "Security Request Approved",
              message: `Your security request "${request.title}" has been APPROVED.`,
              metadata: {
                ticketId: request.ticketId,
                requestType: request.requestType,
              },
            }).save();

            const maker = await Employee.findById(request.makerId);
            const checkerObj = await Employee.findById(currentUserId);

            if (maker?.email && typeof sendDecisionMail === "function") {
              try {
                await sendDecisionMail(
                  maker.email,
                  maker.name,
                  checkerObj?.name || "Checker",
                  request,
                  "APPROVED"
                );
              } catch (mailErr) {
                console.error("approveRequest email task failed:", mailErr.message);
              }
            }

            // ✅ SEND PUSH NOTIFICATION TO MAKER
            await sendPushNotification(
              request.makerId,
              "Approval Request Approved",
              `Your request "${request.title}" (${request.ticketId}) has been APPROVED.`,
              { ticketId: request.ticketId, type: "SECURITY_REQUEST" }
            );
          } catch (err) {
            console.error("approveRequest background task failed:", err);
          }
        });
      }

      return;

    } catch (error) {
      console.error("Approve Request Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== REJECT REQUEST (Checker only) ===== */
  rejectRequest: async (req, res) => {
    try {
      const { id } = req.params;
      const { remark } = req.body;
      const currentUserId = req.user.id;

      if (!remark?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Rejection remark is required",
        });
      }

      const request = await SecurityRequest.findById(id);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      // Only checker can reject
      const isChecker = Array.isArray(request.checkerId)
        ? request.checkerId.some(id => String(id) === String(currentUserId))
        : String(request.checkerId) === String(currentUserId);
      if (!isChecker) {
        return res.status(403).json({
          success: false,
          message: "Only the assigned checker can reject this request",
        });
      }

      // Only pending requests can be rejected
      if (request.status !== "PENDING_APPROVAL") {
        return res.status(400).json({
          success: false,
          message: `Cannot reject a request with status: ${request.status}`,
        });
      }

      // Find and update individual approver
      let approver = request.approvers.find((a) => String(a.employee) === String(currentUserId));

      if (approver) {
        if (approver.status !== "PENDING") {
          return res.status(400).json({
            success: false,
            message: "You have already processed this request",
          });
        }
        approver.status = "REJECTED";
        approver.actionDate = new Date();
        approver.remark = remark.trim();
      } else {
        // Fallback for requests created before migration
        request.approvers.push({
          employee: currentUserId,
          status: "REJECTED",
          actionDate: new Date(),
          remark: remark.trim(),
        });
      }

      request.status = "REJECTED";
      pushLog(request, "REJECTED", currentUserId, remark.trim());

      await request.save();

      // ── Centralized Activity & Audit Log ──
      const checkerObj = await Employee.findById(currentUserId);
      const makerUser = await Employee.findById(request.makerId).select("name");
      const makerText = makerUser?.name ? ` created by ${makerUser.name}` : "";
      const reasonText = remark.trim() ? `. Reason: ${remark.trim()}` : "";

      createLog({
        category: "security_request",
        referenceId: request._id,
        description: `${checkerObj?.name || "Checker"} rejected security request${makerText}${reasonText}`,
      });

      res.status(200).json({
        success: true,
        message: "Request rejected",
        data: request,
      });

      setImmediate(async () => {
        try {
          await new Notification({
            type: "SECURITY_REJECTED",
            fromEmployee: new mongoose.Types.ObjectId(currentUserId),
            toEmployee: request.makerId,
            title: "Security Request Rejected",
            message: `Your security request "${request.title}" has been REJECTED.`,
            metadata: {
              ticketId: request.ticketId,
              requestType: request.requestType,
              reason: remark.trim(),
            },
          }).save();

          const maker = await Employee.findById(request.makerId);
          const checkerObj = await Employee.findById(currentUserId);

          if (maker?.email && typeof sendDecisionMail === "function") {
            try {
              await sendDecisionMail(
                maker.email,
                maker.name,
                checkerObj?.name || "Checker",
                request,
                "REJECTED",
                remark.trim()
              );
            } catch (mailErr) {
              console.error("rejectRequest email task failed:", mailErr.message);
            }
          }

          // ✅ SEND PUSH NOTIFICATION TO MAKER
          await sendPushNotification(
            request.makerId,
            "Approval Request Rejected",
            `Your request "${request.title}" (${request.ticketId}) has been REJECTED.`,
            { ticketId: request.ticketId, type: "SECURITY_REQUEST" }
          );
        } catch (err) {
          console.error("rejectRequest background task failed:", err);
        }
      });

      return;

    } catch (error) {
      console.error("Reject Request Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },

  /* ===== UPDATE REQUEST (Maker only, while Pending) ===== */
  updateRequest: async (req, res) => {
    try {
      const { id } = req.params;
      const makerId = req.user.id;
      const maker = await Employee.findById(makerId);
      const { title, description, requestType, checkerId, ccId, dueDate, requestData, existingFiles } = req.body;

      const request = await SecurityRequest.findById(id);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Request not found",
        });
      }

      // Only maker can update
      if (String(request.makerId) !== String(makerId)) {
        return res.status(403).json({
          success: false,
          message: "Only the requester can edit this request",
        });
      }

      // Only pending requests can be updated
      if (request.status !== "PENDING_APPROVAL") {
        return res.status(400).json({
          success: false,
          message: "Approved or rejected requests cannot be edited",
        });
      }

      // Parse arrays of checkers and CCs
      let parsedCheckerIds = [];
      if (checkerId) {
        try {
          parsedCheckerIds = typeof checkerId === 'string' ? JSON.parse(checkerId) : checkerId;
          if (!Array.isArray(parsedCheckerIds)) {
            parsedCheckerIds = [parsedCheckerIds];
          }
        } catch (e) {
          parsedCheckerIds = String(checkerId).split(',').map(id => id.trim()).filter(Boolean);
        }
      }

      let parsedCcIds = [];
      if (ccId !== undefined) {
        if (ccId) {
          try {
            parsedCcIds = typeof ccId === 'string' ? JSON.parse(ccId) : ccId;
            if (!Array.isArray(parsedCcIds)) {
              parsedCcIds = [parsedCcIds];
            }
          } catch (e) {
            parsedCcIds = String(ccId).split(',').map(id => id.trim()).filter(Boolean);
          }
        }
      }

      // Re-validate Maker vs Checker
      if (checkerId && parsedCheckerIds.some(id => String(makerId) === String(id))) {
        return res.status(400).json({
          success: false,
          message: "Maker and Checker cannot be the same person",
        });
      }

      // Re-validate Maker vs CC
      if (ccId && parsedCcIds.some(id => String(makerId) === String(id))) {
        return res.status(400).json({
          success: false,
          message: "Maker and CC cannot be the same person",
        });
      }

      // Re-validate Checker vs CC
      const finalCheckers = checkerId ? parsedCheckerIds : request.checkerId;
      const finalCcs = ccId !== undefined ? parsedCcIds : request.ccId;
      if (finalCheckers.some(cId => finalCcs.some(cc => String(cId) === String(cc)))) {
        return res.status(400).json({
          success: false,
          message: "Checker and CC cannot be the same person",
        });
      }

      // Capture snapshot before applying edits
      const oldReqSnapshot = {
        title: request.title,
        description: request.description,
        requestType: request.requestType,
        dueDate: request.dueDate,
        checkerId: [...(request.checkerId || [])],
        ccId: [...(request.ccId || [])],
        filesCount: request.files ? request.files.length : 0,
      };

      // Update fields if provided
      if (title) request.title = title.trim();
      if (description !== undefined) request.description = description.trim();
      if (requestType) request.requestType = requestType;
      if (checkerId) {
        request.checkerId = parsedCheckerIds;
        request.approvers = parsedCheckerIds.map(emp => ({
          employee: emp,
          status: "PENDING"
        }));
      }
      if (ccId !== undefined) request.ccId = parsedCcIds;
      if (dueDate) {
        const d = new Date(dueDate);
        d.setHours(23, 59, 59, 999);
        request.dueDate = d;
      }
      if (requestData) request.requestData = typeof requestData === 'string' ? JSON.parse(requestData) : requestData;

      let deletedFilesCount = 0;
      if (existingFiles !== undefined) {
        try {
          const parsedExisting = typeof existingFiles === 'string' ? JSON.parse(existingFiles) : existingFiles;
          if (Array.isArray(parsedExisting)) {
            const beforeCount = request.files.length;
            request.files = request.files.filter(file => 
              parsedExisting.some(pe => String(pe._id || pe.key) === String(file._id || file.key))
            );
            deletedFilesCount = beforeCount - request.files.length;
          }
        } catch (err) {
          console.error("Error updating existing files:", err);
        }
      }

      // Handle additional file uploads
      if (req.files && req.files.length > 0) {
        const empId = maker?.employeeId || "unknown";

        for (const file of req.files) {
          const timestamp = Date.now();
          const safeName = file.originalname.replace(/[^a-z0-9.]/gi, "_").toLowerCase();
          const key = `Operionhub/${empId}_${timestamp}_${safeName}`;
          await uploadToS3(file.buffer, key, file.mimetype);
          request.files.push({ key, originalName: file.originalname });
        }
      }

      pushLog(request, "EDITED", makerId, `Request updated by ${maker?.name || "maker"}`);

      await request.save();

      // ── Centralized Activity & Audit Log (Only log if fields were edited) ──
      const changes = await buildSecurityRequestDiffs(
        oldReqSnapshot,
        { title, description, requestType, dueDate },
        checkerId ? parsedCheckerIds : undefined,
        ccId !== undefined ? parsedCcIds : undefined,
        req.files,
        deletedFilesCount
      );

      if (changes.length > 0) {
        createLog({
          category: "security_request",
          referenceId: request._id,
          description: `${maker?.name || "Maker"} updated security request`,
          changes,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Request updated successfully",
        data: request,
      });

    } catch (error) {
      console.error("Update Request Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Server Error",
      });
    }
  },

};

const apiLogger = require('../utils/apiLogger');
module.exports = apiLogger(SecurityWorkflow, 'Securitycontroller.js');