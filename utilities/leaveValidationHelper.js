/**
 * Utility functions for validating leave category tiers and ranges.
 */

const ALLOWED_EMPLOYEE_TYPES = [
  "Probationary Employee",
  "Permanent Employee",
  "All",
];

/**
 * Validates an array of tiers for:
 * 1. Allowed employee types
 * 2. Non-negative integer values for years, months, and leave counts
 * 3. Month bounds (0 to 11)
 * 4. From <= To duration (eligibleMonths <= maxEligibleMonths)
 * 5. Non-overlapping ranges for tiers of the same employee type
 *
 * @param {Array} tiers - Array of raw tier objects
 * @returns {{ isValid: boolean, error?: string, processedTiers?: Array }}
 */
function validateAndProcessTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return { isValid: false, error: "At least one leave rule tier is required." };
  }

  const processedTiers = [];

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (
      t.leaveCount === "" ||
      t.leaveCount === null ||
      t.leaveCount === undefined
    ) {
      continue;
    }

    const employeeType = t.employeeType || "All";
    if (!ALLOWED_EMPLOYEE_TYPES.includes(employeeType)) {
      return {
        isValid: false,
        error: `Rule ${i + 1}: Invalid employee type "${employeeType}". Allowed types are: ${ALLOWED_EMPLOYEE_TYPES.join(", ")}.`,
      };
    }

    const leaveCount = Number(t.leaveCount);
    if (isNaN(leaveCount) || !Number.isInteger(leaveCount) || leaveCount < 0) {
      return {
        isValid: false,
        error: `Rule ${i + 1} (${employeeType}): Leave count must be a non-negative whole number.`,
      };
    }

    const rawFromY = t.fromYear !== undefined && t.fromYear !== "" && t.fromYear !== null ? Number(t.fromYear) : 0;
    const rawFromM = t.fromMonth !== undefined && t.fromMonth !== "" && t.fromMonth !== null
      ? Number(t.fromMonth)
      : (t.minDuration !== undefined && t.minDuration !== "" ? Number(t.minDuration) : (Number(t.eligibleMonths) || 0));

    const rawToY = t.toYear !== undefined && t.toYear !== "" && t.toYear !== null ? Number(t.toYear) : rawFromY;
    const rawToM = t.toMonth !== undefined && t.toMonth !== "" && t.toMonth !== null
      ? Number(t.toMonth)
      : (t.maxDuration !== undefined && t.maxDuration !== "" ? Number(t.maxDuration) : (t.maxEligibleMonths !== undefined && t.maxEligibleMonths !== null ? Number(t.maxEligibleMonths) : rawFromM));

    if (
      isNaN(rawFromY) || !Number.isInteger(rawFromY) || rawFromY < 0 ||
      isNaN(rawFromM) || !Number.isInteger(rawFromM) || rawFromM < 0 ||
      isNaN(rawToY) || !Number.isInteger(rawToY) || rawToY < 0 ||
      isNaN(rawToM) || !Number.isInteger(rawToM) || rawToM < 0
    ) {
      return {
        isValid: false,
        error: `Rule ${i + 1} (${employeeType}): Year and month values must be non-negative integers.`,
      };
    }

    // Check month limits if year is explicitly specified (or if months > 11)
    if (rawFromM > 11 && rawFromY > 0) {
      return {
        isValid: false,
        error: `Rule ${i + 1} (${employeeType}): 'From' month must be between 0 and 11 when years are used.`,
      };
    }
    if (rawToM > 11 && rawToY > 0) {
      return {
        isValid: false,
        error: `Rule ${i + 1} (${employeeType}): 'To' month must be between 0 and 11 when years are used.`,
      };
    }

    const eligibleMonths = (rawFromY * 12) + rawFromM;
    const maxEligibleMonths = (rawToY * 12) + rawToM;

    if (maxEligibleMonths < eligibleMonths) {
      return {
        isValid: false,
        error: `Rule ${i + 1} (${employeeType}): 'To' duration (${rawToY}Y ${rawToM}M) cannot be less than 'From' duration (${rawFromY}Y ${rawFromM}M).`,
      };
    }

    processedTiers.push({
      employeeType,
      fromYear: rawFromY,
      fromMonth: rawFromM,
      toYear: rawToY,
      toMonth: rawToM,
      minDuration: eligibleMonths,
      maxDuration: maxEligibleMonths,
      durationUnit: t.durationUnit || "months",
      eligibleMonths,
      maxEligibleMonths,
      leaveCount,
    });
  }

  if (processedTiers.length === 0) {
    return { isValid: false, error: "At least one valid leave rule is required." };
  }

  // ── Overlap Validation ──
  // Group tiers by employeeType and check each group for interval overlaps
  const grouped = {
    "Probationary Employee": [],
    "Permanent Employee": [],
    "All": [],
  };

  processedTiers.forEach((tier) => {
    grouped[tier.employeeType]?.push(tier);
  });

  for (const [type, groupTiers] of Object.entries(grouped)) {
    if (groupTiers.length <= 1) continue;

    // Sort ascending by eligibleMonths
    groupTiers.sort((a, b) => a.eligibleMonths - b.eligibleMonths);

    for (let j = 1; j < groupTiers.length; j++) {
      const prev = groupTiers[j - 1];
      const curr = groupTiers[j];

      // Overlap occurs if current fromMonths <= previous toMonths
      if (curr.eligibleMonths <= prev.maxEligibleMonths) {
        const prevFrom = prev.fromYear > 0 ? `${prev.fromYear}Y ${prev.fromMonth}M` : `${prev.fromMonth}M`;
        const prevTo = prev.toYear > 0 ? `${prev.toYear}Y ${prev.toMonth}M` : `${prev.toMonth}M`;
        const currFrom = curr.fromYear > 0 ? `${curr.fromYear}Y ${curr.fromMonth}M` : `${curr.fromMonth}M`;
        const currTo = curr.toYear > 0 ? `${curr.toYear}Y ${curr.toMonth}M` : `${curr.toMonth}M`;

        return {
          isValid: false,
          error: `Overlapping ranges detected for ${type}: [${prevFrom} – ${prevTo}] overlaps with [${currFrom} – ${currTo}]. Please adjust your durations so ranges do not overlap.`,
        };
      }
    }
  }

  return { isValid: true, processedTiers };
}

module.exports = {
  ALLOWED_EMPLOYEE_TYPES,
  validateAndProcessTiers,
};
