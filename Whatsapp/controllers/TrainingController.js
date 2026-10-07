// Whatsapp/controllers/TrainingController.js
// Full REST API for the AI Training Review Dashboard

const TrainingData = require("../models/TrainingData");
const Conversation = require("../models/Conversation");

class TrainingController {

    // =============================================
    // GET /api/training/stats
    // Dashboard overview stats
    // =============================================
    async getStats(req, res) {
        try {
            const [total, approved, pending, good, bad, byIntent] = await Promise.all([
                TrainingData.countDocuments(),
                TrainingData.countDocuments({ approved: true }),
                TrainingData.countDocuments({ approved: false, quality: "pending" }),
                TrainingData.countDocuments({ quality: "good" }),
                TrainingData.countDocuments({ quality: "bad" }),
                TrainingData.aggregate([
                    { $group: { _id: "$intent", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ])
            ]);

            return res.json({
                success: true,
                stats: {
                    total,
                    approved,
                    pending,
                    rejected: total - approved - pending,
                    good,
                    bad,
                    byIntent
                }
            });
        } catch (error) {
            console.error("[TrainingController] getStats:", error.message);
            return res.status(500).json({ success: false, message: "Failed to fetch stats" });
        }
    }

    // =============================================
    // GET /api/training/entries
    // List all training entries with optional filters
    // =============================================
    async getEntries(req, res) {
        try {
            const {
                intent,
                approved,
                quality,
                page = 1,
                limit = 20,
                search
            } = req.query;

            const filter = {};

            if (intent && intent !== "ALL") filter.intent = intent;
            if (approved !== undefined && approved !== "") filter.approved = approved === "true";
            if (quality && quality !== "ALL") filter.quality = quality;
            if (search) {
                filter.$or = [
                    { question: { $regex: search, $options: "i" } },
                    { answer: { $regex: search, $options: "i" } }
                ];
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const total = await TrainingData.countDocuments(filter);

            const entries = await TrainingData
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            return res.json({
                success: true,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                entries
            });
        } catch (error) {
            console.error("[TrainingController] getEntries:", error.message);
            return res.status(500).json({ success: false, message: "Failed to fetch entries" });
        }
    }

    // =============================================
    // POST /api/training/entries
    // Create a new Q&A training entry
    // =============================================
    async createEntry(req, res) {
        try {
            const { question, answer, intent, keywords, source, reviewNotes } = req.body;

            if (!question || !answer) {
                return res.status(400).json({ success: false, message: "question and answer are required" });
            }

            const entry = await TrainingData.create({
                question: question.trim(),
                answer: answer.trim(),
                intent: intent || "GENERAL",
                keywords: Array.isArray(keywords) ? keywords : [],
                source: source || "support_agent",
                reviewNotes: reviewNotes || "",
                approved: false,
                quality: "pending"
            });

            return res.status(201).json({ success: true, entry });

        } catch (error) {
            console.error("[TrainingController] createEntry:", error.message);
            return res.status(500).json({ success: false, message: "Failed to create entry" });
        }
    }

    // =============================================
    // PUT /api/training/entries/:id/approve
    // Approve or reject a training entry
    // =============================================
    async approveEntry(req, res) {
        try {
            const { id } = req.params;
            const { approved, reviewedBy, reviewNotes } = req.body;

            const update = {
                approved: approved === true || approved === "true",
                reviewedBy: reviewedBy || "admin",
                reviewedAt: new Date(),
                reviewNotes: reviewNotes || ""
            };

            // Auto-set quality to "good" if approving
            if (update.approved) {
                update.quality = "good";
            }

            const entry = await TrainingData.findByIdAndUpdate(id, update, { new: true });

            if (!entry) {
                return res.status(404).json({ success: false, message: "Entry not found" });
            }

            return res.json({ success: true, entry });

        } catch (error) {
            console.error("[TrainingController] approveEntry:", error.message);
            return res.status(500).json({ success: false, message: "Failed to update entry" });
        }
    }

    // =============================================
    // PUT /api/training/entries/:id/quality
    // Mark an entry as good or bad
    // =============================================
    async setQuality(req, res) {
        try {
            const { id } = req.params;
            const { quality } = req.body;

            if (!["good", "bad", "pending"].includes(quality)) {
                return res.status(400).json({ success: false, message: "quality must be good, bad, or pending" });
            }

            const entry = await TrainingData.findByIdAndUpdate(
                id,
                { quality },
                { new: true }
            );

            if (!entry) {
                return res.status(404).json({ success: false, message: "Entry not found" });
            }

            return res.json({ success: true, entry });

        } catch (error) {
            console.error("[TrainingController] setQuality:", error.message);
            return res.status(500).json({ success: false, message: "Failed to update quality" });
        }
    }

    // =============================================
    // PUT /api/training/entries/:id
    // Edit an existing training entry
    // =============================================
    async updateEntry(req, res) {
        try {
            const { id } = req.params;
            const { question, answer, intent, keywords, reviewNotes } = req.body;

            const update = {};
            if (question) update.question = question.trim();
            if (answer) update.answer = answer.trim();
            if (intent) update.intent = intent;
            if (Array.isArray(keywords)) update.keywords = keywords;
            if (reviewNotes !== undefined) update.reviewNotes = reviewNotes;

            const entry = await TrainingData.findByIdAndUpdate(id, update, { new: true });

            if (!entry) {
                return res.status(404).json({ success: false, message: "Entry not found" });
            }

            return res.json({ success: true, entry });

        } catch (error) {
            console.error("[TrainingController] updateEntry:", error.message);
            return res.status(500).json({ success: false, message: "Failed to update entry" });
        }
    }

    // =============================================
    // DELETE /api/training/entries/:id
    // Remove a training entry
    // =============================================
    async deleteEntry(req, res) {
        try {
            const { id } = req.params;
            const entry = await TrainingData.findByIdAndDelete(id);

            if (!entry) {
                return res.status(404).json({ success: false, message: "Entry not found" });
            }

            return res.json({ success: true, message: "Entry deleted successfully" });

        } catch (error) {
            console.error("[TrainingController] deleteEntry:", error.message);
            return res.status(500).json({ success: false, message: "Failed to delete entry" });
        }
    }

    // =============================================
    // POST /api/training/export-conversations
    // Export raw conversations as seed training data
    // =============================================
    async exportConversations(req, res) {
        try {
            const { limit = 100 } = req.query;

            const conversations = await Conversation.find({})
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .lean();

            // Extract message pairs (user → bot) as potential training seeds
            const seeds = [];

            for (const conv of conversations) {
                const messages = conv.messages || [];

                for (let i = 0; i < messages.length - 1; i++) {
                    const current = messages[i];
                    const next = messages[i + 1];

                    if (current.sender === "user" && next.sender === "bot") {
                        seeds.push({
                            question: current.text,
                            botAnswer: next.text,
                            intent: current.intent || "UNKNOWN",
                            phone: conv.phone?.replace(/\d(?=\d{4})/g, "*"), // mask PII
                            timestamp: current.timestamp
                        });
                    }
                }
            }

            return res.json({
                success: true,
                total: seeds.length,
                seeds
            });

        } catch (error) {
            console.error("[TrainingController] exportConversations:", error.message);
            return res.status(500).json({ success: false, message: "Failed to export conversations" });
        }
    }

    // =============================================
    // POST /api/training/save-from-ticket/:ticketId
    // Convert a resolved support ticket into a TrainingData Q&A entry
    // =============================================
    async saveFromTicket(req, res) {
        try {
            const { ticketId } = req.params;
            const { question, answer, intent = "SUPPORT", keywords = [] } = req.body;

            if (!question || !answer) {
                return res.status(400).json({ success: false, message: "Question and Answer are required" });
            }

            const entry = await TrainingData.create({
                question: question.trim(),
                answer: answer.trim(),
                intent,
                keywords: Array.isArray(keywords) ? keywords : [],
                source: "support_agent",
                approved: true,
                quality: "good",
                reviewNotes: `Learned from support ticket ${ticketId}`
            });

            return res.status(201).json({
                success: true,
                message: "Saved to Training Knowledge Base successfully",
                entry
            });
        } catch (error) {
            console.error("[TrainingController] saveFromTicket:", error.message);
            return res.status(500).json({ success: false, message: "Failed to save from ticket" });
        }
    }

}

module.exports = new TrainingController();
