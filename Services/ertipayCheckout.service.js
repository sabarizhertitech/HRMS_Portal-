const axios = require("axios");

/**
 * Service to hit ErtiPay Checkout API (https://payin.ertipay.com/checkout/token)
 * directly without API keys or secret keys.
 * 
 * @param {Object} payload - Request body
 * @returns {Promise<Object>} Result object { success, status, data, error }
 */
async function generateCheckoutToken(payload = {}) {
  try {
    const url = "https://payin.ertipay.com/checkout/token";

    console.log(`[ErtiPay Service] Hitting ${url}...`);

    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        merchantId: "erti000001"
      },
      timeout: 20000,
    });

    console.log(`[ErtiPay Service] Response:`, response.data);

    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("[ErtiPay Service] Response:", JSON.stringify(errorDetails));

    return {
      success: false,
      status: error.response?.status || 500,
      error: errorDetails,
      message: error.response?.data?.message || error.message,
    };
  }
}

module.exports = {
  generateCheckoutToken,
};
