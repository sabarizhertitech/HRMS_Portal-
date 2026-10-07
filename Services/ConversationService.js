exports.generateConversationReply = async (message) => {

    try {

        const text =
            message?.text?.body
                ?.trim()
                ?.toLowerCase();

        if (!text) {

            return (
                "I can only understand text messages right now."
            );
        }

        // =====================================
        // Greetings
        // =====================================

        if (
            text.includes("hi") ||
            text.includes("hello") ||
            text.includes("hey")
        ) {

            return (
                "Hey 👋\n" +
                "How are you doing today?"
            );
        }

        // =====================================
        // How are you
        // =====================================

        if (
            text.includes("how are you")
        ) {

            return (
                "I'm doing great 😄\n" +
                "What about you?"
            );
        }

        // =====================================
        // Name
        // =====================================

        if (
            text.includes("your name")
        ) {

            return (
                "I'm ErtiPay Assistant 🚀"
            );
        }

        // =====================================
        // Bye
        // =====================================

        if (
            text.includes("bye")
        ) {

            return (
                "Goodbye 👋\n" +
                "Have a great day."
            );
        }

        // =====================================
        // Thanks
        // =====================================

        if (
            text.includes("thank")
        ) {

            return (
                "You're welcome 😄"
            );
        }

        // =====================================
        // Default Reply
        // =====================================

        return (
            "I received your message:\n\n" +
            `"${message.text.body}"\n\n` +
            "Our team will respond soon 🚀"
        );

    } catch (error) {

        console.log(
            "Conversation Service Error:",
            error.message
        );

        return (
            "Something went wrong."
        );
    }
};