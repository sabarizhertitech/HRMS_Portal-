const express = require('express');
const router = express.Router();
const instagramCareController = require('../../controllers/care/instagramCareController');


// ================= 1. META WEBHOOK ENDPOINTS =================
// GET /webhook - Verification handshake
router.get('/webhook', (req, res) => instagramCareController.getWebhook(req, res));

// POST /webhook - Incoming event receiver
router.post('/webhook', (req, res) => instagramCareController.postWebhook(req, res));

// GET / - Handles OAuth callback if code/error is present, or Webhook handshake if hub.mode is present
router.get('/', (req, res) => {
  if (req.query.code || req.query.error || (req.query.state && !req.query['hub.mode'])) {
    return instagramCareController.callback(req, res);
  }
  return instagramCareController.getWebhook(req, res);
});

// POST / - Root webhook receiver
router.post('/', (req, res) => instagramCareController.postWebhook(req, res));

// ================= 2. POSTS, INSIGHTS & COMMENTS =================
// GET /account - Connected account details
router.get('/account', (req, res) => instagramCareController.getAccount(req, res));

// GET /media - Fetch media posts with real-time Meta views & reach
router.get('/media', (req, res) => instagramCareController.getMedia(req, res));

// GET /growth-analytics - Follower growth time-series data
router.get('/growth-analytics', (req, res) => instagramCareController.getGrowthAnalytics(req, res));

// GET /media/:mediaId/comments - Comments on post
router.get('/media/:mediaId/comments', (req, res) => instagramCareController.getComments(req, res));

// POST /comments/:commentId/reply - Reply to comment
router.post('/comments/:commentId/reply', (req, res) => instagramCareController.replyComment(req, res));

// POST /comments/:commentId/ai-reply - Trigger AI Auto-Reply on comment
router.post('/comments/:commentId/ai-reply', (req, res) => instagramCareController.generateCommentAiReply(req, res));

// GET /comments/:commentId/status - Comment status
router.get('/comments/:commentId/status', (req, res) => instagramCareController.getStatus(req, res));

// DELETE /comments/:commentId - Delete comment
router.delete('/comments/:commentId', (req, res) => instagramCareController.deleteComment(req, res));

// ================= 3. DIRECT MESSAGES & REDIS 2-HOUR CACHE =================
// GET /conversations - Active customer conversations in Redis
router.get('/conversations', (req, res) => instagramCareController.getConversations(req, res));

// GET /conversations/:customerId/messages - Messages for a customer from Redis
router.get('/conversations/:customerId/messages', (req, res) => instagramCareController.getCustomerMessages(req, res));

// POST /messages and POST /send - Send direct message reply
router.post('/messages', (req, res) => instagramCareController.sendMessage(req, res));
router.post('/send', (req, res) => instagramCareController.sendMessage(req, res));

// POST /ai-reply - CRM Chatbot AI reply
router.post('/ai-reply', (req, res) => instagramCareController.generateAiReply(req, res));

// GET /messages - Retrieve messages
router.get('/messages', (req, res) => instagramCareController.getMessages(req, res));

// DELETE /messages/:messageId - Delete individual message
router.delete('/messages/:messageId', (req, res) => instagramCareController.deleteMessage(req, res));
router.delete('/conversations/:customerId/messages/:messageId', (req, res) => instagramCareController.deleteMessage(req, res));
router.delete('/conversations/:customerId', (req, res) => instagramCareController.deleteConversation(req, res));

// ================= 4. INSTAGRAM OAUTH =================
// GET /login - Initiates Meta authorization
router.get('/login', (req, res) => instagramCareController.login(req, res));

// GET /callback - Handles Meta OAuth redirect & token exchange
router.get('/callback', (req, res) => instagramCareController.callback(req, res));

// POST /disconnect - Disconnects / Logs out the active account
router.post('/disconnect', (req, res) => instagramCareController.disconnect(req, res));

// POST /connect - Connects / Reconnects the active account
router.post('/connect', (req, res) => instagramCareController.connect(req, res));

// ================= 5. AI CONVERSATION MANAGEMENT =================
// GET /conversations/:customerId/mode — Get AI mode and conversation state
router.get('/conversations/:customerId/mode', (req, res) => instagramCareController.getConversationMode(req, res));

// POST /conversations/:customerId/mode — Set AI mode (admin)
router.post('/conversations/:customerId/mode', (req, res) => instagramCareController.setConversationMode(req, res));

// POST /conversations/:customerId/resume-ai — Human agent resumes AI
router.post('/conversations/:customerId/resume-ai', (req, res) => instagramCareController.resumeAi(req, res));

// POST /conversations/:customerId/takeover — Human agent takes over from AI
router.post('/conversations/:customerId/takeover', (req, res) => instagramCareController.takeoverConversation(req, res));
router.post('/conversations/:customerId/accept-support', (req, res) => instagramCareController.acceptSupport(req, res));
router.post('/conversations/:customerId/reject-support', (req, res) => instagramCareController.rejectSupport(req, res));

// POST /conversations/:customerId/resolve-ticket — Resolve support ticket and resume AI
router.post('/conversations/:customerId/resolve-ticket', (req, res) => instagramCareController.resolveTicket(req, res));
router.post('/conversations/:customerId/close-support', (req, res) => instagramCareController.closeSupport(req, res));

// GET /support-tickets — Fetch all support tickets
router.get('/support-tickets', (req, res) => instagramCareController.getSupportTickets(req, res));

// DELETE /support-tickets/:ticketId — Delete a support ticket
router.delete('/support-tickets/:ticketId', (req, res) => instagramCareController.deleteSupportTicket(req, res));

// GET /ai-settings — Get current AI settings
router.get('/ai-settings', (req, res) => instagramCareController.getAiSettings(req, res));

// POST /ai-settings — Update AI settings (admin only)
router.post('/ai-settings', (req, res) => instagramCareController.updateAiSettings(req, res));

// ================= 6. LEAD GENERATION =================
// GET /leads — Fetch all captured leads
router.get('/leads', (req, res) => instagramCareController.getLeads(req, res));

// POST /leads — Create new lead manually
router.post('/leads', (req, res) => instagramCareController.createLead(req, res));

// PUT /leads/:leadId — Update lead status or details
router.put('/leads/:leadId', (req, res) => instagramCareController.updateLead(req, res));

// DELETE /leads/:leadId — Delete a lead
router.delete('/leads/:leadId', (req, res) => instagramCareController.deleteLead(req, res));

module.exports = router;

