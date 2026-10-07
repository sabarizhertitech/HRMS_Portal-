// middleware/validateWebhook.js

const validateWebhook = (req, res, next) => {
    try {

        const value =
            req.body?.entry?.[0]
                ?.changes?.[0]
                ?.value;

        const message = value?.messages?.[0];
        const statusUpdate = value?.statuses?.[0];

        // Allow through if it's a real message OR a status update from Meta
        // Meta MUST always receive a 200, otherwise it retries and can disable the webhook
        if (!message && !statusUpdate) {
            return res.sendStatus(200); // silently acknowledge unknown payloads
        }

        next();

    } catch (error) {
        next(error);
    }
};

module.exports = validateWebhook;