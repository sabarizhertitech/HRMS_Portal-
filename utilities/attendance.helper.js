const moment = require("moment-timezone");

/**
 * Returns auto checkout time (8:00 PM IST) for a given date
 */
exports.getAutoCheckoutTime = (date) => {
  return moment(date)
    .tz("Asia/Kolkata")
    .hour(20)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toDate();
};