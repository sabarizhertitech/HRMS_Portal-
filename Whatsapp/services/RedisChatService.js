// services/RedisChatService.js

const redisClient = require("../../utilities/redis");

class RedisChatService {
    constructor() {
        this.DEFAULT_TTL = 7200; // 2 Hours in seconds
    }

    _formatKey(phone) {
        if (!phone) return "whatsapp:chat:unknown";
        const clean = phone.replace(/\D/g, "");
        return `whatsapp:chat:${clean}`;
    }

    /**
     * Append a message to the active Redis chat history and refresh the 2-hour TTL
     * @param {string} phone - Customer phone number
     * @param {object} messageObj - { sender: 'user'|'bot'|'support', text: string, intent: string, timestamp: Date }
     * @param {number} ttlSeconds - Expiration time in seconds (default: 7200 / 2 hours)
     */
    async saveMessage(phone, messageObj, ttlSeconds = this.DEFAULT_TTL) {
        try {
            const key = this._formatKey(phone);
            const entry = {
                sender: messageObj.sender || "user",
                text: messageObj.text || "",
                intent: messageObj.intent || "UNKNOWN",
                whatsappMessageId: messageObj.whatsappMessageId || null,
                status: messageObj.status || "sent",
                timestamp: messageObj.timestamp || new Date()
            };

            // Get existing active messages in Redis
            let messages = await this.getMessages(phone);
            messages.push(entry);

            // Save updated message list with 2-hour expiration (7200s)
            await redisClient.setEx(key, ttlSeconds, JSON.stringify(messages));
            return true;
        } catch (error) {
            console.error(`[RedisChatService] Error saving message for ${phone}:`, error.message);
            return false;
        }
    }

    /**
     * Retrieve active messages for a customer phone number within the 2-hour TTL
     * @param {string} phone - Customer phone number
     * @returns {Promise<Array>} Array of message objects or empty array
     */
    async getMessages(phone) {
        try {
            const key = this._formatKey(phone);
            const data = await redisClient.get(key);
            if (!data) return [];
            return JSON.parse(data);
        } catch (error) {
            console.error(`[RedisChatService] Error getting messages for ${phone}:`, error.message);
            return [];
        }
    }

    /**
     * Get remaining Time-To-Live in seconds for a phone's active chat
     * @param {string} phone - Customer phone number
     * @returns {Promise<number>} Remaining seconds or -2 if key does not exist
     */
    async getTTL(phone) {
        try {
            const key = this._formatKey(phone);
            return await redisClient.ttl(key);
        } catch (error) {
            console.error(`[RedisChatService] Error getting TTL for ${phone}:`, error.message);
            return -1;
        }
    }

    /**
     * Clear all cached messages for a phone number immediately
     * @param {string} phone - Customer phone number
     */
    async clearChat(phone) {
        try {
            const key = this._formatKey(phone);
            await redisClient.del(key);
            return true;
        } catch (error) {
            console.error(`[RedisChatService] Error clearing chat for ${phone}:`, error.message);
            return false;
        }
    }

    /**
     * Get all active WhatsApp chat keys currently stored in Redis
     * @returns {Promise<Array>} List of phone numbers with active 2-hour chats
     */
    async getAllActiveChats() {
        try {
            const keys = await redisClient.keys("whatsapp:chat:*");
            const chats = [];
            for (const key of keys) {
                const phone = key.replace("whatsapp:chat:", "");
                const data = await redisClient.get(key);
                const ttl = await redisClient.ttl(key);
                chats.push({
                    phone,
                    ttlRemainingSeconds: ttl,
                    messages: data ? JSON.parse(data) : []
                });
            }
            return chats;
        } catch (error) {
            console.error("[RedisChatService] Error fetching all active chats:", error.message);
            return [];
        }
    }
}

module.exports = new RedisChatService();
