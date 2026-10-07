// utils/sendWhatsApp.js
const axios = require("axios");

/**
 * Send a WhatsApp text message via Meta Cloud API
 * @param {string} to - Destination phone number
 * @param {string} message - Message text
 * @returns {Promise<object>} - API response data
 */
const sendWhatsAppMessage = async (to, message) => {
    try {
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
        const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
        const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

        const response = await axios.post(
            `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "text",
                text: {
                    preview_url: false,
                    body: message,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return response.data;
    } catch (error) {
        console.error(
            "sendWhatsApp Utility Error:",
            error.response?.data || error.message
        );
        throw error;
    }
};

module.exports = sendWhatsAppMessage;
