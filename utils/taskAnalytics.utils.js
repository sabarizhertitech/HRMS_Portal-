/**
 * Task Analytics Utility Functions
 * Deterministic, pure calculation functions for Task Analytics Engine.
 */

// Canonical task statuses
const TASK_STATUS = Object.freeze({
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  ON_HOLD: "ON_HOLD",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
});

// Deadline result classifications
const DEADLINE_RESULT = Object.freeze({
  AHEAD: "AHEAD",
  ON_TIME: "ON_TIME",
  LATE: "LATE",
  OVERDUE: "OVERDUE",
  IN_PROGRESS: "IN_PROGRESS",
  ON_HOLD: "ON_HOLD",
  REJECTED: "REJECTED",
  PENDING: "PENDING",
  UNKNOWN: "UNKNOWN",
});

// Configurable weights for delivery performance score (Sum = 1.0 or 100)
const PERFORMANCE_WEIGHTS = Object.freeze({
  COMPLETION_RATE: 0.30,       // 30%
  ON_TIME_RATE: 0.30,          // 30%
  DEADLINE_RELIABILITY: 0.20,  // 20%
  PHASE_COMPLETION: 0.10,      // 10%
  CONSISTENCY: 0.10,           // 10%
});

// Ranking sample size thresholds
const RANKING_THRESHOLDS = Object.freeze({
  MINIMUM_TASKS: 5,
  INSUFFICIENT: 4,  // 0 - 4 tasks
  LIMITED: 14,      // 5 - 14 tasks
  MODERATE: 29,     // 15 - 29 tasks
  // 30+ tasks is HIGH
});

/**
 * Normalizes any variation of task / assignment status string into a canonical status.
 * Does NOT alter database values; only used internally by the analytics engine.
 *
 * @param {string} status - Raw status string
 * @returns {string} One of TASK_STATUS values
 */
function normalizeTaskStatus(status) {
  if (!status) return TASK_STATUS.PENDING;

  const value = String(status)
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");

  if (["completed", "complete", "done", "finished"].includes(value)) {
    return TASK_STATUS.COMPLETED;
  }

  if (["inprogress", "inprocess", "working", "started", "active"].includes(value)) {
    return TASK_STATUS.IN_PROGRESS;
  }

  if (["hold", "onhold", "paused", "waiting"].includes(value)) {
    return TASK_STATUS.ON_HOLD;
  }

  if (["rejected", "ignored", "reject", "declined", "cancelled", "canceled"].includes(value)) {
    return TASK_STATUS.REJECTED;
  }

  if (["assigned", "allocated", "pending", "unassigned", "new", "todo"].includes(value)) {
    return TASK_STATUS.PENDING;
  }

  return TASK_STATUS.UNKNOWN;
}

/**
 * Calculates duration between two dates in milliseconds, hours, days and structured components.
 * Returns null if either start or end date is invalid/missing.
 * If end < start, returns valid zero duration (prevents invalid negative durations).
 *
 * @param {Date|string|number} startDate
 * @param {Date|string|number} endDate
 * @returns {object|null}
 */
function calculateDuration(startDate, endDate) {
  if (startDate === undefined || startDate === null || endDate === undefined || endDate === null) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Number((diffMs / 3600000).toFixed(2));
  const totalDays = Number((diffMs / 86400000).toFixed(2));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formatted = formatDuration(diffMs);
  const compact = `${days}d ${hours}h ${minutes}m`;
  const daysHours = `${days}d ${hours}h`;

  return {
    totalMs: diffMs,
    totalHours,
    totalDays,
    days,
    hours,
    minutes,
    seconds,
    formatted,
    compact,
    daysHours,
  };
}

/**
 * Formats milliseconds into human-readable string.
 *
 * @param {number} ms - Milliseconds
 * @returns {string} e.g. "2 Days, 5 Hours, 30 Mins"
 */
function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} Day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} Hour${hours > 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} Min${minutes > 1 ? "s" : ""}`);
  if (parts.length === 0 && seconds > 0) parts.push(`${seconds} Sec${seconds > 1 ? "s" : ""}`);
  if (parts.length === 0) return "0 Mins";

  return parts.join(", ");
}

/**
 * Calculates deadline variance:
 * varianceMs = completedDate - dueDate
 *
 * Negative (< 0): Completed early (Ahead of deadline)
 * Zero (== 0): Completed exactly at deadline (On time)
 * Positive (> 0): Completed late
 *
 * @param {Date|string|number} completedDate - Date when task was completed
 * @param {Date|string|number} dueDate - Due date / deadline
 * @returns {object|null}
 */
function calculateVariance(completedDate, dueDate) {
  if (!completedDate || !dueDate) return null;

  const completion = new Date(completedDate);
  const due = new Date(dueDate);

  if (isNaN(completion.getTime()) || isNaN(due.getTime())) return null;

  const varianceMs = completion.getTime() - due.getTime();
  const absMs = Math.abs(varianceMs);

  const varianceHours = Number((varianceMs / 3600000).toFixed(2));
  const varianceDays = Number((varianceMs / 86400000).toFixed(2));

  const isAhead = varianceMs < 0;
  const isExactlyOnTime = varianceMs === 0;
  const isLate = varianceMs > 0;

  let varianceFormatted = "On Time";
  if (isAhead) {
    varianceFormatted = `${formatDuration(absMs)} ahead`;
  } else if (isLate) {
    varianceFormatted = `${formatDuration(absMs)} late`;
  }

  return {
    varianceMs,
    varianceHours,
    varianceDays,
    isAhead,
    isExactlyOnTime,
    isLate,
    varianceFormatted,
  };
}

/**
 * Classifies deadline outcome for a task.
 *
 * @param {string} normalizedStatus - Canonical status (COMPLETED, IN_PROGRESS, etc.)
 * @param {Date|string|number} endDate - Completion date if completed
 * @param {Date|string|number} dueDate - Due date
 * @param {Date} [now=new Date()] - Reference current date
 * @returns {string} One of DEADLINE_RESULT
 */
function getDeadlineResult(normalizedStatus, endDate, dueDate, now = new Date()) {
  if (normalizedStatus === TASK_STATUS.REJECTED) {
    return DEADLINE_RESULT.REJECTED;
  }

  const due = dueDate ? new Date(dueDate) : null;
  const hasValidDue = due && !isNaN(due.getTime());

  if (normalizedStatus === TASK_STATUS.COMPLETED) {
    if (!hasValidDue) {
      return DEADLINE_RESULT.ON_TIME;
    }

    const end = endDate ? new Date(endDate) : null;
    const hasValidEnd = end && !isNaN(end.getTime());

    if (!hasValidEnd) {
      return DEADLINE_RESULT.ON_TIME;
    }

    if (end.getTime() < due.getTime()) {
      return DEADLINE_RESULT.AHEAD;
    } else if (end.getTime() === due.getTime()) {
      return DEADLINE_RESULT.ON_TIME;
    } else {
      return DEADLINE_RESULT.LATE;
    }
  }

  // Not completed
  if (hasValidDue && now.getTime() > due.getTime()) {
    return DEADLINE_RESULT.OVERDUE;
  }

  if (normalizedStatus === TASK_STATUS.IN_PROGRESS) {
    return DEADLINE_RESULT.IN_PROGRESS;
  }

  if (normalizedStatus === TASK_STATUS.ON_HOLD) {
    return DEADLINE_RESULT.ON_HOLD;
  }

  return DEADLINE_RESULT.PENDING;
}

/**
 * Safely calculates percentage without NaN or Infinity.
 *
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [decimals=1]
 * @returns {number} 0 - 100
 */
function calculatePercentage(numerator, denominator, decimals = 1) {
  const num = Number(numerator) || 0;
  const den = Number(denominator) || 0;

  if (den <= 0 || isNaN(num) || isNaN(den)) {
    return 0;
  }

  const result = (num / den) * 100;
  const clamped = Math.max(0, Math.min(100, result));
  return Number(clamped.toFixed(decimals));
}

/**
 * Calculates delivery performance score (0 - 100) based on weighted formula:
 * 30% Completion Rate
 * 30% On-Time Completion Rate (Ahead + On Time)
 * 20% Deadline Reliability (On-Time / Completed)
 * 10% Phase Completion Rate
 * 10% Consistency Score
 *
 * @param {object} params
 * @param {number} params.completionRate - (0 - 100)
 * @param {number} params.onTimeRate - (0 - 100)
 * @param {number} params.deadlineReliability - (0 - 100)
 * @param {number} params.phaseCompletionRate - (0 - 100)
 * @param {number} params.consistencyScore - (0 - 100)
 * @returns {number} Score 0 - 100 (rounded to 1 decimal)
 */
function calculatePerformanceScore({
  completionRate = 0,
  onTimeRate = 0,
  deadlineReliability = 0,
  phaseCompletionRate = 0,
  consistencyScore = 0,
}) {
  const cRate = Math.max(0, Math.min(100, Number(completionRate) || 0));
  const otRate = Math.max(0, Math.min(100, Number(onTimeRate) || 0));
  const drRate = Math.max(0, Math.min(100, Number(deadlineReliability) || 0));
  const pRate = Math.max(0, Math.min(100, Number(phaseCompletionRate) || 0));
  const csScore = Math.max(0, Math.min(100, Number(consistencyScore) || 0));

  const weightedScore =
    cRate * PERFORMANCE_WEIGHTS.COMPLETION_RATE +
    otRate * PERFORMANCE_WEIGHTS.ON_TIME_RATE +
    drRate * PERFORMANCE_WEIGHTS.DEADLINE_RELIABILITY +
    pRate * PERFORMANCE_WEIGHTS.PHASE_COMPLETION +
    csScore * PERFORMANCE_WEIGHTS.CONSISTENCY;

  return Number(weightedScore.toFixed(1));
}

/**
 * Calculates a deterministic consistency score (0 - 100) based on available task data:
 * - On-time delivery stability (up to 40 pts)
 * - Overdue penalty factor (up to 30 pts)
 * - Steady completion ratio (up to 30 pts)
 *
 * @param {object} params
 * @param {number} params.onTimeRate - Percentage of completed tasks on time
 * @param {number} params.overdueCount - Number of currently overdue tasks
 * @param {number} params.totalTasks - Total assigned valid tasks
 * @param {number} params.completedTasks - Total completed tasks
 * @returns {number} Consistency score (0 - 100)
 */
function calculateConsistencyScore({
  onTimeRate = 0,
  overdueCount = 0,
  totalTasks = 0,
  completedTasks = 0,
}) {
  if (totalTasks === 0) return 0;

  // 1. On-time delivery component (40%)
  const onTimeComponent = (Math.max(0, Math.min(100, Number(onTimeRate) || 0)) / 100) * 40;

  // 2. Overdue penalty component (30%): Overdue tasks severely reduce consistency
  const overdueRatio = totalTasks > 0 ? (Number(overdueCount) || 0) / totalTasks : 0;
  const overdueScore = Math.max(0, 30 * (1 - Math.min(1, overdueRatio * 2)));

  // 3. Completion stability component (30%): Proportion of assigned tasks progressed/completed
  const completionRatio = totalTasks > 0 ? (Number(completedTasks) || 0) / totalTasks : 0;
  const completionScore = Math.min(30, completionRatio * 30);

  const totalScore = onTimeComponent + overdueScore + completionScore;
  return Number(Math.max(0, Math.min(100, totalScore)).toFixed(1));
}

/**
 * Determines ranking eligibility and sample-size confidence.
 *
 * @param {number} tasksEvaluated - Number of valid performance tasks evaluated
 * @param {number} [minTasks=5] - Configurable minimum threshold
 * @returns {object} { rankingEligible, confidence, label }
 */
function getRankingEligibility(tasksEvaluated, minTasks = RANKING_THRESHOLDS.MINIMUM_TASKS) {
  const count = Math.max(0, Number(tasksEvaluated) || 0);

  if (count < minTasks) {
    return {
      rankingEligible: false,
      confidence: "INSUFFICIENT",
      label: `Insufficient data (${count}/${minTasks} tasks)`,
      minTasksRequired: minTasks,
    };
  }

  if (count <= RANKING_THRESHOLDS.LIMITED) {
    return {
      rankingEligible: true,
      confidence: "LIMITED",
      label: "Limited data",
      minTasksRequired: minTasks,
    };
  }

  if (count <= RANKING_THRESHOLDS.MODERATE) {
    return {
      rankingEligible: true,
      confidence: "MODERATE",
      label: "Moderate data",
      minTasksRequired: minTasks,
    };
  }

  return {
    rankingEligible: true,
    confidence: "HIGH",
    label: "High confidence",
    minTasksRequired: minTasks,
  };
}

module.exports = {
  TASK_STATUS,
  DEADLINE_RESULT,
  PERFORMANCE_WEIGHTS,
  RANKING_THRESHOLDS,
  normalizeTaskStatus,
  calculateDuration,
  formatDuration,
  calculateVariance,
  getDeadlineResult,
  calculatePercentage,
  calculatePerformanceScore,
  calculateConsistencyScore,
  getRankingEligibility,
};
