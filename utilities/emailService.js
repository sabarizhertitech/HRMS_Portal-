const transporter = require("./emailTransporter");
const Employee = require("../Models/Employee");

/**
 * Send a styled task assignment email
 * @param {Array} userIds - IDs of employees receiving the task
 * @param {Object} taskDetails - { title, description, priority, createdByName, portalLink }
 */
exports.sendTaskAssignmentEmail = async (userIds, taskDetails) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const { title, description, priority, createdByName, portalLink } = taskDetails;

  try {
    const recipients = await Employee.find({ _id: { $in: ids } }).select("email name");

    for (const user of recipients) {
      if (!user.email) continue;

      const mailOptions = {
        from: `"HR Portal" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `New Task Assigned: ${title}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #5977f8; padding: 25px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px;">New Task Assignment</h2>
            </div>
            
            <div style="padding: 30px; background-color: #ffffff;">
              <p style="font-size: 16px; color: #444; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
              <p style="font-size: 16px; color: #444; line-height: 1.6;">You have been assigned a new task by <strong>${createdByName}</strong>. Below are the task details:</p>
              
              <div style="background-color: #f8fafc; border-left: 4px solid #5977f8; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 100px;"><strong>Task Title</strong></td>
                    <td style="padding: 8px 0; color: #1e293b; font-size: 15px;">: ${title}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;"><strong>Priority</strong></td>
                    <td style="padding: 8px 0; font-size: 14px;">
                      <span style="padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 12px; 
                        ${priority === 'High' ? 'background-color: #fee2e2; color: #ef4444;' :
            priority === 'Mid' ? 'background-color: #fef3c7; color: #f59e0b;' :
              'background-color: #dcfce7; color: #22c55e;'}">
                        ${priority}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top;"><strong>Description</strong></td>
                    <td style="padding: 8px 0; color: #1e293b; font-size: 14px; line-height: 1.5;">: ${description}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin-top: 35px;">
                <a href="${portalLink}" style="background-color: #5977f8; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; transition: background-color 0.3s ease;">
                  View Task on Portal
                </a>
              </div>
              
              <p style="margin-top: 40px; font-size: 13px; color: #94a3b8; text-align: center;">
                If you have any questions, please contact your manager.<br>
                This is an automated notification from the HR Portal.
              </p>
            </div>
            
            <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">&copy; 2026 ErtiTech. All rights reserved.</p>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
    }

    console.log(`Task assignment emails sent to ${recipients.length} users.`);
  } catch (error) {
    console.error("Error sending task assignment email:", error);
  }
};

/**
 * Send a styled leave/wfh request email notification
 * @param {Object} employee - The employee requesting leave
 * @param {Object} request - The leave/wfh request model
 * @param {string} actionType - "create" or "status_update"
 * @param {Object} [approver] - The admin/manager who actioned the request (for status updates)
 */
exports.sendLeaveRequestEmail = async (employee, request, actionType, approver = null) => {
  try {
    const requestTypeLabel = request.requestType === "leave" ? "Leave" : "WFH";
    const fromDateStr = new Date(request.fromDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const toDateStr = new Date(request.toDate || request.fromDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    // Dynamically fetch the requesting employee's full fresh details using employeeId if needed
    let emp = employee;
    if (request.employeeId) {
      const fetchedEmp = await Employee.findById(request.employeeId).select("name email");
      if (fetchedEmp) {
        emp = fetchedEmp;
      }
    }

    if (!emp) {
      console.warn("[LeaveEmail] Requesting employee not found.");
      return;
    }

    // Determine strict recipient email based on action type
    let recipientEmail = "";

    if (actionType === "create") {
      // Send ONLY to the active administrators fetched dynamically from the database
      const admins = await Employee.find({
        role: "admin",
        employmentStatus: "active",
        status: { $ne: "relieved" }
      }).select("email").lean();
      const adminEmails = admins.map(a => a.email).filter(Boolean);
      recipientEmail = adminEmails.length > 0 ? adminEmails.join(", ") : process.env.EMAIL_USER;
    } else if (actionType === "status_update") {
      // Send ONLY to the requesting employee's dynamic email
      recipientEmail = emp.email;
    }

    if (!recipientEmail) {
      console.warn("[LeaveEmail] No recipient email address could be resolved.");
      return;
    }

    let subject = "";
    let htmlContent = "";

    // Status color mapping
    let statusBg = "#4f46e5"; // default Indigo
    let gradient = "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)";
    let badgeBg = "#e0e7ff";
    let badgeText = "#4f46e5";

    if (request.status === "Approved") {
      statusBg = "#10b981"; // Green
      gradient = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      badgeBg = "#d1fae5";
      badgeText = "#065f46";
    } else if (request.status === "Rejected") {
      statusBg = "#ef4444"; // Red
      gradient = "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)";
      badgeBg = "#fee2e2";
      badgeText = "#991b1b";
    } else if (request.status === "Cancelled") {
      statusBg = "#6b7280"; // Grey
      gradient = "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)";
      badgeBg = "#f3f4f6";
      badgeText = "#374151";
    }

    const reasonText = request.reasonType === "Others" ? request.otherReason : request.reasonType;

    if (actionType === "create") {
      subject = `[Pending] New ${requestTypeLabel} Request: ${emp.name}`;
      htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0; overflow: hidden;">
            <div style="background: ${gradient}; padding: 30px 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">New ${requestTypeLabel} Request</h2>
              <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Submitted by ${emp.name}</p>
            </div>
            
            <div style="padding: 30px 24px;">
              <div style="margin-bottom: 24px; text-align: right;">
                <span style="display: inline-block; padding: 6px 14px; background-color: #fef3c7; color: #d97706; font-size: 12px; font-weight: 600; border-radius: 20px; border: 1px solid #fde68a;">
                  Pending Approval
                </span>
              </div>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; width: 35%;"><strong>Employee Name</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${emp.name}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Request Type</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: capitalize;">${requestTypeLabel}</td>
                </tr>
                ${request.requestType === "leave" ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Leave Type</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${request.leaveType}</td>
                </tr>
                ` : ""}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Duration</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${fromDateStr} to ${toDateStr} (${request.noOfDays} day(s))</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Reason Category</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${reasonText}</td>
                </tr>
                ${request.detailedReason ? `
                <tr>
                  <td style="padding: 12px 0; color: #64748b; font-size: 14px; vertical-align: top;"><strong>Detailed Reason</strong></td>
                  <td style="padding: 12px 0; color: #334155; font-size: 14px; line-height: 1.5;">${request.detailedReason}</td>
                </tr>
                ` : ""}
              </table>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
                This is an automated notification from the ErtiTech HR Portal.
              </div>
            </div>
            
            <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">&copy; 2026 ErtiTech. All rights reserved.</p>
            </div>
          </div>
        </div>
      `;
    } else if (actionType === "status_update") {
      subject = `[${request.status}] ${requestTypeLabel} Request Decision: ${emp.name}`;
      const actionedByText = approver ? approver.name : (request.status === "Cancelled" ? emp.name : "System/Admin");

      htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0; overflow: hidden;">
            <div style="background: ${gradient}; padding: 30px 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Request ${request.status}</h2>
              <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Decision processed for ${emp.name}</p>
            </div>
            
            <div style="padding: 30px 24px;">
              <div style="margin-bottom: 24px; text-align: right;">
                <span style="display: inline-block; padding: 6px 14px; background-color: ${badgeBg}; color: ${badgeText}; font-size: 12px; font-weight: 600; border-radius: 20px;  border: 1px solid ${badgeText}33;">
                  ${request.status}
                </span>
              </div>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; width: 35%;"><strong>Employee Name</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${emp.name}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Request Type</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: capitalize;">${requestTypeLabel}</td>
                </tr>
                ${request.requestType === "leave" ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Leave Type</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${request.leaveType}</td>
                </tr>
                ` : ""}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Duration</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${fromDateStr} to ${toDateStr} (${request.noOfDays} day(s))</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px;"><strong>Actioned By</strong></td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: 600;">${actionedByText}</td>
                </tr>
                ${request.remark ? `
                <tr>
                  <td style="padding: 12px 0; color: #64748b; font-size: 14px; vertical-align: top;"><strong>Admin Remarks</strong></td>
                  <td style="padding: 12px 0; color: #334155; font-size: 14px; line-height: 1.5; font-weight: 600;">${request.remark}</td>
                </tr>
                ` : ""}
              </table>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
                This is an automated notification from the ErtiTech HR Portal.
              </div>
            </div>
            
            <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">&copy; 2026 ErtiTech. All rights reserved.</p>
            </div>
          </div>
        </div>
      `;
    }

    // Determine dynamic sender display name based on action type
    let fromHeader = "";

    if (actionType === "create") {
      // Show requesting employee name, and their dynamic personal email address
      fromHeader = `"${emp.name}" <${emp.email || process.env.EMAIL_USER}>`;
    } else {
      // Show approver name or HR Portal, and their dynamic email address
      const senderName = approver ? approver.name : "HR Portal";
      const senderEmail = (approver && approver.email) ? approver.email : process.env.EMAIL_USER;
      fromHeader = `"${senderName}" <${senderEmail}>`;
    }

    // Send styled email using pre-configured nodemailer transport
    await transporter.sendMail({
      from: fromHeader,
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
    });

    console.log(`[LeaveEmail] Successfully sent ${actionType} email notification for request ${request._id} to ${recipientEmail}.`);
  } catch (error) {
    // Robust error handling to make sure email failure NEVER interrupts core database transactions
    console.error("[LeaveEmail] Error sending leave request email notification:", error);
  }
};
