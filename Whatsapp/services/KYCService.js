class KYCService {

    async kyc(message) {

        try {

            const text =
                message
                    ?.trim()
                    ?.toLowerCase();

            // =====================================
            // Aadhaar Verification
            // FIX: Now raises support query — agent guides customer through process
            // =====================================

            if (
                text.includes("aadhaar") ||
                text.includes("aadhar") ||
                text === "1"
            ) {

                return (
                    "__SUPPORT__:🪪 *Aadhaar Verification*\n\n" +
                    "Your KYC request has been noted. Our support team will guide you through the Aadhaar verification process shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // PAN Verification
            // =====================================

            if (
                text.includes("pan") ||
                text === "2"
            ) {

                return (
                    "__SUPPORT__:🆔 *PAN Verification*\n\n" +
                    "Your KYC request has been noted. Our support team will guide you through the PAN verification process shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // GST Verification
            // =====================================

            if (
                text.includes("gst") ||
                text === "3"
            ) {

                return (
                    "__SUPPORT__:🏢 *GST Verification*\n\n" +
                    "Your KYC request has been noted. Our support team will guide you through the GST verification process shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // CIN Verification
            // =====================================

            if (
                text.includes("cin") ||
                text.includes("company") ||
                text === "4"
            ) {

                return (
                    "__SUPPORT__:🏛️ *CIN Verification*\n\n" +
                    "Your KYC request has been noted. Our support team will guide you through the CIN verification process shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // Bank Account Verification
            // =====================================

            if (
                text.includes("bank") ||
                text.includes("account verification") ||
                text === "5"
            ) {

                return (
                    "__SUPPORT__:🏦 *Bank Account Verification*\n\n" +
                    "Your KYC request has been noted. Our support team will guide you through the bank account verification process shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // Default Menu
            // =====================================

            return (

                "🪪 *KYC Verification*\n\n" +

                "Please choose an option:\n\n" +

                "1️⃣ Aadhaar Verification\n" +
                "2️⃣ PAN Verification\n" +
                "3️⃣ GST Verification\n" +
                "4️⃣ CIN Verification\n" +
                "5️⃣ Bank Account Verification\n\n" +

                "Reply with the option number or service name."

            );

        } catch (error) {
            return (
                "Unable to process your KYC request. Please try again later."
            );
        }

    }

}

module.exports = new KYCService();