// Whatsapp/services/KnowledgeBaseService.js
// RAG (Retrieval-Augmented Generation) — searches training data before AI responds

const TrainingData = require("../models/TrainingData");

class KnowledgeBaseService {

    /**
     * Find the best matching Q&A from the knowledge base for a given query.
     * Uses MongoDB full-text search on question + keywords + answer fields.
     *
     * @param {string} query - Customer's raw message
     * @param {string} intent - Detected intent (used to filter results)
     * @returns {Promise<object|null>} Matching TrainingData doc or null
     */
    async findSimilarAnswer(query, intent = null) {
        try {
            if (!query || query.trim().length < 3) return null;

            const searchQuery = {
                $text: { $search: query },
                approved: true,
                quality: "good"
            };

            // Optionally scope to intent for higher relevance
            if (intent && intent !== "UNKNOWN" && intent !== "GENERAL") {
                searchQuery.intent = intent;
            }

            const result = await TrainingData.findOne(searchQuery, {
                score: { $meta: "textScore" }
            })
                .sort({ score: { $meta: "textScore" } })
                .lean();

            // Only return if text score is strong enough (above threshold)
            if (result && result.score >= 0.5) {
                return result;
            }

            // Fallback: try without intent filter if no match in scoped search
            if (intent && intent !== "UNKNOWN") {
                const fallback = await TrainingData.findOne(
                    { $text: { $search: query }, approved: true, quality: "good" },
                    { score: { $meta: "textScore" } }
                )
                    .sort({ score: { $meta: "textScore" } })
                    .lean();

                if (fallback && fallback.score >= 0.7) {
                    return fallback;
                }
            }

            return null;

        } catch (error) {
            // Fail silently — AI will still respond without KB context
            console.error("[KnowledgeBaseService] findSimilarAnswer error:", error.message);
            return null;
        }
    }

    /**
     * Increment the usageCount for a training entry that was served to a customer.
     * @param {string} id - MongoDB _id of the TrainingData doc
     */
    async recordUsage(id) {
        try {
            await TrainingData.findByIdAndUpdate(id, { $inc: { usageCount: 1 } });
        } catch (error) {
            console.error("[KnowledgeBaseService] recordUsage error:", error.message);
        }
    }

    /**
     * Build a context string to inject into the system prompt when a KB match is found.
     * @param {object} entry - TrainingData document
     * @returns {string} Formatted context block
     */
    buildContextBlock(entry) {
        return `
=== KNOWLEDGE BASE MATCH ===
Customer Question: ${entry.question}
Correct Answer: ${entry.answer}
Intent: ${entry.intent}

Use the above as a reference. Adapt it naturally to the customer's current message.
===========================`;
    }
}

module.exports = new KnowledgeBaseService();
