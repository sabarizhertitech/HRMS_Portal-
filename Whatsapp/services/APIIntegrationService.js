class APIIntegrationService {

    async apiIntegration(message) {

        try {

            const text =
                message
                    ?.trim()
                    ?.toLowerCase();

            const supportFooter =
                "\n\n━━━━━━━━━━━━━━━━━━━━\n" +
                "🙋 *Need our Support Team to assist with this integration?*\n" +
                "Reply *Yes* to connect with our support team or *No* to continue chatting!";

            // =====================================
            // 1. API Documentation
            // =====================================

            if (
                text.includes("documentation") ||
                text.includes("api documentation") ||
                text === "1"
            ) {

                return (
                    "📘 *API Documentation*\n\n" +
                    "You have selected *API Documentation*.\n\n" +
                    "Our complete integration documentation includes authentication headers, endpoints, request/response formats, and webhook specifications.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // 2. Generate API Key
            // =====================================

            if (
                text.includes("api key") ||
                text.includes("generate api key") ||
                text === "2"
            ) {

                return (
                    "🔑 *Generate API Key*\n\n" +
                    "You have selected *Generate API Key*.\n\n" +
                    "API Keys (Public Key and Secret Key) can be generated from your *Merchant Dashboard* under *Settings → API Keys* after successful account onboarding.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // 3. Sandbox Access
            // =====================================

            if (
                text.includes("sandbox") ||
                text.includes("uat") ||
                text === "3"
            ) {

                return (
                    "🧪 *Sandbox Access*\n\n" +
                    "You have selected *Sandbox Access*.\n\n" +
                    "Sandbox credentials allow developers to simulate payments, payouts, and webhooks in a test environment without real money.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // 4. Webhook Configuration
            // =====================================

            if (
                text.includes("webhook") ||
                text.includes("callback") ||
                text === "4"
            ) {

                return (
                    "🔗 *Webhook Configuration*\n\n" +
                    "You have selected *Webhook Configuration*.\n\n" +
                    "Configure your Webhook endpoint URL in your *Merchant Dashboard* under *Settings → Webhooks* to receive real-time notifications for payment and payout updates.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // 5. SDK Integration
            // =====================================

            if (
                text.includes("sdk") ||
                text === "5"
            ) {

                return (
                    "💻 *SDK Integration*\n\n" +
                    "You have selected *SDK Integration*.\n\n" +
                    "We provide SDK libraries and sample code for Node.js, Python, Java, and PHP to speed up your integration.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // 6. API Status
            // =====================================

            if (
                text.includes("api status") ||
                text.includes("status") ||
                text === "6"
            ) {

                return (
                    "🟢 *API Status*\n\n" +
                    "You have selected *API Status*.\n\n" +
                    "All ErtiPay APIs (PayIn, Payouts, Connected Banking, and KYC verification) are active and operational.\n\n" +
                    "📧 Contact our team: *hello@ertitech.com*" +
                    supportFooter
                );

            }

            // =====================================
            // Default Menu
            // =====================================

            return (
                "🧑‍💻 *API Integration Services*\n\n" +
                "Please choose an option:\n\n" +
                "1️⃣ *API Documentation*\n" +
                "2️⃣ *Generate API Key*\n" +
                "3️⃣ *Sandbox Access*\n" +
                "4️⃣ *Webhook Configuration*\n" +
                "5️⃣ *SDK Integration*\n" +
                "6️⃣ *API Status*\n\n" +
                "Reply with the option number or service name."
            );

        } catch (error) {
            return (
                "Unable to process your API Integration request."
            );
        }

    }

}

module.exports = new APIIntegrationService();