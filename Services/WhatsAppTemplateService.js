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

                            name: "exampl_template_01",

                            language: {
                                code: "en"
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

            console.log(
                "Template Sent Successfully:",
                response.data
            );

            return response.data;

        } catch (error) {

            console.log(
                "FULL TEMPLATE ERROR:"
            );

            console.log(
                error.response?.data ||
                error.message
            );

            throw error;
        }
    };