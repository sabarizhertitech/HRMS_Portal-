const { sendTemplateMessage } = require("../services/WhatsAppTemplateService");
const axios = require("axios");
const Customer = require("../models/Customer");

class WhatsAppTemplateController {

    // ============================
    // GET /api/whatsapp/templates
    // Fetch templates directly from Meta Graph API (or return local fallback presets)
    // ============================

    async getMetaTemplates(req, res) {

        try {

            const wabaId = process.env.WABA_ID;
            const token = process.env.WHATSAPP_TOKEN;

            if (!wabaId || !token) {
                throw new Error("Missing Meta credentials in backend config.");
            }

            const response = await axios.get(
                `https://graph.facebook.com/v23.0/${wabaId}/message_templates`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            return res.status(200).json({
                success: true,
                source: "META_API",
                templates: response.data?.data || []
            });

        } catch (error) {
            // Fallback templates to keep app fully operational if Meta credentials are not verified yet
            const fallbackTemplates = [
                {
                    name: "hello_world",
                    language: "en_US",
                    category: "UTILITY",
                    status: "APPROVED",
                    components: [
                        { type: "BODY", text: "Hello World! Welcome to ErtiPay." }
                    ]
                },
                {
                    name: "payment_success",
                    language: "en_IN",
                    category: "UTILITY",
                    status: "APPROVED",
                    components: [
                        { type: "BODY", text: "Hello {{1}}, your payment of {{2}} for Transaction ID {{3}} was successful." }
                    ]
                },
                {
                    name: "payout_status",
                    language: "en_IN",
                    category: "UTILITY",
                    status: "APPROVED",
                    components: [
                        { type: "BODY", text: "Hi {{1}}, your payout request ID {{2}} has been processed. Status: {{3}}." }
                    ]
                },
                {
                    name: "seasonal_promo",
                    language: "en_US",
                    category: "MARKETING",
                    status: "APPROVED",
                    components: [
                        { type: "BODY", text: "Great news {{1}}! Enjoy 15% discount on ErtiPay connected banking fees this month." }
                    ]
                }
            ];

            return res.status(200).json({
                success: true,
                source: "FALLBACK_PRESETS",
                message: "Meta integration pending. Loaded fallback templates.",
                templates: fallbackTemplates
            });

        }

    }

    async sendBulkTemplate(req, res) {

        try {

            const { users } = req.body;

            if (!users || !Array.isArray(users)) {

                return res.status(400).json({
                    success: false,
                    message: "Users array is required."
                });

            }

            const results = [];

            for (const user of users) {

                try {

                    // Auto-save the number to the DB if it doesn't exist
                    const exists = await Customer.findOne({ mobileNumber: user.phone });
                    if (!exists) {
                        const customerId = `CUST-${user.phone}`;
                        const customer = new Customer({
                            customerName: `User-${user.phone}`,
                            mobileNumber: user.phone,
                            customerId,
                            category: "Customer"
                        });
                        await customer.save();
                    }

                    const response = await sendTemplateMessage(user.phone);

                    results.push({
                        phone: user.phone,
                        success: true,
                        response
                    });

                } catch (error) {

                    results.push({
                        phone: user.phone,
                        success: false,
                        error: error.response?.data || error.message
                    });

                }

            }

            return res.status(200).json({

                success: true,
                totalUsers: users.length,
                successCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
                results

            });

        } catch (error) {

            console.error("WhatsApp Template Controller Error:", error);

            return res.status(500).json({

                success: false,
                message: error.message

            });

        }

    }

}

module.exports = new WhatsAppTemplateController();