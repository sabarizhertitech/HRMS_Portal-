class PricingService {

    async pricing(message) {

        try {

            const text =
                message
                    ?.trim()
                    ?.toLowerCase();

            // =====================================
            // PayIn Charges
            // =====================================

            if (
                text.includes("payin") ||
                text.includes("pay in") ||
                text === "1"
            ) {

                return (
                    "💳 *PayIn Charges*\n\n" +
                    "PayIn pricing depends on your merchant category and monthly transaction volume.\n\n" +
                    "Please contact our sales team for the latest pricing."
                );

            }

            // =====================================
            // Connected Banking Charges
            // =====================================

            if (
                text.includes("connected banking") ||
                text.includes("banking") ||
                text === "2"
            ) {

                return (
                    "🏦 *Connected Banking Charges*\n\n" +
                    "Connected Banking pricing varies based on the selected APIs and monthly transaction volume."
                );

            }

            // =====================================
            // API Pricing
            // =====================================

            if (
                text.includes("api") ||
                text.includes("api pricing") ||
                text === "3"
            ) {

                return (
                    "🧑‍💻 *API Pricing*\n\n" +
                    "API pricing depends on the selected services and estimated monthly API requests."
                );

            }

            // =====================================
            // KYC Pricing
            // =====================================

            if (
                text.includes("kyc") ||
                text.includes("aadhaar") ||
                text.includes("aadhar") ||
                text.includes("pan") ||
                text.includes("gst") ||
                text.includes("cin") ||
                text === "4"
            ) {

                return (
                    "🪪 *KYC Pricing*\n\n" +
                    "Verification charges vary for Aadhaar, PAN, GST, CIN and Bank Account Verification APIs."
                );

            }

            // =====================================
            // QR Pricing
            // =====================================

            if (
                text.includes("qr") ||
                text.includes("qr pricing") ||
                text === "5"
            ) {

                return (
                    "📱 *QR Pricing*\n\n" +
                    "Static QR and Dynamic QR pricing depends on your merchant plan."
                );

            }

            // =====================================
            // Default Menu
            // =====================================

            return (

                "💲 *Pricing & Charges*\n\n" +

                "Please choose an option:\n\n" +

                "1️⃣ PayIn Charges\n" +
                "2️⃣ Connected Banking Charges\n" +
                "3️⃣ API Pricing\n" +
                "4️⃣ KYC Pricing\n" +
                "5️⃣ QR Pricing\n\n" +

                "Reply with the option number or service name."

            );

        } catch (error) {
            return (
                "Unable to process your pricing request. Please try again later."
            );
        }

    }

}

module.exports = new PricingService();