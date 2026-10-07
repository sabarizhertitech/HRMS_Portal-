const mongoose = require('mongoose');
const redisClient = require('../../utilities/redis');
const Notification = require('../../Models/Notification');

// Lazy-load models to avoid circular dependency issues at startup
let InstagramCustomer = null;
let InstagramConversation = null;
let InstagramAiSettings = null;
let InstagramLead = null;

function getModels() {
  if (!InstagramCustomer) {
    InstagramCustomer = require('../../Models/Social Media/care/InstagramCustomer');
  }
  if (!InstagramConversation) {
    InstagramConversation = require('../../Models/Social Media/care/InstagramConversation');
  }
  if (!InstagramAiSettings) {
    InstagramAiSettings = require('../../Models/Social Media/care/InstagramAiSettings');
  }
  if (!InstagramLead) {
    InstagramLead = require('../../Models/Social Media/care/InstagramLead');
  }
  return { InstagramCustomer, InstagramConversation, InstagramAiSettings, InstagramLead };
}

// Redis key TTLs
const MODE_CACHE_TTL = 300;     // 5 minutes — AI mode cache
const SETTINGS_CACHE_TTL = 300; // 5 minutes — AI settings cache

// Redis keys
const modeKey = (userId) => `ig:conv:mode:${userId}`;
const settingsKey = () => 'ig:ai:settings';

class InstagramCrmService {
  isMongoReady() {
    return mongoose.connection?.readyState === 1;
  }

  isRedisReady() {
    return redisClient && redisClient.isOpen;
  }

  // ==================== CUSTOMER ====================

  async upsertCustomer(instagramUserId, profileData = {}) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return null;

    if (!this.isMongoReady()) {
      // MongoDB unavailable — skip silently, do not crash webhook
      return null;
    }

    try {
      const { InstagramCustomer: Customer } = getModels();
      const now = new Date();

      const updateFields = {
        lastSeenAt: now,
      };

      if (profileData.username) {
        updateFields.username = String(profileData.username).replace(/^@+/, '').trim();
      }
      if (profileData.name) {
        updateFields.name = String(profileData.name).replace(/^@+/, '').trim();
      }
      if (profileData.profilePic || profileData.profilePictureUrl) {
        updateFields.profilePictureUrl = profileData.profilePic || profileData.profilePictureUrl;
      }
      if (profileData.accountType) updateFields.accountType = profileData.accountType;
      if (profileData.productInterest) updateFields.productInterest = profileData.productInterest;

      const customer = await Customer.findOneAndUpdate(
        { instagramUserId: uid },
        {
          $set: updateFields,
          $setOnInsert: {
            firstSeenAt: now,
            leadStatus: 'NEW',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return customer;
    } catch (err) {
      console.error(`[InstagramCrmService] upsertCustomer error for ${uid}:`, err.message);
      return null;
    }
  }

  // ==================== CONVERSATION STATE ====================

  async getOrCreateConversation(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return null;

    if (!this.isMongoReady()) return null;

    try {
      const { InstagramConversation: Conversation } = getModels();

      let conv = await Conversation.findOne({ instagramUserId: uid });
      if (!conv) {
        conv = await Conversation.create({
          instagramUserId: uid,
          aiMode: 'AI',
          status: 'ACTIVE',
          humanSupportRequired: false,
          lastActivityAt: new Date(),
        });
      }

      return conv;
    } catch (err) {
      // Handle duplicate key race condition
      if (err.code === 11000) {
        try {
          const { InstagramConversation: Conversation } = getModels();
          return await Conversation.findOne({ instagramUserId: uid });
        } catch (_) {}
      }
      console.error(`[InstagramCrmService] getOrCreateConversation error for ${uid}:`, err.message);
      return null;
    }
  }

  // ==================== AI MODE ====================

  async getAiMode(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return 'AI';

    // 1. Check Redis cache first for fast response
    if (this.isRedisReady()) {
      try {
        const cachedMode = await redisClient.get(modeKey(uid));
        if (cachedMode && ['AI', 'HUMAN', 'PAUSED'].includes(cachedMode)) {
          return cachedMode;
        }
      } catch (_) {}
    }

    // 2. Check MongoDB (Authoritative Source of Truth)
    if (!this.isMongoReady()) return 'AI';

    try {
      const { InstagramConversation: Conversation } = getModels();
      const conv = await Conversation.findOne({ instagramUserId: uid }).select('aiMode humanSupportRequired ticketStatus');

      if (!conv) return 'AI';

      const isSupportActive =
        conv.aiMode === 'HUMAN' ||
        conv.ticketStatus === 'IN_PROGRESS';

      if (isSupportActive) {
        try {
          if (this.isRedisReady()) {
            await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'HUMAN');
          }
        } catch (_) {}
        return 'HUMAN';
      }

      if (conv.ticketStatus === 'PENDING' || conv.aiMode === 'PAUSED') {
        try {
          if (this.isRedisReady()) {
            await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'PAUSED');
          }
        } catch (_) {}
        return 'PAUSED';
      }

      // If ticket is resolved/closed/rejected and DB still had HUMAN/PAUSED, heal to AI
      if (conv.aiMode !== 'AI' && (conv.ticketStatus === 'RESOLVED' || conv.ticketStatus === 'REJECTED' || conv.ticketStatus === 'CLOSED' || !conv.ticketStatus || conv.ticketStatus === 'NONE')) {
        await Conversation.updateOne(
          { instagramUserId: uid },
          { $set: { aiMode: 'AI', humanSupportRequired: false } }
        );
      }

      try {
        if (this.isRedisReady()) {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'AI');
        }
      } catch (_) {}

      return 'AI';
    } catch (err) {
      console.error(`[InstagramCrmService] getAiMode error for ${uid}:`, err.message);
      return 'AI';
    }
  }

  /**
   * Set the AI mode for a customer.
   * Persists to MongoDB (source of truth) and updates Redis cache.
   */
  async setAiMode(instagramUserId, mode) {
    const uid = String(instagramUserId || '').trim();
    if (!uid || !['AI', 'HUMAN', 'PAUSED'].includes(mode)) return false;

    // Update Redis cache immediately
    try {
      if (this.isRedisReady()) {
        await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, mode);
      }
    } catch (_) {}

    // Persist to MongoDB
    if (!this.isMongoReady()) return false;

    try {
      const { InstagramConversation: Conversation } = getModels();
      await Conversation.findOneAndUpdate(
        { instagramUserId: uid },
        { $set: { aiMode: mode, lastActivityAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return true;
    } catch (err) {
      console.error(`[InstagramCrmService] setAiMode error for ${uid}:`, err.message);
      return false;
    }
  }

  // ==================== HUMAN HANDOFF & SUPPORT LIFECYCLE ====================

  /**
   * Step 1: Customer requests support -> Ticket created in PENDING state.
   * AI is paused waiting for support agent to Accept or Reject.
   */
  async initiateHumanHandoff(
    instagramUserId,
    reason = 'Customer requested support team assistance',
    intent = 'HUMAN_REQUEST',
    customerName = null,
    serviceRequested = 'Customer Support Request'
  ) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return { success: false, ticketId: null };

    const ticketId = `TICK-${Date.now().toString().slice(-6)}`;
    console.log(`[InstagramCrmService] 🎫 Creating Support Ticket #${ticketId} (PENDING) for ${uid} | Service: ${serviceRequested} | Reason: ${reason}`);

    // Set mode = PAUSED (waiting for agent acceptance)
    await this.setAiMode(uid, 'PAUSED');

    // Update conversation state in MongoDB
    if (this.isMongoReady()) {
      try {
        const { InstagramConversation: Conversation } = getModels();
        await Conversation.findOneAndUpdate(
          { instagramUserId: uid },
          {
            $set: {
              aiMode: 'PAUSED',
              humanSupportRequired: true,
              ticketId,
              ticketStatus: 'PENDING',
              serviceRequested: serviceRequested || 'Customer Support Request',
              ticketCreatedAt: new Date(),
              escalationReason: reason,
              escalationIntent: intent,
              assignedAgent: null,
              resolvedAt: null,
              resolvedBy: null,
              lastActivityAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.error(`[InstagramCrmService] initiateHumanHandoff DB error for ${uid}:`, err.message);
      }
    }

    // Create support notification for admin
    await this._createEscalationNotification(uid, customerName, reason, intent, ticketId);

    return { success: true, ticketId, ticketStatus: 'PENDING' };
  }

  /**
   * Step 2: Support agent accepts the request -> Ticket becomes IN_PROGRESS (SUPPORT ACTIVE).
   * AI Reply is turned OFF (aiMode = 'HUMAN'). Human conversation begins.
   */
  async acceptSupportRequest(instagramUserId, agentName = 'Support Agent') {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return { success: false, message: 'Invalid customer ID' };

    console.log(`[InstagramCrmService] 🟢 Support Request ACCEPTED for ${uid} by ${agentName}`);

    await this.setAiMode(uid, 'HUMAN');

    if (this.isMongoReady()) {
      try {
        const { InstagramConversation: Conversation } = getModels();
        const conv = await Conversation.findOne({ instagramUserId: uid });
        const ticketId = conv?.ticketId || `TICK-${Date.now().toString().slice(-6)}`;

        const updated = await Conversation.findOneAndUpdate(
          { instagramUserId: uid },
          {
            $set: {
              aiMode: 'HUMAN',
              humanSupportRequired: true,
              ticketId,
              ticketStatus: 'IN_PROGRESS',
              assignedAgent: agentName,
              lastActivityAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (this.isRedisReady()) {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'HUMAN');
        }

        return {
          success: true,
          customerId: uid,
          ticketId,
          ticketStatus: 'IN_PROGRESS',
          aiMode: 'HUMAN',
          assignedAgent: agentName,
          conversation: updated?.toObject(),
        };
      } catch (err) {
        console.error(`[InstagramCrmService] acceptSupportRequest error for ${uid}:`, err.message);
        return { success: false, message: err.message };
      }
    }

    return { success: false, message: 'MongoDB not available' };
  }

  /**
   * Step 3: Support agent rejects the request -> Ticket becomes REJECTED.
   * AI is turned back ON (aiMode = 'AI').
   */
  async rejectSupportRequest(instagramUserId, agentName = 'Support Agent', reason = 'Rejected by support agent') {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return { success: false, message: 'Invalid customer ID' };

    console.log(`[InstagramCrmService] 🔴 Support Request REJECTED for ${uid} by ${agentName}`);

    await this.setAiMode(uid, 'AI');

    if (this.isMongoReady()) {
      try {
        const { InstagramConversation: Conversation } = getModels();
        const updated = await Conversation.findOneAndUpdate(
          { instagramUserId: uid },
          {
            $set: {
              aiMode: 'AI',
              humanSupportRequired: false,
              ticketStatus: 'REJECTED',
              resolvedAt: new Date(),
              resolvedBy: agentName,
              assignedAgent: null,
              aiAttemptCount: 0,
              lastActivityAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (this.isRedisReady()) {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'AI');
        }

        return {
          success: true,
          customerId: uid,
          ticketStatus: 'REJECTED',
          aiMode: 'AI',
          conversation: updated?.toObject(),
        };
      } catch (err) {
        console.error(`[InstagramCrmService] rejectSupportRequest error for ${uid}:`, err.message);
        return { success: false, message: err.message };
      }
    }

    return { success: false, message: 'MongoDB not available' };
  }

  /**
   * Step 4: Support agent closes support -> Ticket becomes RESOLVED.
   * AI is turned back ON (aiMode = 'AI').
   */
  async resolveSupportTicket(instagramUserId, agentName = 'Support Agent') {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return { success: false, message: 'Invalid customer ID' };

    console.log(`[InstagramCrmService] ✅ Resolving Support Ticket for ${uid} by ${agentName}`);

    await this.setAiMode(uid, 'AI');

    if (this.isMongoReady()) {
      try {
        const { InstagramConversation: Conversation } = getModels();
        const updated = await Conversation.findOneAndUpdate(
          { instagramUserId: uid },
          {
            $set: {
              aiMode: 'AI',
              humanSupportRequired: false,
              ticketStatus: 'RESOLVED',
              resolvedAt: new Date(),
              resolvedBy: agentName,
              assignedAgent: null,
              assignedTeam: null,
              escalationReason: null,
              escalationIntent: null,
              aiAttemptCount: 0,
              lastActivityAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (this.isRedisReady()) {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'AI');
        }

        return {
          success: true,
          customerId: uid,
          ticketStatus: 'RESOLVED',
          aiMode: 'AI',
          conversation: updated?.toObject(),
        };
      } catch (err) {
        console.error(`[InstagramCrmService] resolveSupportTicket error for ${uid}:`, err.message);
        return { success: false, message: err.message };
      }
    }

    return { success: false, message: 'MongoDB not available' };
  }

  async resumeAi(instagramUserId) {
    return this.resolveSupportTicket(instagramUserId);
  }

  /**
   * Get all customer support tickets for the Support Desk table view.
   * Joins InstagramConversation with InstagramCustomer metadata.
   */
  async getSupportTickets() {
    if (!this.isMongoReady()) {
      return { success: false, tickets: [], count: 0, openCount: 0, pendingCount: 0, activeCount: 0, resolvedCount: 0 };
    }

    try {
      const { InstagramConversation: Conversation, InstagramCustomer: Customer } = getModels();

      const query = {
        $or: [
          { ticketId: { $ne: null } },
          { ticketStatus: { $in: ['PENDING', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'] } },
          { humanSupportRequired: true },
        ],
      };

      const conversations = await Conversation.find(query).sort({ updatedAt: -1 }).lean();

      // Collect user IDs to batch fetch customer profiles
      const userIds = conversations.map((c) => c.instagramUserId);
      const customers = await Customer.find({ instagramUserId: { $in: userIds } }).lean();
      const customerMap = new Map();
      for (const cust of customers) {
        customerMap.set(cust.instagramUserId, cust);
      }

      let openCount = 0;
      let pendingCount = 0;
      let activeCount = 0;
      let resolvedCount = 0;

      const tickets = conversations.map((conv) => {
        const cust = customerMap.get(conv.instagramUserId) || {};
        const fallbackTicketId = conv.ticketId || `TICK-${conv._id.toString().slice(-6).toUpperCase()}`;

        // Normalize status
        let status = conv.ticketStatus && conv.ticketStatus !== 'NONE'
          ? conv.ticketStatus
          : (conv.humanSupportRequired ? 'PENDING' : 'RESOLVED');

        if (status === 'OPEN') status = 'PENDING';

        if (status === 'PENDING') {
          pendingCount++;
          openCount++;
        } else if (status === 'IN_PROGRESS') {
          activeCount++;
          openCount++;
        } else {
          resolvedCount++;
        }

        const rawUsername = cust.username || '';
        const cleanUsername = rawUsername.replace(/^@+/, '').trim();
        const rawCustomerName = cust.name || '';
        const cleanName = rawCustomerName.replace(/^@+/, '').trim();

        return {
          id: conv._id,
          ticketId: fallbackTicketId,
          instagramUserId: conv.instagramUserId,
          customerId: conv.instagramUserId,
          username: cleanUsername || null,
          customerName: cleanName || (cleanUsername ? `@${cleanUsername}` : `Instagram User (${conv.instagramUserId.slice(-4)})`),
          profilePictureUrl: cust.profilePictureUrl || null,
          accountType: cust.accountType || 'Instagram User',
          serviceRequested: conv.serviceRequested || cust.productInterest || 'Customer Support Request',
          escalationReason: conv.escalationReason || 'Customer requested support',
          escalationIntent: conv.escalationIntent || 'HUMAN_REQUEST',
          ticketStatus: status,
          aiMode: status === 'IN_PROGRESS' ? 'HUMAN' : (status === 'PENDING' ? 'PAUSED' : 'AI'),
          humanSupportRequired: status === 'PENDING' || status === 'IN_PROGRESS',
          assignedAgent: conv.assignedAgent || null,
          ticketCreatedAt: conv.ticketCreatedAt || conv.createdAt,
          resolvedAt: conv.resolvedAt || null,
          resolvedBy: conv.resolvedBy || null,
          lastActivityAt: conv.lastActivityAt || conv.updatedAt,
        };
      });

      return {
        success: true,
        count: tickets.length,
        openCount,
        pendingCount,
        activeCount,
        resolvedCount,
        tickets,
      };
    } catch (err) {
      console.error('[InstagramCrmService] getSupportTickets error:', err.message);
      return { success: false, tickets: [], count: 0, openCount: 0, error: err.message };
    }
  }

  /**
   * Record a human agent taking over the conversation.
   */
  async recordHumanTakeover(instagramUserId, agentName = 'Support Agent') {
    return this.acceptSupportRequest(instagramUserId, agentName);
  }

  // ==================== AI ATTEMPT COUNTER ====================

  /**
   * Increment the AI attempt counter for a conversation.
   * Used to detect when AI has repeatedly failed to resolve a query.
   */
  async incrementAiAttemptCount(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid || !this.isMongoReady()) return 0;

    try {
      const { InstagramConversation: Conversation } = getModels();
      const conv = await Conversation.findOneAndUpdate(
        { instagramUserId: uid },
        { $inc: { aiAttemptCount: 1 }, $set: { lastActivityAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return conv?.aiAttemptCount || 1;
    } catch (err) {
      console.error(`[InstagramCrmService] incrementAiAttemptCount error for ${uid}:`, err.message);
      return 0;
    }
  }

  async resetAiAttemptCount(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid || !this.isMongoReady()) return;

    try {
      const { InstagramConversation: Conversation } = getModels();
      await Conversation.findOneAndUpdate(
        { instagramUserId: uid },
        { $set: { aiAttemptCount: 0 } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[InstagramCrmService] resetAiAttemptCount error for ${uid}:`, err.message);
    }
  }

  // ==================== AI SETTINGS ====================

  /**
   * Get current AI settings.
   * Redis cache → MongoDB → hardcoded production defaults.
   */
  async getAiSettings() {
    // 1. Redis cache
    try {
      if (this.isRedisReady()) {
        const cached = await redisClient.get(settingsKey());
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (_) {}

    // 2. MongoDB
    if (this.isMongoReady()) {
      try {
        const { InstagramAiSettings: Settings } = getModels();
        let settings = await Settings.findOne({});
        if (!settings) {
          // Seed default settings on first access
          settings = await Settings.create({
            dmAiEnabled: true,
            autoReplyEnabled: true,
            commentAiEnabled: false,
            confidenceThreshold: 0.85,
          });
        }

        const plain = settings.toObject();

        // Cache for 5 minutes
        try {
          if (this.isRedisReady()) {
            await redisClient.setEx(settingsKey(), SETTINGS_CACHE_TTL, JSON.stringify(plain));
          }
        } catch (_) {}

        return plain;
      } catch (err) {
        console.error('[InstagramCrmService] getAiSettings DB error:', err.message);
      }
    }

    // 3. Production defaults (fallback when both Redis and MongoDB are unavailable)
    return {
      dmAiEnabled: true,
      autoReplyEnabled: true,
      commentAiEnabled: false,
      confidenceThreshold: 0.85,
    };
  }

  /**
   * Update AI settings. Authorized users only (enforced at route/controller level).
   */
  async updateAiSettings(updates) {
    if (!this.isMongoReady()) {
      throw new Error('MongoDB unavailable — cannot update AI settings');
    }

    const allowed = ['dmAiEnabled', 'autoReplyEnabled', 'commentAiEnabled', 'confidenceThreshold'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (key in updates) safeUpdates[key] = updates[key];
    }

    const { InstagramAiSettings: Settings } = getModels();
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: safeUpdates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Invalidate Redis cache
    try {
      if (this.isRedisReady()) {
        await redisClient.del(settingsKey());
      }
    } catch (_) {}

    return settings.toObject();
  }

  // ==================== NOTIFICATIONS ====================

  async _createEscalationNotification(instagramUserId, customerName, reason, intent, ticketId = null) {
    if (!this.isMongoReady()) return;

    const displayName = customerName || `Instagram User (@${String(instagramUserId).slice(-4)})`;
    const ticketLabel = ticketId ? ` [Ticket #${ticketId}]` : '';

    try {
      await Notification.create({
        type: 'INSTAGRAM_MESSAGE',
        toAdmin: true,
        title: `🔴 New Support Query from ${displayName}${ticketLabel}`,
        message: `Customer requested support. Reason: ${reason}. Click here to open conversation and reply.`,
        metadata: {
          url: `/social-media/instagram?tab=messages&userId=${instagramUserId}`,
          targetModule: 'INSTAGRAM_SUPPORT',
          senderId: instagramUserId,
          ticketId: ticketId || '',
        },
      });
    } catch (err) {
      console.warn('[InstagramCrmService] Error creating escalation notification:', err.message);
    }
  }

  // ==================== LEAD GENERATION ====================

  /**
   * Create or update a potential lead from Instagram conversation.
   */
  async createOrUpdateLead({
    instagramUserId,
    username = null,
    serviceRequirement = 'General Inquiry',
    notes = '',
    status = 'NEW',
    assignedAgent = null,
  }) {
    const uid = String(instagramUserId || '').trim();
    if (!uid || !this.isMongoReady()) return null;

    try {
      const { InstagramLead: Lead } = getModels();
      const existing = await Lead.findOne({ instagramUserId: uid });

      if (existing) {
        const updates = {};
        if (username && username.trim()) updates.username = username.trim();
        if (serviceRequirement && serviceRequirement.trim()) updates.serviceRequirement = serviceRequirement.trim();
        if (notes && notes.trim()) updates.notes = notes.trim();
        if (status) updates.status = status;
        if (assignedAgent) updates.assignedAgent = assignedAgent;

        const updated = await Lead.findByIdAndUpdate(existing._id, { $set: updates }, { new: true });
        console.log(`[InstagramCrmService] 🌟 Updated Lead #${updated.leadId} for ${uid} (@${updated.username || 'unknown'})`);
        return updated;
      }

      const leadId = `LEAD-${Date.now().toString().slice(-6)}`;
      const newLead = await Lead.create({
        leadId,
        instagramUserId: uid,
        username: username || null,
        serviceRequirement: serviceRequirement || 'General Inquiry',
        notes: notes || '',
        status: status || 'NEW',
        assignedAgent: assignedAgent || null,
        capturedAt: new Date(),
      });

      console.log(`[InstagramCrmService] 🚀 Created New Lead #${leadId} for ${uid}`);

      // Create Admin notification for the new lead
      try {
        const displayName = username ? `@${username}` : `Instagram User (${uid.slice(-4)})`;
        await Notification.create({
          type: 'INSTAGRAM_MESSAGE',
          toAdmin: true,
          title: `🎯 New Lead Captured: ${displayName}`,
          message: `Inquiry for ${serviceRequirement || 'Ertitech Services'}. Click here to view details and reply directly.`,
          metadata: {
            url: `/social-media/instagram?tab=leads`,
            targetModule: 'INSTAGRAM_LEADS',
            senderId: uid,
            leadId,
          },
        });
      } catch (_) {}

      return newLead;
    } catch (err) {
      console.error(`[InstagramCrmService] createOrUpdateLead error for ${uid}:`, err.message);
      return null;
    }
  }

  /**
   * Get all captured leads with metrics.
   */
  async getLeads(queryFilter = {}) {
    if (!this.isMongoReady()) {
      return { success: false, leads: [], count: 0, newCount: 0 };
    }

    try {
      const { InstagramLead: Lead } = getModels();
      const query = {};

      if (queryFilter.status && queryFilter.status !== 'ALL') {
        query.status = queryFilter.status;
      }

      if (queryFilter.search) {
        const s = queryFilter.search.trim();
        query.$or = [
          { leadId: { $regex: s, $options: 'i' } },
          { username: { $regex: s, $options: 'i' } },
          { serviceRequirement: { $regex: s, $options: 'i' } },
          { notes: { $regex: s, $options: 'i' } },
          { instagramUserId: { $regex: s, $options: 'i' } },
        ];
      }

      const leads = await Lead.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
      const allLeads = await Lead.find({}).lean();

      const newCount = allLeads.filter((l) => l.status === 'NEW').length;
      const inProgressCount = allLeads.filter((l) => l.status === 'IN_PROGRESS' || l.status === 'CONTACTED').length;
      const convertedCount = allLeads.filter((l) => l.status === 'CONVERTED').length;

      return {
        success: true,
        count: leads.length,
        totalCount: allLeads.length,
        newCount,
        inProgressCount,
        convertedCount,
        leads,
      };
    } catch (err) {
      console.error('[InstagramCrmService] getLeads error:', err.message);
      return { success: false, leads: [], count: 0, newCount: 0, error: err.message };
    }
  }

  /**
   * Update lead details.
   */
  async updateLead(leadIdOrMongoId, updates) {
    if (!this.isMongoReady()) return { success: false, message: 'MongoDB not available' };

    try {
      const { InstagramLead: Lead } = getModels();
      const query = mongoose.Types.ObjectId.isValid(leadIdOrMongoId)
        ? { _id: leadIdOrMongoId }
        : { leadId: leadIdOrMongoId };

      const updated = await Lead.findOneAndUpdate(query, { $set: updates }, { new: true });
      if (!updated) {
        return { success: false, message: 'Lead not found' };
      }
      return { success: true, lead: updated };
    } catch (err) {
      console.error('[InstagramCrmService] updateLead error:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Delete a lead.
   */
  async deleteLead(leadIdOrMongoId) {
    if (!this.isMongoReady()) return { success: false, message: 'MongoDB not available' };

    try {
      const { InstagramLead: Lead } = getModels();
      const query = mongoose.Types.ObjectId.isValid(leadIdOrMongoId)
        ? { _id: leadIdOrMongoId }
        : { leadId: leadIdOrMongoId };

      await Lead.findOneAndDelete(query);
      return { success: true, message: 'Lead deleted successfully' };
    } catch (err) {
      console.error('[InstagramCrmService] deleteLead error:', err.message);
      return { success: false, message: err.message };
    }
  }

  // ==================== CONVERSATION INFO ====================

  /**
   * Get full conversation state for the management UI.
   */
  async getConversationState(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return { instagramUserId: '', aiMode: 'AI', status: 'ACTIVE', ticketStatus: 'NONE', humanSupportRequired: false };

    if (!this.isMongoReady()) {
      return { instagramUserId: uid, aiMode: 'AI', status: 'ACTIVE', ticketStatus: 'NONE', humanSupportRequired: false };
    }

    try {
      const { InstagramConversation: Conversation } = getModels();
      let conv = await Conversation.findOne({ instagramUserId: uid });
      if (!conv) {
        return { instagramUserId: uid, aiMode: 'AI', status: 'ACTIVE', ticketStatus: 'NONE', humanSupportRequired: false };
      }
      const obj = conv.toObject();
      let status = obj.ticketStatus || 'NONE';
      if (status === 'OPEN') status = 'PENDING';
      obj.ticketStatus = status;

      if (status === 'IN_PROGRESS' || obj.aiMode === 'HUMAN') {
        obj.aiMode = 'HUMAN';
      } else if (status === 'PENDING') {
        obj.aiMode = 'PAUSED';
      } else {
        obj.aiMode = 'AI';
      }
      return obj;
    } catch (err) {
      console.error(`[InstagramCrmService] getConversationState error for ${uid}:`, err.message);
      return { instagramUserId: uid, aiMode: 'AI', status: 'ACTIVE', ticketStatus: 'NONE', humanSupportRequired: false };
    }
  }

  /**
   * Delete support ticket from database and reset conversation support state.
   */
  async deleteSupportTicket(ticketIdOrUid) {
    const id = String(ticketIdOrUid || '').trim();
    if (!id || !this.isMongoReady()) return { success: false, message: 'Invalid ticket ID' };

    try {
      const { InstagramConversation: Conversation } = getModels();
      const mongoose = require('mongoose');
      const orConditions = [
        { ticketId: id },
        { instagramUserId: id },
      ];
      if (mongoose.Types.ObjectId.isValid(id)) {
        orConditions.push({ _id: id });
      }

      const updated = await Conversation.findOneAndUpdate(
        { $or: orConditions },
        {
          $set: {
            ticketId: null,
            ticketStatus: 'NONE',
            humanSupportRequired: false,
            aiMode: 'AI',
            serviceRequested: null,
            escalationReason: null,
            escalationIntent: null,
            ticketCreatedAt: null,
            resolvedAt: null,
            resolvedBy: null,
            assignedAgent: null,
            assignedTeam: null,
            aiAttemptCount: 0,
            lastActivityAt: new Date(),
          },
        },
        { new: true }
      );

      if (updated?.instagramUserId && this.isRedisReady()) {
        try {
          await redisClient.setEx(modeKey(updated.instagramUserId), MODE_CACHE_TTL, 'AI');
        } catch (_) {}
      }

      return { success: true, message: 'Support ticket deleted successfully' };
    } catch (err) {
      console.error(`[InstagramCrmService] deleteSupportTicket error:`, err.message);
      return { success: false, message: err.message };
    }
  }
}

module.exports = new InstagramCrmService();
