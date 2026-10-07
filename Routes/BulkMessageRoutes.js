const express = require("express");

const router = express.Router();

const {
    sendTemplateMessage
} = require("../Services/WhatsAppTemplateService");


// ==========================================
// Send Bulk Template Messages
// ==========================================

router.post(
    "/send-bulk-template",

    async (req, res) => {

        try {

            const users =
                req.body.users;

            if (
                !users ||
                !Array.isArray(users)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Users array required"
                });
            }

            const results = [];

            for (const user of users) {

                const response =
                    await sendTemplateMessage(
                        user.phone
                    );

                results.push({

                    phone:
                        user.phone,

                    response
                });
            }

            return res.json({

                success: true,

                total:
                    users.length,

                results
            });

        } catch (error) {

            return res.status(500).json({

                success: false,

                message:
                    error.message
            });
        }
    }
);

module.exports = router;