class MerchantDashboardService {

    async merchantDashboard(message) {

        try {

            const text =
                message
                    ?.trim()
                    ?.toLowerCase();

            // =====================================
            // Dashboard Overview
            // =====================================

            if (
                text.includes("dashboard") ||
                text.includes("overview") ||
                text === "1"
            ) {

                return (
                    "📊 *Dashboard Overview*\n\n" +
                    "Your merchant dashboard provides an overview of collections, settlements and transactions.\n\n" +
                    "Please log in to your *ErtiPay Merchant Dashboard* to view the full overview."
                );

            }

            // =====================================
            // Settlement Report
            // FIX: Now raises support query — agent assists with report generation
            // =====================================

            if (
                text.includes("settlement report") ||
                text === "2"
            ) {

                return (
                    "__SUPPORT__:📑 *Settlement Report*\n\n" +
                    "Your request has been noted. Our support team will assist you in generating the settlement report shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // Collection Report
            // =====================================

            if (
                text.includes("collection report") ||
                text === "3"
            ) {

                return (
                    "__SUPPORT__:💰 *Collection Report*\n\n" +
                    "Your request has been noted. Our support team will assist you in generating the collection report shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // Transaction Report
            // =====================================

            if (
                text.includes("transaction report") ||
                text === "4"
            ) {

                return (
                    "__SUPPORT__:📄 *Transaction Report*\n\n" +
                    "Your request has been noted. Our support team will assist you in generating the transaction report shortly. 🙋‍♂️"
                );

            }

            // =====================================
            // Download Reports
            // =====================================

            if (
                text.includes("download report") ||
                text.includes("download reports") ||
                text === "5"
            ) {

                return (
                    "__SUPPORT__:⬇️ *Download Reports*\n\n" +
                    "Your request has been noted. Our support team will assist you in downloading the reports in your preferred format. 🙋‍♂️"
                );

            }

            // =====================================
            // Default Menu
            // =====================================

            return (

                "📊 *Merchant Dashboard*\n\n" +

                "Please choose an option:\n\n" +

                "1️⃣ Dashboard Overview\n" +
                "2️⃣ Settlement Report\n" +
                "3️⃣ Collection Report\n" +
                "4️⃣ Transaction Report\n" +
                "5️⃣ Download Reports\n\n" +

                "Reply with the option number or service name."

            );

        } catch (error) {
            return (
                "Unable to process your Merchant Dashboard request."
            );
        }

    }

}

module.exports = new MerchantDashboardService();