const { generateCheckoutToken } = require("../Services/ertipayCheckout.service");
const apiLogger = require("../utils/apiLogger");

/**
 * Controller to hit https://payin.ertipay.com/checkout/token
 */
const ertipayCheckoutController = {
  async createCheckoutToken(req, res) {
    try {
      const payload = req.body || {};

      const result = await generateCheckoutToken(payload);

      return res.status(result.status || 200).json(result.data || result.error || {
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      console.error("❌ createCheckoutToken controller error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error while hitting ErtiPay checkout URL",
        error: error.message,
      });
    }
  },
};

module.exports = apiLogger(
  ertipayCheckoutController,
  "ertipayCheckout.controller.js"
);
