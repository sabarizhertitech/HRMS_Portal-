/**
 * Helper to determine whether an employee is currently inside their Probation Period.
 *
 * Rules:
 * - If an employee has not completed 1 year (< 12 months from dateJoined/createdAt),
 *   they are considered a Probationary Employee.
 * - If probationPeriodMonths is explicitly specified (e.g. 3, 6, or 12 months),
 *   that custom duration is used; otherwise, it defaults to 12 months (1 year).
 * - Once currentDate >= probationEndDate (>= 1 year of service), they automatically become a Permanent Employee.
 */
function isEmployeeInProbation(employee) {
  if (!employee) return false;

  // If isProbation is not true (or not present), employee is NOT on probation
  if (employee.isProbation !== true && employee.probationPeriod !== "yes") {
    return false;
  }

  const rawDate = employee.dateJoined || employee.createdAt;
  if (!rawDate) return false;

  const joiningDate = new Date(rawDate);
  if (isNaN(joiningDate.getTime())) {
    return false;
  }

  const customMonths = Number(employee.probationPeriodMonths);
  const probationMonths = customMonths && customMonths > 0 ? customMonths : 12;

  const currentDate = new Date();
  const probationEndDate = new Date(joiningDate);
  probationEndDate.setMonth(probationEndDate.getMonth() + probationMonths);

  // Less than probation period -> in Probation!
  return currentDate < probationEndDate;
}

module.exports = {
  isEmployeeInProbation,
};
