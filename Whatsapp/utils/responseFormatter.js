// utils/responseFormatter.js

/**
 * Format API responses consistently
 */
const formatAPIResponse = (success, data = null, message = "") => {
    return {
        success,
        timestamp: new Date().toISOString(),
        ...(data && { data }),
        ...(message && { message })
    };
};

/**
 * Format a WhatsApp text message template
 */
const formatWhatsAppMessage = (header, body, footer = "") => {
    let formatted = "";
    if (header) formatted += `*${header}*\n\n`;
    if (body) formatted += `${body}\n`;
    if (footer) formatted += `\n_${footer}_`;
    return formatted.trim();
};

module.exports = {
    formatAPIResponse,
    formatWhatsAppMessage
};
