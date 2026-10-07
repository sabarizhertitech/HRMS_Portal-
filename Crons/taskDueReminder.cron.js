const cron = require("node-cron");
const moment = require("moment-timezone");
const Task = require("../Models/task.model");
const Employee = require("../Models/Employee");
const Notification = require("../Models/Notification");
const transporter = require("../utilities/emailTransporter");

/**
 * Check active tasks and send due date reminder emails & dashboard notifications
 * to assigned employees before their task due date (e.g. 1 day / 24-36h prior).
 *
 * If the task is completed before the due date, notifications are skipped.
 */
const runTaskDueReminderCron = async () => {
  try {
    const now = moment().tz("Asia/Kolkata");
    const nowJs = now.toDate();

    // Look for active, non-completed, non-rejected tasks with a dueDate that haven't sent a reminder yet
    const candidateTasks = await Task.find({
      dueDate: { $ne: null },
      dueReminderSent: { $ne: true },
      status: { $nin: ["Completed", "completed", "ignored", "rejected", "Rejected"] },
      assignedStatus: { $nin: ["rejected", "Rejected"] },
    }).populate("assignedMembers", "name email empId");

    if (!candidateTasks || candidateTasks.length === 0) {
      return;
    }

    for (const task of candidateTasks) {
      // If task is completed or has no assigned members or no dueDate, skip
      if (!task.dueDate || task.status?.toLowerCase() === "completed") {
        continue;
      }

      const dueMoment = moment(task.dueDate).tz("Asia/Kolkata");
      const hoursUntilDue = dueMoment.diff(now, "hours", true);

      // Trigger reminder if due within ~36 hours (covering "1 day before" / due tomorrow or due today)
      // and not already past due by more than 24 hours
      const isDueSoon = hoursUntilDue <= 36 && hoursUntilDue >= -24;

      if (!isDueSoon) {
        continue;
      }

      const assignedMembers = Array.isArray(task.assignedMembers)
        ? task.assignedMembers.filter(Boolean)
        : [];

      if (assignedMembers.length === 0) {
        continue;
      }

      const formattedDueDate = dueMoment.format("DD MMM YYYY");
      const formattedDateFull = dueMoment.format("dddd, MMMM DD, YYYY");

      for (const member of assignedMembers) {
        const memberEmail = member.email;
        const memberName = member.name || "Team Member";

        // 1. Send Email Notification if email is available
        if (memberEmail && transporter) {
          try {
            await transporter.sendMail({
              from: `"HR Portal Tasks" <${process.env.EMAIL_USER}>`,
              to: memberEmail,
              subject: `⏰ Task Due Reminder: "${task.taskTitle}" is due on ${formattedDueDate}`,
              html: `
                <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:24px; color:#1e293b;">
                  <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                    
                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color:#ffffff; padding:22px 24px;">
                      <h2 style="margin:0; font-size:20px; font-weight:700; display:flex; align-items:center; gap:8px;">
                        ⏰ Task Due Date Reminder
                      </h2>
                      <p style="margin:6px 0 0 0; opacity:0.9; font-size:13px;">Action required: Upcoming task deadline</p>
                    </div>

                    <div style="padding:24px;">
                      <p style="color:#334155; font-size:15px; line-height:1.6; margin-top:0;">
                        Hello <b>${memberName}</b>,
                      </p>
                      <p style="color:#475569; font-size:14px; line-height:1.6;">
                        This is an automated reminder that your assigned task is approaching its scheduled deadline. Please complete and submit your work on time.
                      </p>

                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin:20px 0;">
                        <table style="width:100%; border-collapse:collapse; font-size:14px;">
                          <tr>
                            <td style="padding:6px 0; color:#64748b; width:35%; font-weight:600;">Task Name:</td>
                            <td style="padding:6px 0; color:#0f172a; font-weight:700;">${task.taskTitle}</td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0; color:#64748b; font-weight:600;">Due Date:</td>
                            <td style="padding:6px 0; color:#e11d48; font-weight:700;">${formattedDateFull}</td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0; color:#64748b; font-weight:600;">Priority:</td>
                            <td style="padding:6px 0;">
                              <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; background:${task.priority === "High" ? "#fee2e2; color:#b91c1c;" : task.priority === "Low" ? "#ecfdf5; color:#047857;" : "#fef3c7; color:#b45309;"}">
                                ${task.priority || "Mid"}
                              </span>
                            </td>
                          </tr>
                          ${task.category ? `
                          <tr>
                            <td style="padding:6px 0; color:#64748b; font-weight:600;">Category:</td>
                            <td style="padding:6px 0; color:#334155;">${task.category}</td>
                          </tr>` : ""}
                          ${task.project ? `
                          <tr>
                            <td style="padding:6px 0; color:#64748b; font-weight:600;">Project:</td>
                            <td style="padding:6px 0; color:#334155;">${task.project}</td>
                          </tr>` : ""}
                        </table>

                        ${task.taskDetails ? `
                        <div style="margin-top:12px; padding-top:12px; border-top:1px dashed #cbd5e1;">
                          <div style="color:#64748b; font-size:12px; font-weight:600; margin-bottom:4px;">Details:</div>
                          <div style="color:#334155; font-size:13px; line-height:1.5;">${task.taskDetails}</div>
                        </div>` : ""}
                      </div>

                      <div style="margin-top:20px; padding:12px 16px; background:#fffbeb; border-left:4px solid #f59e0b; border-radius:4px;">
                        <p style="margin:0; color:#92400e; font-size:13px; line-height:1.5;">
                          <b>💡 Tip:</b> Once completed, please update the task status to <b>Completed</b> on your HR Portal to conclude all reminders.
                        </p>
                      </div>

                      <div style="margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9; color:#64748b; font-size:13px;">
                        Best regards,<br/>
                        <b>HR Portal System</b>
                      </div>
                    </div>

                    <div style="background:#f8fafc; text-align:center; padding:12px; font-size:11px; color:#94a3b8; border-top:1px solid #e2e8f0;">
                      © ${new Date().getFullYear()} Ertitech HR Portal. All rights reserved.
                    </div>
                  </div>
                </div>
              `,
            });
            console.log(`[TaskDueCron] Sent due reminder email for task "${task.taskTitle}" to ${memberEmail}`);
          } catch (mailErr) {
            console.error(`[TaskDueCron] Error sending email to ${memberEmail}:`, mailErr.message);
          }
        }

        // 2. Create In-App Notification in DB
        try {
          // Check if notification already exists for this task & member
          const existingNotif = await Notification.findOne({
            toEmployee: member._id,
            type: "TASK_DUE",
            "metadata.ticketId": task._id.toString(),
          });

          if (!existingNotif) {
            await Notification.create({
              type: "TASK_DUE",
              toEmployee: member._id,
              title: "Task Due Date Reminder",
              message: `Task "${task.taskTitle}" is due on ${formattedDueDate}. Please complete it on time.`,
              metadata: {
                targetModule: "TASK",
                ticketId: task._id.toString(),
                url: "/emp/tasks",
              },
            });
          }
        } catch (notifErr) {
          console.error(`[TaskDueCron] Error creating notification for member ${member._id}:`, notifErr.message);
        }
      }

      // Mark task as reminder sent
      task.dueReminderSent = true;
      await task.save();
    }
  } catch (err) {
    console.error("[TaskDueCron] Error in task due reminder cron:", err);
  }
};

// ⏰ Scheduled to run every 15 minutes
const job = cron.schedule(
  "*/15 * * * *",
  async () => {
    await runTaskDueReminderCron();
  },
  {
    timezone: "Asia/Kolkata",
  }
);

job.start();

// 🚀 Run once shortly after server startup to catch any upcoming due tasks
setTimeout(async () => {
  try {
    console.log("⏰ [TaskDueCron] Running initial Task Due Date check...");
    await runTaskDueReminderCron();
  } catch (e) {
    console.error("[TaskDueCron] Initial check failed:", e);
  }
}, 4000);

module.exports = {
  job,
  runTaskDueReminderCron,
};
