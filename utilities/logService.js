const Log = require("../Models/Logs");

/**
 * Log activity safely and asynchronously (non-blocking)
 * @param {Object} params
 * @param {string} params.category - e.g., 'task', 'security_request', 'auth'
 * @param {string|mongoose.Types.ObjectId} [params.referenceId] - Task ID, Security Request ID, etc.
 * @param {Array<{fieldName: string, from: any, to: any}>} [params.changes] - Array of field changes { fieldName, from, to }
 * @param {string} params.description - Short human-readable description
 * @param {string} [params.summary] - Fallback alias for description
 */
const createLog = async ({
  category,
  referenceId = null,
  description,
  changes,
  summary,
}) => {
  try {
    const desc = description || summary;
    if (!category || !desc || typeof desc !== "string" || !desc.trim()) {
      return;
    }

    const logData = {
      category,
      referenceId: referenceId || null,
      description: desc.trim(),
    };

    if (Array.isArray(changes) && changes.length > 0) {
      logData.changes = changes;
    }

    const logEntry = new Log(logData);
    await logEntry.save();
  } catch (error) {
    // Non-blocking log error
    console.error("❌ [LogService Error]:", error.message);
  }
};

module.exports = { createLog };


