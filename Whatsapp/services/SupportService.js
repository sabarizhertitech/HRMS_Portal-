class SupportService {

    async customerSupport(message) {

        try {

            const now = new Date();

            // IST Time
            const istTime = new Date(
                now.toLocaleString("en-US", {
                    timeZone: "Asia/Kolkata"
                })
            );

            const day = istTime.getDay();
            const hour = istTime.getHours();

            // Monday - Friday
            const isWeekDay =
                day >= 1 && day <= 5;

            // 10 AM - 6 PM
            const isBusinessHour =
                hour >= 10 && hour < 18;

            // =====================================
            // Business Hours
            // =====================================

            if (
                isWeekDay &&
                isBusinessHour
            ) {

                return (

                    "👨‍💼 *ErtiPay Customer Support*\n\n" +

                    "Our support team is currently available.\n\n" +

                    "A customer support executive will assist you shortly.\n\n" +

                    "Business Hours:\n" +
                    "Monday - Friday\n" +
                    "10:00 AM - 6:00 PM (IST)"

                );

            }

            // =====================================
            // Outside Business Hours
            // =====================================

            return (

                "🌙 *ErtiPay Customer Support*\n\n" +

                "Our support team is currently offline.\n\n" +

                "We will respond within *24-48 business hours*.\n\n" +

                "📧 Emergency Support:\n" +
                "hello@ertitech.com"

            );

        } catch (error) {
            return (
                "Unable to connect to customer support at the moment.\n\n" +
                "Please try again later."
            );
        }

    }

}

module.exports = new SupportService();