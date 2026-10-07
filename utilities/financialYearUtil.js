const getCurrentFinancialYear = (date = new Date()) => {
  const d = new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const calculateServiceMonths = (joiningDate, currentDate = new Date()) => {
  if (!joiningDate) return 0;
  const jDate = new Date(joiningDate);
  if (isNaN(jDate.getTime())) return 0;
  
  const cDate = new Date(currentDate);
  let months =
    (cDate.getFullYear() - jDate.getFullYear()) * 12 +
    (cDate.getMonth() - jDate.getMonth());
  if (cDate.getDate() < jDate.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
};

const calculateCategoryLeaves = (category, serviceMonths = 0, inProbation = false) => {
  if (!category) return 0;

  const othersCount = inProbation
    ? (category.probationOthersLeaveCount !== undefined && category.probationOthersLeaveCount !== null && category.probationOthersLeaveCount !== "" ? Number(category.probationOthersLeaveCount) : 0)
    : (category.permanentOthersLeaveCount !== undefined && category.permanentOthersLeaveCount !== null && category.permanentOthersLeaveCount !== "" ? Number(category.permanentOthersLeaveCount) : 0);

  if (category.tiers && category.tiers.length > 0) {
    // 1. Filter tiers by employeeType (probation vs permanent)
    const matchingTypeTiers = category.tiers.filter((t) => {
      let type = t.employeeType;
      if (!type || type === "All") {
        const unit = t.durationUnit || "months";
        const m = Number(t.eligibleMonths || 0);
        type = (unit === "years" || m > 12) ? "Permanent Employee" : "Probationary Employee";
      }
      if (inProbation) {
        return type === "Probationary Employee" || type === "Probation";
      } else {
        return type === "Permanent Employee" || type === "Permanent";
      }
    });

    // Helper to get min and max months for a tier
    const getTierMonthRange = (t) => {
      let minM = 0;
      let maxM = null;

      const fY = t.fromYear !== undefined && t.fromYear !== null && t.fromYear !== "" ? Number(t.fromYear) : 0;
      const fM = t.fromMonth !== undefined && t.fromMonth !== null && t.fromMonth !== "" ? Number(t.fromMonth) : 0;
      const tY = t.toYear !== undefined && t.toYear !== null && t.toYear !== "" ? Number(t.toYear) : null;
      const tM = t.toMonth !== undefined && t.toMonth !== null && t.toMonth !== "" ? Number(t.toMonth) : null;

      if (t.fromYear !== undefined || t.fromMonth !== undefined || t.toYear !== undefined || t.toMonth !== undefined) {
        minM = (fY * 12) + fM;
        if (tY !== null && tM !== null) {
          maxM = (tY * 12) + tM;
        } else if (t.maxDuration !== undefined && t.maxDuration !== null && t.maxDuration !== "") {
          maxM = Number(t.maxDuration);
        }
      } else {
        minM = t.minDuration !== undefined && t.minDuration !== null && t.minDuration !== ""
          ? Number(t.minDuration)
          : Number(t.eligibleMonths || 0);

        maxM = t.maxDuration !== undefined && t.maxDuration !== null && t.maxDuration !== ""
          ? Number(t.maxDuration)
          : (t.maxEligibleMonths !== undefined && t.maxEligibleMonths !== null && t.maxEligibleMonths !== "" ? Number(t.maxEligibleMonths) : null);
      }

      return { minM, maxM };
    };

    if (matchingTypeTiers.length > 0) {
      // 2. Look for exact range match: minM <= serviceMonths <= maxM
      const exactRangeMatch = matchingTypeTiers.find((t) => {
        const { minM, maxM } = getTierMonthRange(t);
        if (serviceMonths >= minM) {
          if (maxM === null || maxM === undefined) return true;
          return serviceMonths <= maxM;
        }
        return false;
      });

      if (exactRangeMatch) {
        return Number(exactRangeMatch.leaveCount) || 0;
      }

      // 3. If employee's duration does not fall into ANY tier range -> return Others Leave Count
      return othersCount;
    }

    // If no matching tiers configured for this type -> return Others Leave Count
    return othersCount;
  }

  // If no tiers exist at all -> return Others Leave Count (or category.leaveCount)
  return othersCount !== undefined && othersCount !== null ? othersCount : (category.leaveCount || 0);
};

module.exports = {
  getCurrentFinancialYear,
  calculateServiceMonths,
  calculateCategoryLeaves,
};
