const express = require('express');
const router = express.Router();
const facebookCareController = require('../../controllers/care/facebookCareController');

// Router-level API logger for server console output
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[Facebook API Hit] [${timestamp}] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

// ================= 1. META WEBHOOK ENDPOINTS =================
// GET / (or /webhook) - Meta Webhook Verification handshake
router.get('/webhook', (req, res) => facebookCareController.getWebhook(req, res));
router.get('/', (req, res) => {
  // If hub.mode is in query, it's a webhook handshake
  if (req.query['hub.mode']) {
    return facebookCareController.getWebhook(req, res);
  }
  // Otherwise default to getting page details
  return facebookCareController.getPage(req, res);
});

// POST / (or /webhook) - Meta Webhook receiver for incoming Messenger messages
router.post('/webhook', (req, res) => facebookCareController.postWebhook(req, res));
router.post('/', (req, res) => facebookCareController.postWebhook(req, res));

// ================= 2. POSTS, INSIGHTS & COMMENTS =================
// GET /account - Connected Facebook Page details
router.get('/account', (req, res) => facebookCareController.getAccount(req, res));

// GET /media - Fetch Facebook Page posts
router.get('/media', (req, res) => facebookCareController.getMedia(req, res));

// GET /growth-analytics - Follower & Likes growth time-series data
router.get('/growth-analytics', (req, res) => facebookCareController.getGrowthAnalytics(req, res));

// GET /insights - Page followers & engagement metrics from Meta Insights API
router.get('/insights', (req, res) => facebookCareController.getPageInsights(req, res));

// GET /media/:mediaId/comments - Comments on post
router.get('/media/:mediaId/comments', (req, res) => facebookCareController.getComments(req, res));

// GET /posts/:postId - Specific post details: GET /{post-id}
router.get('/posts/:postId', (req, res) => facebookCareController.getPostDetails(req, res));

// GET /posts/:postId/insights - Post views & reach insights: GET /{post-id}/insights
router.get('/posts/:postId/insights', (req, res) => facebookCareController.getPostInsights(req, res));

// GET /posts/:postId/reactions - Post reactions summary: GET /{post-id}/reactions
router.get('/posts/:postId/reactions', (req, res) => facebookCareController.getPostReactions(req, res));

// GET /comments/:commentId/comments & /comments/:commentId/replies - Replies under a comment
router.get('/comments/:commentId/comments', (req, res) => facebookCareController.getCommentReplies(req, res));
router.get('/comments/:commentId/replies', (req, res) => facebookCareController.getCommentReplies(req, res));

// POST /comments/:commentId/reply & POST /comments/:commentId/comments - Reply to a Facebook Post Comment
router.post('/comments/:commentId/reply', (req, res) => facebookCareController.replyComment(req, res));
router.post('/comments/:commentId/comments', (req, res) => facebookCareController.replyComment(req, res));

// POST /comments/:commentId/ai-reply - Trigger AI Auto-Reply on comment
router.post('/comments/:commentId/ai-reply', (req, res) => facebookCareController.generateCommentAiReply(req, res));

// DELETE /comments/:commentId - Delete comment
router.delete('/comments/:commentId', (req, res) => facebookCareController.deleteComment(req, res));

// ================= 3. MESSENGER & REDIS CONVERSATIONS =================
// GET /conversations - Active customer conversations
router.get('/conversations', (req, res) => facebookCareController.getConversations(req, res));

// GET /conversations/:customerId/messages - Messages for a customer
router.get('/conversations/:customerId/messages', (req, res) => facebookCareController.getCustomerMessages(req, res));

// POST /messages and POST /send - Send direct Messenger reply
router.post('/messages', (req, res) => facebookCareController.sendMessage(req, res));
router.post('/send', (req, res) => facebookCareController.sendMessage(req, res));

// POST /ai-reply - CRM Chatbot AI reply
router.post('/ai-reply', (req, res) => facebookCareController.generateAiReply(req, res));

// GET /page - Retrieve connected Facebook Page status
router.get('/page', (req, res) => facebookCareController.getPage(req, res));

// GET /messages - Retrieve message history
router.get('/messages', (req, res) => facebookCareController.getMessages(req, res));

// DELETE /messages/:messageId - Delete individual message
router.delete('/messages/:messageId', (req, res) => facebookCareController.deleteMessage(req, res));
router.delete('/conversations/:customerId/messages/:messageId', (req, res) => facebookCareController.deleteMessage(req, res));
router.delete('/conversations/:customerId', (req, res) => facebookCareController.deleteConversation(req, res));

// ================= 4. CONNECTED PAGES & LINKED INSTAGRAM =================
// GET /pages - Retrieve connected Facebook Pages
router.get('/pages', (req, res) => {
  if (req.query.sessionId || req.headers['x-review-session-id']) {
    return facebookCareController.getReviewPages(req, res);
  }
  return facebookCareController.getPages(req, res);
});

// GET /pages/:pageId/instagram - Retrieve linked Instagram account
router.get('/pages/:pageId/instagram', (req, res) => facebookCareController.getLinkedInstagramAccount(req, res));

// ================= 5. AI CONVERSATION MANAGEMENT & SUPPORT DESK =================
// GET /conversations/:customerId/mode — Get AI mode
router.get('/conversations/:customerId/mode', (req, res) => facebookCareController.getConversationMode(req, res));

// POST /conversations/:customerId/mode — Set AI mode
router.post('/conversations/:customerId/mode', (req, res) => facebookCareController.setConversationMode(req, res));

// POST /conversations/:customerId/resume-ai — Resume AI mode
router.post('/conversations/:customerId/resume-ai', (req, res) => facebookCareController.resumeAi(req, res));

// POST /conversations/:customerId/takeover — Human takeover
router.post('/conversations/:customerId/takeover', (req, res) => facebookCareController.acceptSupport(req, res));
router.post('/conversations/:customerId/accept-support', (req, res) => facebookCareController.acceptSupport(req, res));
router.post('/conversations/:customerId/reject-support', (req, res) => facebookCareController.rejectSupport(req, res));

// POST /conversations/:customerId/resolve-ticket — Resolve ticket
router.post('/conversations/:customerId/resolve-ticket', (req, res) => facebookCareController.resolveTicket(req, res));
router.post('/conversations/:customerId/close-support', (req, res) => facebookCareController.closeSupport(req, res));

// GET /support-tickets — Fetch all support tickets
router.get('/support-tickets', (req, res) => facebookCareController.getSupportTickets(req, res));

// DELETE /support-tickets/:ticketId — Delete ticket
router.delete('/support-tickets/:ticketId', (req, res) => facebookCareController.deleteSupportTicket(req, res));

// ================= 6. LEAD GENERATION =================
// GET /leads — Fetch leads
router.get('/leads', (req, res) => facebookCareController.getLeads(req, res));

// POST /leads — Create lead
router.post('/leads', (req, res) => facebookCareController.createLead(req, res));

// PUT /leads/:leadId — Update lead
router.put('/leads/:leadId', (req, res) => facebookCareController.updateLead(req, res));

// DELETE /leads/:leadId — Delete lead
router.delete('/leads/:leadId', (req, res) => facebookCareController.deleteLead(req, res));

// ================= 7. ACCOUNT DISCONNECT & AUTH =================
// POST /disconnect - Disconnect active account
router.post('/disconnect', (req, res) => facebookCareController.disconnect(req, res));

// POST /connect - Connect active account
router.post('/connect', (req, res) => facebookCareController.connect(req, res));

// GET /auth & GET /login - Initiates Meta authorization dialog
router.get('/auth', (req, res) => facebookCareController.auth(req, res));
router.get('/login', (req, res) => facebookCareController.auth(req, res));

// GET /callback - Handles Meta OAuth callback & page retrieval
router.get('/callback', (req, res) => facebookCareController.callback(req, res));

// GET /review-pages - Retrieves authorized pages for review
router.get('/review-pages', (req, res) => facebookCareController.getReviewPages(req, res));

// POST /connect-page - Connects selected page
router.post('/connect-page', (req, res) => facebookCareController.connectReviewPage(req, res));

// GET /status - Status check for review session
router.get('/status', (req, res) => facebookCareController.getReviewStatus(req, res));

const path = require('path');
const fs = require('fs');

const frontendDistPath = path.join(__dirname, '../../../Front-end/dist');

// ================= 8. CLIENT-SIDE FALLBACK ROUTES =================
router.get(['/social-media/facebook', '/social-media/*'], (req, res) => {
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetBase = process.env.FRONTEND_URL || 'https://hr-portal.ertitech.com/';
  return res.redirect(`${targetBase}/social-media/facebook${query}`);
});

module.exports = router;
