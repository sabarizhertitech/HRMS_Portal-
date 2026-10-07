const axios = require("axios");

exports.sendTemplateMessage =
    async (phone) => {

        try {

            const response =
                await axios.post(

                    `https://graph.facebook.com/v23.0/${process.env.PHONE_NUMBER_ID}/messages`,

                    {
                        messaging_product: "whatsapp",

                        to: phone,

                        type: "template",

                        template: {
                            name: "hello_world",
                            language: {
                                code: "en_US"
                            }
                        }
                    },

                    {
                        headers: {

                            Authorization:
                                `Bearer ${process.env.WHATSAPP_TOKEN}`,

                            "Content-Type":
                                "application/json"
                        }
                    }
                );

            // Log outgoing template to MessageLog DB
            try {
                const MessageLog = require("../models/MessageLog");
                const msgId = response.data?.messages?.[0]?.id || `msg-template-${Date.now()}`;
                await MessageLog.create({
                    whatsappMessageId: msgId,
                    messageType: "Text",
                    messageStatus: "Sent",
                    sender: phone,
                    timestamp: new Date()
                });
            } catch (err) {
                // handle error silently
            }

            return response.data;

        } catch (error) {
            throw error;
        }
    };