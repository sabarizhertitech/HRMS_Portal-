// utils/helpers.js

/**
 * Mask a phone number for security purposes (e.g. 919876543210 -> 91987654****)
 * @param {string} phone 
 * @returns {string}
 */
const maskPhoneNumber = (phone) => {
    if (!phone || phone.length < 6) return phone;
    return phone.slice(0, -4) + "****";
};

/**
 * Format currency into Indian Rupees format (INR)
 * @param {number} amount 
 * @returns {string}
 */
const formatINR = (amount) => {
    if (typeof amount !== 'number') return amount;
    return amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/**
 * Clean and normalize a text string
 * @param {string} text 
 * @returns {string}
 */
const cleanText = (text) => {
    if (!text) return "";
    return text.trim().toLowerCase();
};

module.exports = {
    maskPhoneNumber,
    formatINR,
    cleanText
};
