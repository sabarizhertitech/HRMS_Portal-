const express = require("express");
const router = express.Router();
const ertipayCheckoutController = require("../controllers/ertipayCheckout.controller");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");

router.use(sanitizeRequestData);

/**
 * Route: POST /api/ertipay/checkout/token
 * Calls https://payin.ertipay.com/checkout/token
 */
router.post("/checkout/token", ertipayCheckoutController.createCheckoutToken);

module.exports = router;
