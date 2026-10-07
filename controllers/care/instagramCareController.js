const instagramCareService = require('../../Services/care/instagramCareService');
const config = require('../../utilities/instagramConfig');

class InstagramCareController {
  // ================= 1. ACCOUNT, MEDIA, INSIGHTS & COMMENTS =================

  /**
   * GET /api/care/instagram/account
   * Get connected Instagram Professional account information
   */
  async getAccount(req, res) {
    try {
      const data = await instagramCareService.getConnectedAccount();
      return res.status(200).json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error getting account:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Instagram account details',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/care/instagram/media
   * Fetch Instagram media/posts with live Meta views & reach insights
   */
  async getMedia(req, res) {
    try {
      const limit = parseInt(req.query.limit, 10) || 25;
      const data = await instagramCareService.fetchMedia(limit);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error fetching media:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch Instagram posts',
      });
    }
  }

  /**
   * GET /api/care/instagram/media/:mediaId/comments
   * Fetch comments for an Instagram media/post
   */
  async getComments(req, res) {
    try {
      const { mediaId } = req.params;
      const data = await instagramCareService.fetchComments(mediaId);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error fetching comments:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch comments for Instagram post',
      });
    }
  }

  /**
   * POST /api/care/instagram/comments/:commentId/reply
   * Reply to an Instagram comment
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

      const result = await instagramCareService.replyToComment(commentId, message);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error posting reply:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to post reply to Instagram comment',
      });
    }
  }

  /**
   * POST /api/care/instagram/comments/:commentId/ai-reply
   * Trigger AI auto-reply on a specific Instagram comment
   */
  async generateCommentAiReply(req, res) {
    try {
      const { commentId } = req.params;
      const { text, username, senderId, mediaId } = req.body;

      const instagramAiDecisionService = require('../../Services/care/instagramAiDecisionService');
      const result = await instagramAiDecisionService.processIncomingComment({
        commentId,
        mediaId: mediaId || '',
        text: text || '',
        senderId: senderId || '',
        username: username || '',
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error generating comment AI reply:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate AI reply for comment',
      });
    }
  }

  /**
   * GET /api/care/instagram/comments/:commentId/status
   * Get comment status and replies
   */
  async getStatus(req, res) {
    try {
      const { commentId } = req.params;
      const data = await instagramCareService.getCommentStatus(commentId);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error checking comment status:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve comment status',
      });
    }
  }

  /**
   * DELETE /api/care/instagram/comments/:commentId
   * Delete an Instagram comment or reply
   */
  async deleteComment(req, res) {
    try {
      const { commentId } = req.params;
      const data = await instagramCareService.deleteComment(commentId);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error deleting comment:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete Instagram comment',
      });
    }
  }

  /**
   * GET /api/care/instagram/growth-analytics
   * Follower & Account growth time-series data
   */
  async getGrowthAnalytics(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const data = await instagramCareService.getInstagramGrowthAnalytics(period, startDate, endDate);
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error getting growth analytics:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load Instagram growth analytics',
      });
    }
  }

  // ================= 2. OAUTH & ACCOUNT DISCONNECT =================

  /**
   * GET /instagram/login
   * Initiates the Instagram Business OAuth authorization flow
   */
  async login(req, res) {
    try {
      if (!config.appId) {
        return res.status(500).json({
          success: false,
          message: 'INSTAGRAM_APP_ID is not configured in server environment.',
        });
      }

      const returnUrl = req.query.return_url || req.headers.referer || null;
      const { authUrl, state } = instagramCareService.generateAuthorizationUrl(returnUrl);

      if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
        return res.status(200).json({
          success: true,
          authUrl,
          state,
        });
      }

      return res.redirect(authUrl);
    } catch (error) {
      console.error('[InstagramCareController] Login initiation error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate Instagram login flow',
        error: error.message,
      });
    }
  }

  /**
   * GET /instagram/callback
   * Handles Meta's OAuth redirect after user grants permissions
   */
  async callback(req, res) {
    console.log('[InstagramCareController] OAuth callback received');
    const { code, state, error, error_reason, error_description } = req.query;

    const validatedState = state ? instagramCareService.validateState(state) : null;
    let frontendBase = (config.frontendUrl || 'https://hr.ertitech.com').replace(/\/+$/, '');

    if (typeof validatedState === 'object' && validatedState?.returnUrl) {
      try {
        const parsed = new URL(validatedState.returnUrl);
        frontendBase = `${parsed.protocol}//${parsed.host}`;
      } catch (_) {}
    } else if (req.headers.referer) {
      try {
        const parsed = new URL(req.headers.referer);
        frontendBase = `${parsed.protocol}//${parsed.host}`;
      } catch (_) {}
    }

    const respondError = (msg, errType = 'error') => {
      console.warn(`[InstagramCareController] Redirecting to frontend with error: ${msg}`);
      const errParam = encodeURIComponent(errType);
      const descParam = encodeURIComponent(msg);
      const reasonParam = encodeURIComponent(error_reason || error || '');
      return res.redirect(`${frontendBase}/social-media/instagram?error=${errParam}&error_description=${descParam}&error_reason=${reasonParam}`);
    };

    const respondSuccess = () => {
      console.log('[InstagramCareController] Redirecting to frontend with status=connected');
      return res.redirect(`${frontendBase}/social-media/instagram?status=connected`);
    };

    if (error) {
      const errorMsg = error_description || error_reason || error;
      return respondError(errorMsg, error);
    }

    if (!code) {
      return respondError('Missing authorization code from Meta');
    }

    if (!config.appSecret) {
      return respondError('INSTAGRAM_APP_SECRET is not configured on server.');
    }

    try {
      const shortLivedData = await instagramCareService.exchangeCodeForShortLivedToken(code);
      const shortLivedToken = shortLivedData.access_token;

      if (!shortLivedToken) {
        throw new Error('No access token received from Instagram authorization exchange');
      }

      const longLivedData = await instagramCareService.exchangeForLongLivedToken(shortLivedToken);
      const finalToken = longLivedData.access_token || shortLivedToken;

      const profileData = await instagramCareService.fetchInstagramProfile(finalToken, shortLivedData.user_id);

      await instagramCareService.saveConnectedAccount(profileData, {
        access_token: finalToken,
        expires_in: longLivedData.expires_in,
      });

      return respondSuccess();
    } catch (err) {
      console.error('[InstagramCareController] Callback processing failed:', err.message);
      return respondError(err.message || 'Instagram connection failed. Please try again.');
    }
  }

  /**
   * POST /instagram/disconnect
   */
  async disconnect(req, res) {
    try {
      const result = await instagramCareService.disconnectAccount();
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error disconnecting account:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to disconnect Instagram account',
        error: error.message,
      });
    }
  }

  /**
   * POST /instagram/connect
   */
  async connect(req, res) {
    try {
      const result = await instagramCareService.connectAccount();
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error connecting account:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to connect Instagram account',
        error: error.message,
      });
    }
  }

  // ================= 3. META WEBHOOK RECEIVER =================

  /**
   * GET /api/instagram/webhook or /instagram/webhook
   * Meta Webhook Verification endpoint
   */
  getWebhook(req, res) {
    try {
      const result = instagramCareService.verifyWebhook(req.query);

      if (result.verified) {
        console.log('[InstagramCareController] Webhook verification challenge matched successfully');
        return res.status(200).send(result.challenge);
      }

      console.warn('[InstagramCareController] Webhook verification failed with query:', req.query);
      return res.sendStatus(403);
    } catch (error) {
      console.error('[InstagramCareController] Error during webhook GET handshake:', error.message);
      return res.sendStatus(500);
    }
  }

  /**
   * POST /api/instagram/webhook or /instagram/webhook
   * Meta Webhook event receiver for incoming Instagram messages
   */
  async postWebhook(req, res) {
    try {
      instagramCareService.handleWebhookEvent(req.body).catch((err) => {
        console.error('❌ [InstagramCareController] Background webhook processing error:', err.message);
      });

      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ [InstagramCareController] Error in webhook POST:', err.message);
      return res.sendStatus(200);
    }
  }

  // ================= 4. DIRECT MESSAGES & REDIS CONVERSATIONS =================

  /**
   * POST /api/care/instagram/messages or /instagram/messages or /instagram/send
   * Send a message to an Instagram user
   */
  async sendMessage(req, res) {
    try {
      const recipientId =
        req.body.recipientId ||
        req.body.recipient?.id ||
        req.body.recipientInstagramId ||
        req.body.to;

      const text =
        req.body.text ||
        req.body.message?.text ||
        req.body.message;

      const explicitToken = req.body.accessToken || req.headers['x-meta-token'];

      if (!recipientId || !text) {
        return res.status(400).json({
          success: false,
          message: 'Both recipientId (or recipient.id) and text (or message.text) are required.',
        });
      }

      const result = await instagramCareService.sendMessage({
        recipientId,
        text,
        accessToken: explicitToken,
        isHumanReply: true, // Human dashboard reply — triggers AI handoff pause
      });

      // Ensure conversation state reflects HUMAN mode when agent manually replies.
      // This is additive — does not break existing send behavior.
      try {
        const instagramCrmService = require('../../Services/care/instagramCrmService');
        instagramCrmService.recordHumanTakeover(recipientId).catch(() => {});
      } catch (_) {}

      return res.status(200).json(result);

    } catch (error) {
      console.error('[InstagramCareController] Error sending Instagram message:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to send Instagram message',
      });
    }
  }

  /**
   * GET /api/care/instagram/conversations or /instagram/conversations
   * Return all active 2-hour Redis conversations for the inbox
   */
  async getConversations(req, res) {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const conversations = await instagramCareService.getConversations(forceRefresh);
      return res.status(200).json({
        success: true,
        count: conversations.length,
        conversations,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error fetching conversations from Redis:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Instagram conversations from Redis cache',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/care/instagram/conversations/:customerId/messages
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

      const messages = await instagramCareService.getCustomerMessages(customerId);
      await instagramCareService.markAsRead(customerId);

      return res.status(200).json({
        success: true,
        customerId,
        count: messages.length,
        messages,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error fetching customer messages from Redis:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve messages from Redis cache',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/instagram/messages or /instagram/messages
   */
  async getMessages(req, res) {
    try {
      const customerId = req.query.customerId || req.query.senderId || req.query.recipientId;
      if (customerId) {
        const messages = await instagramCareService.getCustomerMessages(customerId);
        return res.status(200).json({ success: true, messages });
      }
      const conversations = await instagramCareService.getConversations();
      return res.status(200).json({ success: true, conversations });
    } catch (error) {
      console.error('[InstagramCareController] Error fetching messages:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve Instagram messages',
        error: error.message,
      });
    }
  }


  /**
   * DELETE /api/care/instagram/messages/:messageId
   */
  async deleteMessage(req, res) {
    try {
      const { messageId, customerId } = req.params;
      const mid = messageId || req.body?.messageId || req.query?.messageId;
      const cid = customerId || req.body?.customerId || req.query?.customerId;

      if (!mid) {
        return res.status(400).json({
          success: false,
          message: 'messageId is required to delete a message',
        });
      }

      const result = await instagramCareService.deleteMessage(cid, mid);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error deleting message:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete message',
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/care/instagram/conversations/:customerId
   */
  async deleteConversation(req, res) {
    try {
      const { customerId } = req.params;
      const cid = customerId || req.body?.customerId || req.query?.customerId;

      if (!cid) {
        return res.status(400).json({
          success: false,
          message: 'customerId is required to delete a conversation',
        });
      }

      const result = await instagramCareService.deleteConversation(cid);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error deleting conversation:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete conversation',
        error: error.message,
      });
    }
  }

  // ================= 5. AI CONVERSATION MANAGEMENT =================

  /**
   * GET /instagram/conversations/:customerId/mode
   * Get conversation AI mode and full state for the support dashboard.
   */
  async getConversationMode(req, res) {
    try {
      const customerId = req.params.customerId;
      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      let state = null;
      if (typeof instagramCrmService?.getConversationState === 'function') {
        state = await instagramCrmService.getConversationState(customerId);
      } else if (typeof instagramCrmService?.getAiMode === 'function') {
        const mode = await instagramCrmService.getAiMode(customerId);
        state = { instagramUserId: customerId, aiMode: mode, status: 'ACTIVE', humanSupportRequired: mode === 'HUMAN' };
      }

      return res.status(200).json({
        success: true,
        customerId,
        conversationState: state || { instagramUserId: customerId, aiMode: 'AI', status: 'ACTIVE', humanSupportRequired: false },
      });
    } catch (error) {
      console.error('[InstagramCareController] Error getting conversation mode:', error.message);
      return res.status(200).json({
        success: true,
        customerId: req.params.customerId,
        conversationState: { instagramUserId: req.params.customerId, aiMode: 'AI', status: 'ACTIVE', humanSupportRequired: false },
      });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/mode
   * Manually set AI mode (admin action).
   * Body: { mode: 'AI' | 'HUMAN' | 'PAUSED' }
   */
  async setConversationMode(req, res) {
    try {
      const customerId = req.params.customerId;
      const { mode } = req.body;

      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }
      if (!['AI', 'HUMAN', 'PAUSED'].includes(mode)) {
        return res.status(400).json({ success: false, message: 'mode must be AI, HUMAN, or PAUSED' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      await instagramCrmService.setAiMode(customerId, mode);

      return res.status(200).json({ success: true, customerId, mode, message: `Conversation mode set to ${mode}` });
    } catch (error) {
      console.error('[InstagramCareController] Error setting conversation mode:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/resume-ai
   * Human agent explicitly resumes AI mode.
   * Clears human support state. Does NOT destroy Redis context.
   */
  async resumeAi(req, res) {
    try {
      const customerId = req.params.customerId;
      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      await instagramCrmService.resumeAi(customerId);

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'AI',
        message: 'AI resumed for this conversation. Future customer messages will be handled by AI.',
      });
    } catch (error) {
      console.error('[InstagramCareController] Error resuming AI:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/accept-support
   * Accept customer support request. Sets ticketStatus = IN_PROGRESS, aiMode = HUMAN.
   */
  async acceptSupport(req, res) {
    try {
      const { customerId } = req.params;
      const agentName = req.user?.username || req.user?.name || req.body?.agentName || 'Support Agent';

      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.acceptSupportRequest(customerId, agentName);

      // Send live confirmation message to user via Instagram
      try {
        const instagramCareService = require('../../Services/care/instagramCareService');
        await instagramCareService.sendMessage({
          recipientId: customerId,
          text: `👋 Hello! Support specialist ${agentName} has joined the chat and will assist you now. Please share your query.`,
          isHumanReply: true,
        });
      } catch (dmErr) {
        console.warn('[InstagramCareController] Warning: Could not send accept DM to user:', dmErr.message);
      }

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'HUMAN',
        ticketStatus: 'IN_PROGRESS',
        assignedAgent: agentName,
        message: `Support request accepted by ${agentName}. AI is paused and human conversation is active.`,
        ...result,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error accepting support request:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/reject-support
   * Reject customer support request. Sets ticketStatus = REJECTED, aiMode = AI.
   */
  async rejectSupport(req, res) {
    try {
      const { customerId } = req.params;
      const agentName = req.user?.username || req.user?.name || req.body?.agentName || 'Support Agent';
      const reason = req.body?.reason || 'Request closed by support agent';

      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.rejectSupportRequest(customerId, agentName, reason);

      // Send live notification DM to user via Instagram
      try {
        const instagramCareService = require('../../Services/care/instagramCareService');
        await instagramCareService.sendMessage({
          recipientId: customerId,
          text: `Your support request has been closed. Our AI assistant remains active to help you with any questions about Ertitech services!`,
          isHumanReply: false,
        });
      } catch (dmErr) {
        console.warn('[InstagramCareController] Warning: Could not send reject DM to user:', dmErr.message);
      }

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'AI',
        ticketStatus: 'REJECTED',
        message: `Support request rejected by ${agentName}. AI has been resumed.`,
        ...result,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error rejecting support request:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/takeover
   * Human agent manually takes over a conversation from AI.
   * Body: { agentName?: string }
   */
  async takeoverConversation(req, res) {
    return this.acceptSupport(req, res);
  }

  /**
   * GET /instagram/support-tickets
   * Fetch all Instagram customer support tickets
   */
  async getSupportTickets(req, res) {
    try {
      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const data = await instagramCrmService.getSupportTickets();
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error fetching support tickets:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/resolve-ticket
   * Mark active support ticket as resolved and resume AI
   */
  async resolveTicket(req, res) {
    try {
      const { customerId } = req.params;
      const agentName = req.user?.username || req.user?.name || req.body?.agentName || 'Support Agent';

      if (!customerId) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.resolveSupportTicket(customerId, agentName);

      return res.status(200).json({
        success: true,
        customerId,
        aiMode: 'AI',
        message: `Ticket resolved by ${agentName}. AI has been resumed for this conversation.`,
        ...result,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error resolving support ticket:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /instagram/ai-settings
   * Get current global AI settings.
   */
  async getAiSettings(req, res) {
    try {
      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const settings = await instagramCrmService.getAiSettings();
      return res.status(200).json({ success: true, settings });
    } catch (error) {
      console.error('[InstagramCareController] Error getting AI settings:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/ai-settings
   * Update global AI settings. (Admin only — enforced by existing auth middleware at route level)
   * Body: { dmAiEnabled?, autoReplyEnabled?, commentAiEnabled?, confidenceThreshold? }
   */
  async updateAiSettings(req, res) {
    try {
      const updates = req.body || {};
      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const settings = await instagramCrmService.updateAiSettings(updates);
      return res.status(200).json({ success: true, settings, message: 'AI settings updated successfully' });
    } catch (error) {
      console.error('[InstagramCareController] Error updating AI settings:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/ai-reply (EXTENDED — preserves existing contract)
   * Generates AI reply suggestion.
   * Returns intent, confidence, requiresHuman in addition to existing reply field.
   */
  async generateAiReply(req, res) {
    try {
      const { text, message, history } = req.body;
      const query = text || message || '';

      if (!query.trim()) {
        return res.status(400).json({ success: false, message: 'text or message is required' });
      }

      const crmChatbot = require('../../Services/crmChatbot');
      const instagramAiDecisionService = require('../../Services/care/instagramAiDecisionService');

      const intent = instagramAiDecisionService.detectIntent(query);
      const { requiresHuman } = instagramAiDecisionService.requiresHuman(intent, query, 0);

      const reply = await crmChatbot.generateReply(query, history || []);
      const { safe } = instagramAiDecisionService.validateResponse(reply);

      return res.status(200).json({
        success: true,
        userMessage: query,
        reply: safe ? reply : 'I understand your concern. Let me connect you with our support team for further assistance.',
        intent,
        confidence: 0.9,
        requiresHuman,
        safe,
      });
    } catch (error) {
      console.error('[InstagramCareController] Error generating AI reply:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/conversations/:customerId/close-support
   * Explicitly closes support mode and resumes AI
   */
  async closeSupport(req, res) {
    return this.resolveTicket(req, res);
  }

  /**
   * DELETE /instagram/support-tickets/:ticketId
   * Delete a support ticket record from database
   */
  async deleteSupportTicket(req, res) {
    try {
      const { ticketId } = req.params;
      if (!ticketId) {
        return res.status(400).json({ success: false, message: 'ticketId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.deleteSupportTicket(ticketId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error deleting support ticket:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ================= 6. LEAD GENERATION =================

  /**
   * GET /instagram/leads
   * Get all captured leads from Instagram
   */
  async getLeads(req, res) {
    try {
      const { status, search } = req.query;
      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const data = await instagramCrmService.getLeads({ status, search });
      return res.status(200).json(data);
    } catch (error) {
      console.error('[InstagramCareController] Error fetching leads:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /instagram/leads
   * Manually create a new lead
   */
  async createLead(req, res) {
    try {
      const { instagramUserId, username, serviceRequirement, notes, status, assignedAgent } = req.body;

      if (!instagramUserId) {
        return res.status(400).json({ success: false, message: 'instagramUserId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const lead = await instagramCrmService.createOrUpdateLead({
        instagramUserId,
        username,
        serviceRequirement,
        notes,
        status: status || 'NEW',
        assignedAgent,
      });

      return res.status(201).json({ success: true, lead, message: 'Lead created successfully' });
    } catch (error) {
      console.error('[InstagramCareController] Error creating lead:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /instagram/leads/:leadId
   * Update a lead's information or status
   */
  async updateLead(req, res) {
    try {
      const { leadId } = req.params;
      const updates = req.body;

      if (!leadId) {
        return res.status(400).json({ success: false, message: 'leadId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.updateLead(leadId, updates);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error updating lead:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /instagram/leads/:leadId
   * Delete a lead
   */
  async deleteLead(req, res) {
    try {
      const { leadId } = req.params;

      if (!leadId) {
        return res.status(400).json({ success: false, message: 'leadId is required' });
      }

      const instagramCrmService = require('../../Services/care/instagramCrmService');
      const result = await instagramCrmService.deleteLead(leadId);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('[InstagramCareController] Error deleting lead:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new InstagramCareController();

