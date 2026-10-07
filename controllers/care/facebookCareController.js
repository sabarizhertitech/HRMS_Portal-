const axios = require('axios');
const facebookCareService = require('../../Services/care/facebookCareService');

class FacebookCareController {
  // ================= 1. CONNECTED PAGES & LINKED INSTAGRAM =================

  /**
   * GET /api/care/facebook/pages
   * Retrieve connected Facebook Pages and linked Instagram accounts
   */
  async getPages(req, res) {
    try {
      const data = await facebookCareService.getConnectedPages();
      return res.status(200).json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error getting pages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook Pages',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/care/facebook/pages/:pageId/instagram
   * Retrieve linked Instagram Business account for a specific page
   */
  async getLinkedInstagramAccount(req, res) {
    try {
      const { pageId } = req.params;
      const igAccount = await facebookCareService.getLinkedInstagramAccount(pageId);

      return res.status(200).json({
        success: true,
        pageId,
        instagramAccount: igAccount,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error getting linked IG account:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve linked Instagram account',
      });
    }
  }

  // ================= 2. MESSENGER WEBHOOKS & MESSAGING =================

  /**
   * GET /facebook
   * Meta Webhook Verification endpoint
   */
  getWebhook(req, res) {
    try {
      const result = facebookCareService.verifyWebhook(req.query);

      if (result.verified) {
        console.log('[FacebookCareController] Webhook verification handshake succeeded');
        return res.status(200).send(result.challenge);
      }

      console.warn('[FacebookCareController] Webhook verification failed with query:', req.query);
      return res.sendStatus(403);
    } catch (error) {
      console.error('[FacebookCareController] Error during webhook GET handshake:', error.message);
      return res.sendStatus(500);
    }
  }

  /**
   * POST /facebook
   * Meta Webhook event receiver for Page Messenger messages
   */
  async postWebhook(req, res) {
    try {
      console.log('[FacebookCareController] Webhook POST received:', JSON.stringify(req.body));

      facebookCareService.handleWebhookEvent(req.body).catch((err) => {
        console.error('[FacebookCareController] Background webhook processing error:', err.message);
      });

      return res.status(200).send('EVENT_RECEIVED');
    } catch (err) {
      console.error('[FacebookCareController] Error in webhook POST:', err.message);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }

  /**
   * POST /facebook/send
   * Send a reply message to customer's Messenger
   */
  async sendMessage(req, res) {
    try {
      const { recipientId, text, pageAccessToken } = req.body;

      if (!recipientId || !text) {
        return res.status(400).json({
          success: false,
          message: 'Both recipientId and text are required fields.',
        });
      }

      const result = await facebookCareService.sendMessage({ recipientId, text, pageAccessToken });
      return res.status(200).json(result);
    } catch (error) {
      console.error('[FacebookCareController] Error sending message:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to send Facebook Messenger message',
      });
    }
  }

  /**
   * GET /facebook/page
   * Return Facebook Page details
   */
  async getPage(req, res) {
    try {
      const page = await facebookCareService.getPageDetails();
      return res.status(200).json({
        success: true,
        page,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error getting page details:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook Page details',
        error: error.message,
      });
    }
  }

  /**
   * GET /facebook/messages
   * Return message logs for Facebook Messenger
   */
  async getMessages(req, res) {
    try {
      const { senderId, limit } = req.query;
      const messages = await facebookCareService.getMessages({ senderId, limit });
      return res.status(200).json({
        success: true,
        messages,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error retrieving messages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook messages',
        error: error.message,
      });
    }
  }

  // ================= 3. META APP REVIEW OAUTH & SESSIONS =================

  /**
   * GET /api/facebook-review/auth
   * Initiates the Facebook OAuth authorization flow for App Review
   */
  async auth(req, res) {
    try {
      const { authUrl, state, redirectUri } = facebookCareService.generateAuthorizationUrl(req);

      console.log('[FacebookCareController] Generated OAuth authorization URL for App Review');

      if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
        return res.status(200).json({
          success: true,
          authUrl,
          state,
          redirectUri,
        });
      }

      return res.redirect(authUrl);
    } catch (error) {
      console.error('[FacebookCareController] Error generating auth URL:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to initiate Facebook authorization',
      });
    }
  }

  /**
   * GET /api/facebook-review/callback
   * Handles Meta's OAuth redirect, exchanges authorization code, retrieves pages, and redirects to frontend
   */
  async callback(req, res) {
    console.log('[FacebookCareController] OAuth callback received for App Review');
    const { code, state, error, error_reason, error_description } = req.query;
    const cleanCode = (code || '').replace(/#_=_$/, '').replace(/#_$/, '').trim();
    const cleanState = (state || '').replace(/#_=_$/, '').replace(/#_$/, '').trim();
    const rawClientOrigin = facebookCareService.extractOriginFromState(cleanState) || facebookCareService.getFrontendBase(req) || 'http://localhost:5173';
    let clientOrigin = 'http://localhost:5173';
    try {
      clientOrigin = new URL(rawClientOrigin).origin;
    } catch (e) {
      clientOrigin = String(rawClientOrigin || '').replace(/\/social-media\/.*$/, '').replace(/\/+$/, '');
    }

    const redirectWithError = (msg) => {
      console.warn(`[FacebookCareController] Redirecting to frontend with error: ${msg}`);
      return res.redirect(`${clientOrigin}/social-media/facebook?error=${encodeURIComponent(msg)}`);
    };

    if (error) {
      const reason = error_description || error_reason || error;
      return redirectWithError(reason);
    }

    if (!cleanCode) {
      return redirectWithError('Authorization code was not provided by Meta');
    }

    const isValidState = facebookCareService.validateState(cleanState);
    if (!isValidState) {
      return redirectWithError('Invalid or expired OAuth state. Please start over.');
    }

    try {
      const tokenData = await facebookCareService.exchangeCodeForToken(cleanCode, req);
      const userAccessToken = tokenData.access_token;

      if (!userAccessToken) {
        throw new Error('Did not receive an access token from Meta.');
      }

      const pages = await facebookCareService.fetchUserPages(userAccessToken);
      console.log(`[FacebookCareController] Retrieved ${pages.length} page(s) for authorized user`);

      const sessionId = facebookCareService.createSession(pages, userAccessToken);

      // Automatically connect target page if configured or if single page authorized
      const configuredPageId = String(process.env.FACEBOOK_PAGE_ID || '').trim();
      const targetPage = pages.find((p) => p.id === configuredPageId) || (pages.length === 1 ? pages[0] : null);
      if (targetPage && targetPage.access_token) {
        await facebookCareService.connectPage(sessionId, targetPage.id);
        console.log(`[FacebookCareController] Auto-connected Facebook Page: ${targetPage.name} (${targetPage.id})`);
      }

      return res.redirect(`${clientOrigin}/social-media/facebook?session_id=${encodeURIComponent(sessionId)}&status=authorized`);
    } catch (err) {
      console.error('[FacebookCareController] Callback exchange error:', err.response?.data?.error?.message || err.message);
      const safeMsg = err.response?.data?.error?.message || err.message || 'Failed to exchange authorization code with Meta';
      return redirectWithError(safeMsg);
    }
  }

  /**
   * GET /api/facebook-review/pages
   * Returns authorized Facebook Pages for the active review session
   */
  async getReviewPages(req, res) {
    try {
      const sessionId = req.query.sessionId || req.headers['x-review-session-id'];

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'sessionId is required to retrieve Facebook Pages.',
        });
      }

      let pages = facebookCareService.getSessionPages(sessionId);

      if (!pages) {
        try {
          const liveRes = await axios.get(`https://hr.ertitech.com/api/facebook-review/pages?sessionId=${encodeURIComponent(sessionId)}`, { timeout: 6000 });
          if (liveRes.data?.success && Array.isArray(liveRes.data.pages)) {
            pages = liveRes.data.pages;
            facebookCareService.sessions.set(sessionId, { pages: liveRes.data.pages });
          }
        } catch (liveErr) {
          console.warn('[FacebookCareController] Session fallback check failed:', liveErr.message);
        }
      }

      if (!pages) {
        return res.status(404).json({
          success: false,
          message: 'Session not found or expired. Please connect Facebook again.',
        });
      }

      return res.status(200).json({
        success: true,
        pages,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error fetching pages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook Pages',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/facebook-review/connect-page
   * Connects the selected Facebook Page
   */
  async connectReviewPage(req, res) {
    try {
      const { sessionId, pageId } = req.body;

      if (!sessionId || !pageId) {
        return res.status(400).json({
          success: false,
          message: 'Both sessionId and pageId are required.',
        });
      }

      let connectedPage;
      try {
        connectedPage = facebookCareService.connectPage(sessionId, pageId);
      } catch (localErr) {
        try {
          const liveRes = await axios.post('https://hr.ertitech.com/api/facebook-review/connect-page', { sessionId, pageId }, { timeout: 6000 });
          if (liveRes.data?.success && liveRes.data.page) {
            connectedPage = liveRes.data.page;
          }
        } catch (e) {}
      }

      if (!connectedPage) {
        return res.status(400).json({
          success: false,
          message: 'Failed to connect selected Facebook Page or session expired.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Facebook Page connected successfully',
        page: connectedPage,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error connecting page:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to connect selected Facebook Page',
      });
    }
  }

  /**
   * GET /api/facebook-review/status
   * Returns current connection status for the session
   */
  async getReviewStatus(req, res) {
    try {
      const sessionId = req.query.sessionId || req.headers['x-review-session-id'];
      if (!sessionId) {
        return res.status(200).json({
          success: true,
          connected: false,
        });
      }

      let connectedPage = facebookCareService.getConnectedPage(sessionId);

      if (!connectedPage) {
        try {
          const liveRes = await axios.get(`https://hr.ertitech.com/api/facebook-review/status?sessionId=${encodeURIComponent(sessionId)}`, { timeout: 6000 });
          if (liveRes.data?.connected && liveRes.data.page) {
            connectedPage = liveRes.data.page;
          }
        } catch (e) {}
      }

      return res.status(200).json({
        success: true,
        connected: !!connectedPage,
        page: connectedPage || null,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // ================= 4. FACEBOOK CRM ENGINE (MEDIA, COMMENTS, TICKETS, LEADS) =================

  /**
   * GET /api/care/facebook/account
   * Return connected Facebook Page profile for CRM Header
   */
  async getAccount(req, res) {
    try {
      const data = await facebookCareService.getConnectedAccount();
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error getting account:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook Page account details',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/care/facebook/media
   * Fetch Facebook Page posts with live reactions, comments, attachments & reach
   * Supports pagination: limit, after, before
   */
  async getMedia(req, res) {
    try {
      const limit = parseInt(req.query.limit, 10) || 25;
      const after = req.query.after || null;
      const before = req.query.before || null;
      const data = await facebookCareService.fetchMedia({ limit, after, before });
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error fetching media:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch Facebook posts',
      });
    }
  }

  /**
   * GET /api/care/facebook/media/:mediaId/comments
   * Fetch comments for a Facebook Page post with pagination
   * Supports pagination: limit, after, before
   */
  async getComments(req, res) {
    try {
      const { mediaId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 25;
      const after = req.query.after || null;
      const before = req.query.before || null;
      const data = await facebookCareService.fetchComments(mediaId, { limit, after, before });
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error fetching comments:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch comments for Facebook post',
      });
    }
  }

  /**
   * GET /api/care/facebook/posts/:postId
   * Fetch specific Facebook Post details: GET /{post-id}
   */
  async getPostDetails(req, res) {
    try {
      const { postId } = req.params;
      const post = await facebookCareService.getPostDetails(postId);
      return res.status(200).json({ success: true, post });
    } catch (error) {
      console.error('[FacebookCareController] Error getting post details:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch Facebook post details',
      });
    }
  }

  /**
   * GET /api/care/facebook/posts/:postId/insights
   * Fetch post impressions, unique reach & engaged users: GET /{post-id}/insights
   */
  async getPostInsights(req, res) {
    try {
      const { postId } = req.params;
      const insights = await facebookCareService.getPostInsights(postId);
      return res.status(200).json({ success: true, postId, insights });
    } catch (error) {
      console.error('[FacebookCareController] Error getting post insights:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch post insights',
      });
    }
  }

  /**
   * GET /api/care/facebook/posts/:postId/reactions
   * Fetch post reactions summary: GET /{post-id}/reactions
   */
  async getPostReactions(req, res) {
    try {
      const { postId } = req.params;
      const reactions = await facebookCareService.getPostReactions(postId);
      return res.status(200).json({ success: true, postId, reactions });
    } catch (error) {
      console.error('[FacebookCareController] Error getting post reactions:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch post reactions',
      });
    }
  }

  /**
   * GET /api/care/facebook/comments/:commentId/comments (or /replies)
   * Fetch replies under a comment: GET /{comment-id}/comments
   */
  async getCommentReplies(req, res) {
    try {
      const { commentId } = req.params;
      const replies = await facebookCareService.getCommentReplies(commentId);
      return res.status(200).json({ success: true, commentId, replies });
    } catch (error) {
      console.error('[FacebookCareController] Error getting comment replies:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch comment replies',
      });
    }
  }

  /**
   * GET /api/care/facebook/insights
   * Retrieve page followers & metrics from Meta Page Insights API
   * Note: Data is aggregated daily by Meta (not real-time).
   */
  async getPageInsights(req, res) {
    try {
      const { metric, period } = req.query;
      const data = await facebookCareService.getPageInsights({ metric, period });
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error getting insights:', error.message);
      return res.status(500).json({
        success: false,
        isRealTime: false,
        message: error.message || 'Failed to retrieve Facebook Page Insights',
      });
    }
  }

  /**
   * POST /api/care/facebook/comments/:commentId/reply
   * Reply to a Facebook comment
   */
  async replyComment(req, res) {
    try {
      const { commentId } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Reply message text is required.',
        });
      }

      const result = await facebookCareService.replyToComment(commentId, message.trim());
      return res.status(200).json(result);
    } catch (error) {
      console.error('[FacebookCareController] Error posting reply:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to post reply to Facebook comment',
      });
    }
  }

  /**
   * POST /api/care/facebook/comments/:commentId/ai-reply
   * Trigger AI auto-reply on a specific Facebook comment
   */
  async generateCommentAiReply(req, res) {
    try {
      const { commentId } = req.params;
      const { text, username, senderId } = req.body;

      const crmChatbot = require('../../Services/crmChatbot');
      const aiRes = await crmChatbot.generateReply({
        messageText: text || 'Tell me about Ertitech products',
        customerId: senderId || 'fb_user',
      });

      const replyText = aiRes?.replyText || aiRes?.text || aiRes || 'Thank you for reaching out to Ertitech!';
      const result = await facebookCareService.replyToComment(commentId, replyText);

      return res.status(200).json({
        success: true,
        reply: replyText,
        ...result,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error generating comment AI reply:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate AI reply for Facebook comment',
      });
    }
  }

  /**
   * DELETE /api/care/facebook/comments/:commentId
   * Delete a Facebook comment
   */
  async deleteComment(req, res) {
    try {
      const { commentId } = req.params;
      const data = await facebookCareService.deleteComment(commentId);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error deleting comment:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete Facebook comment',
      });
    }
  }

  /**
   * GET /api/care/facebook/growth-analytics
   * Follower & Page Likes growth time-series data
   */
  async getGrowthAnalytics(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const data = await facebookCareService.getFacebookGrowthAnalytics(period, startDate, endDate);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[FacebookCareController] Error getting growth analytics:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load Facebook growth analytics',
      });
    }
  }

  /**
   * GET /api/care/facebook/conversations
   * Return all active Facebook Messenger conversations
   */
  async getConversations(req, res) {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const conversations = await facebookCareService.getConversations(forceRefresh);
      return res.status(200).json({
        success: true,
        count: conversations.length,
        conversations,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error fetching conversations:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Facebook conversations',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/care/facebook/conversations/:customerId/messages
   * Get message history for a customer
   */
  async getCustomerMessages(req, res) {
    try {
      const customerId = req.params.customerId || req.query.customerId;
      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'customerId parameter is required',
        });
      }

      const messages = await facebookCareService.getCustomerMessages(customerId);
      return res.status(200).json({
        success: true,
        customerId,
        count: messages.length,
        messages,
      });
    } catch (error) {
      console.error('[FacebookCareController] Error fetching messages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve customer messages',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/care/facebook/ai-reply
   * CRM Chatbot AI reply generator
   */
  async generateAiReply(req, res) {
    try {
      const text = req.body?.message || req.body?.text || '';
      const customerId = req.body?.customerId || 'fb_demo_user';

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'message is required' });
      }

      const crmChatbot = require('../../Services/crmChatbot');
      const aiRes = await crmChatbot.generateReply({
        messageText: text.trim(),
        customerId,
      });

      return res.status(200).json({
        success: true,
        userMessage: text,
        reply: aiRes?.replyText || aiRes?.text || aiRes || 'Thank you for contacting Ertitech Facebook Care!',
        intent: aiRes?.intent || 'PRODUCT_INFORMATION',
      });
    } catch (error) {
      console.error('[FacebookCareController] Error generating AI reply:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate AI reply',
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/care/facebook/messages/:messageId
   */
  async deleteMessage(req, res) {
    return res.status(200).json({ success: true, message: 'Message removed' });
  }

  /**
   * DELETE /api/care/facebook/conversations/:customerId
   */
  async deleteConversation(req, res) {
    return res.status(200).json({ success: true, message: 'Conversation removed' });
  }

  // ================= 5. AI CONVERSATION MANAGEMENT & SUPPORT DESK =================

  async getConversationMode(req, res) {
    try {
      const customerId = req.params.customerId;
      if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required' });

      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const mode = await facebookCrmService.getAiMode(customerId);

      return res.status(200).json({
        success: true,
        customerId,
        conversationState: { facebookUserId: customerId, aiMode: mode, status: 'ACTIVE', humanSupportRequired: mode === 'HUMAN' },
      });
    } catch (error) {
      return res.status(200).json({
        success: true,
        customerId: req.params.customerId,
        conversationState: { facebookUserId: req.params.customerId, aiMode: 'AI', status: 'ACTIVE', humanSupportRequired: false },
      });
    }
  }

  async setConversationMode(req, res) {
    try {
      const customerId = req.params.customerId;
      const { mode } = req.body;
      if (!customerId || !mode) return res.status(400).json({ success: false, message: 'customerId and mode required' });

      const facebookCrmService = require('../../Services/care/facebookCrmService');
      await facebookCrmService.setAiMode(customerId, mode);

      return res.status(200).json({ success: true, customerId, mode });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async resumeAi(req, res) {
    try {
      const customerId = req.params.customerId;
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      await facebookCrmService.resumeAi(customerId);

      return res.status(200).json({ success: true, customerId, aiMode: 'AI', message: 'AI resumed' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async acceptSupport(req, res) {
    try {
      const { customerId } = req.params;
      const agentName = req.user?.name || req.body?.agentName || 'Support Specialist';
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const result = await facebookCrmService.acceptSupportRequest(customerId, agentName);

      try {
        await facebookCareService.sendMessage({
          recipientId: customerId,
          text: `👋 Hello! Support specialist ${agentName} has joined the chat and will assist you now.`,
          isHumanReply: true,
        });
      } catch (_) {}

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'HUMAN',
        ticketStatus: 'IN_PROGRESS',
        assignedAgent: agentName,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async rejectSupport(req, res) {
    try {
      const { customerId } = req.params;
      const agentName = req.user?.name || req.body?.agentName || 'Support Specialist';
      const reason = req.body?.reason || 'Closed by agent';
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const result = await facebookCrmService.rejectSupportRequest(customerId, agentName, reason);

      try {
        await facebookCareService.sendMessage({
          recipientId: customerId,
          text: `Your inquiry has been resolved. Our automated assistant is available 24/7 if you need further help!`,
          isHumanReply: false,
        });
      } catch (_) {}

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'AI',
        ticketStatus: 'REJECTED',
        ...result,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async resolveTicket(req, res) {
    return this.resumeAi(req, res);
  }

  async closeSupport(req, res) {
    return this.rejectSupport(req, res);
  }

  async getSupportTickets(req, res) {
    try {
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.getSupportTickets();
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteSupportTicket(req, res) {
    try {
      const { ticketId } = req.params;
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.deleteSupportTicket(ticketId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ================= 6. LEAD GENERATION =================

  async getLeads(req, res) {
    try {
      const { status, search } = req.query;
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.getLeads(status, search);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async createLead(req, res) {
    try {
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.createLead(req.body);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async updateLead(req, res) {
    try {
      const { leadId } = req.params;
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.updateLead(leadId, req.body);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteLead(req, res) {
    try {
      const { leadId } = req.params;
      const facebookCrmService = require('../../Services/care/facebookCrmService');
      const data = await facebookCrmService.deleteLead(leadId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ================= 7. ACCOUNT DISCONNECT / CONNECT =================

  async disconnect(req, res) {
    try {
      const result = await facebookCareService.disconnectAccount();
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async connect(req, res) {
    try {
      const result = await facebookCareService.connectAccount();
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

const apiLogger = require('../../utils/apiLogger');
module.exports = apiLogger(new FacebookCareController(), 'facebookCareController.js');
