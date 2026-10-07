const mongoose = require('mongoose');
const redisClient = require('../../utilities/redis');
const Notification = require('../../Models/Notification');

// Lazy-load models to avoid circular dependencies
let FacebookCustomer = null;
let FacebookConversation = null;
let FacebookAiSettings = null;
let FacebookLead = null;

function getModels() {
  if (!FacebookCustomer) {
    FacebookCustomer = require('../../Models/Social Media/care/FacebookCustomer');
  }
  if (!FacebookConversation) {
    FacebookConversation = require('../../Models/Social Media/care/FacebookConversation');
  }
  if (!FacebookAiSettings) {
    FacebookAiSettings = require('../../Models/Social Media/care/FacebookAiSettings');
  }
  if (!FacebookLead) {
    FacebookLead = require('../../Models/Social Media/care/FacebookLead');
  }
  return { FacebookCustomer, FacebookConversation, FacebookAiSettings, FacebookLead };
}

const MODE_CACHE_TTL = 300;     // 5 minutes
const SETTINGS_CACHE_TTL = 300; // 5 minutes

const modeKey = (userId) => `fb:conv:mode:${userId}`;
const settingsKey = () => 'fb:ai:settings';

class FacebookCrmService {
  isMongoReady() {
    return mongoose.connection?.readyState === 1;
  }

  isRedisReady() {
    return redisClient && redisClient.isOpen;
  }

  // ==================== CUSTOMER ====================

  async upsertCustomer(facebookUserId, profileData = {}) {
    const uid = String(facebookUserId || '').trim();
    if (!uid) return null;

    if (!this.isMongoReady()) {
      return null;
    }

    try {
      const { FacebookCustomer: Customer } = getModels();
      const now = new Date();

      const updateFields = {
        lastSeenAt: now,
      };

      if (profileData.username) {
        updateFields.username = String(profileData.username).replace(/^@+/, '').trim();
      }
      if (profileData.name) {
        updateFields.name = String(profileData.name).trim();
      }
      if (profileData.profilePic || profileData.profilePictureUrl) {
        updateFields.profilePictureUrl = profileData.profilePic || profileData.profilePictureUrl;
      }
      if (profileData.accountType) updateFields.accountType = profileData.accountType;
      if (profileData.productInterest) updateFields.productInterest = profileData.productInterest;

      const customer = await Customer.findOneAndUpdate(
        { facebookUserId: uid },
        {
          $set: updateFields,
          $setOnInsert: {
            firstSeenAt: now,
            leadStatus: 'NEW',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`[FacebookCrmService] ✅ Customer profile stored in DB for ${uid} (${customer?.name || customer?.username || 'unknown'})`);
      return customer;
    } catch (err) {
      console.error(`[FacebookCrmService] upsertCustomer error for ${uid}:`, err.message);
      return null;
    }
  }

  // ==================== CONVERSATION STATE ====================

  async getOrCreateConversation(facebookUserId) {
    const uid = String(facebookUserId || '').trim();
    if (!uid) return null;

    if (!this.isMongoReady()) {
      return { facebookUserId: uid, aiMode: 'AI', status: 'ACTIVE', humanSupportRequired: false };
    }

    try {
      const { FacebookConversation: Conversation } = getModels();

      let conv = await Conversation.findOne({ facebookUserId: uid });
      if (!conv) {
        conv = await Conversation.create({
          facebookUserId: uid,
          aiMode: 'AI',
          status: 'ACTIVE',
          humanSupportRequired: false,
        });
      }
      return conv;
    } catch (err) {
      console.error(`[FacebookCrmService] getOrCreateConversation error for ${uid}:`, err.message);
      return { facebookUserId: uid, aiMode: 'AI', status: 'ACTIVE', humanSupportRequired: false };
    }
  }

  async getAiMode(facebookUserId) {
    const uid = String(facebookUserId || '').trim();
    if (!uid) return 'AI';

    if (this.isRedisReady()) {
      try {
        const cached = await redisClient.get(modeKey(uid));
        if (cached && ['AI', 'HUMAN', 'PAUSED'].includes(cached)) {
          return cached;
        }
      } catch (_) {}
    }

    if (!this.isMongoReady()) return 'AI';

    try {
      const conv = await this.getOrCreateConversation(uid);
      const mode = conv?.aiMode || 'AI';

      if (this.isRedisReady()) {
        try {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, mode);
        } catch (_) {}
      }
      return mode;
    } catch (err) {
      return 'AI';
    }
  }

  async setAiMode(facebookUserId, mode) {
    const uid = String(facebookUserId || '').trim();
    if (!uid || !['AI', 'HUMAN', 'PAUSED'].includes(mode)) return null;

    try {
      if (this.isRedisReady()) {
        try {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, mode);
        } catch (_) {}
      }

      if (!this.isMongoReady()) return null;

      const { FacebookConversation: Conversation } = getModels();
      const updateData = {
        aiMode: mode,
        modeUpdatedAt: new Date(),
        lastActivityAt: new Date(),
      };

      if (mode === 'AI') {
        updateData.humanSupportRequired = false;
        updateData.ticketStatus = 'RESOLVED';
      } else if (mode === 'HUMAN') {
        updateData.humanSupportRequired = true;
      }

      const conv = await Conversation.findOneAndUpdate(
        { facebookUserId: uid },
        { $set: updateData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`[FacebookCrmService] Conversation mode set to ${mode} for customer ${uid}`);
      return conv;
    } catch (err) {
      console.error(`[FacebookCrmService] setAiMode error for ${uid}:`, err.message);
      return null;
    }
  }

  async resumeAi(facebookUserId) {
    return this.setAiMode(facebookUserId, 'AI');
  }

  async recordHumanTakeover(facebookUserId) {
    return this.setAiMode(facebookUserId, 'HUMAN');
  }

  // ==================== SUPPORT TICKETS ====================

  async acceptSupportRequest(facebookUserId, agentName = 'Support Agent') {
    const uid = String(facebookUserId || '').trim();
    if (!uid) return null;

    try {
      if (this.isRedisReady()) {
        try {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'HUMAN');
        } catch (_) {}
      }

      if (!this.isMongoReady()) return null;

      const { FacebookConversation: Conversation } = getModels();
      const now = new Date();

      const conv = await Conversation.findOneAndUpdate(
        { facebookUserId: uid },
        {
          $set: {
            aiMode: 'HUMAN',
            humanSupportRequired: true,
            ticketStatus: 'IN_PROGRESS',
            assignedAgent: agentName,
            supportAcceptedAt: now,
            modeUpdatedAt: now,
            lastActivityAt: now,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`[FacebookCrmService] Support request accepted by ${agentName} for customer ${uid}`);
      return conv;
    } catch (err) {
      console.error(`[FacebookCrmService] acceptSupportRequest error for ${uid}:`, err.message);
      return null;
    }
  }

  async rejectSupportRequest(facebookUserId, agentName = 'Support Agent', reason = '') {
    const uid = String(facebookUserId || '').trim();
    if (!uid) return null;

    try {
      if (this.isRedisReady()) {
        try {
          await redisClient.setEx(modeKey(uid), MODE_CACHE_TTL, 'AI');
        } catch (_) {}
      }

      if (!this.isMongoReady()) return null;

      const { FacebookConversation: Conversation } = getModels();
      const now = new Date();

      const conv = await Conversation.findOneAndUpdate(
        { facebookUserId: uid },
        {
          $set: {
            aiMode: 'AI',
            humanSupportRequired: false,
            ticketStatus: 'REJECTED',
            assignedAgent: agentName,
            escalationReason: reason || 'Closed by agent',
            supportClosedAt: now,
            modeUpdatedAt: now,
            lastActivityAt: now,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`[FacebookCrmService] Support request rejected/closed by ${agentName} for customer ${uid}`);
      return conv;
    } catch (err) {
      console.error(`[FacebookCrmService] rejectSupportRequest error for ${uid}:`, err.message);
      return null;
    }
  }

  async resolveTicket(facebookUserId, agentName = 'Support Agent') {
    return this.resumeAi(facebookUserId);
  }

  async closeSupportConversation(facebookUserId, agentName = 'Support Agent') {
    return this.rejectSupportRequest(facebookUserId, agentName, 'Support conversation resolved & closed');
  }

  async getSupportTickets() {
    if (!this.isMongoReady()) {
      return { success: true, count: 0, tickets: [] };
    }

    try {
      const { FacebookConversation: Conversation, FacebookCustomer: Customer } = getModels();

      const conversations = await Conversation.find({
        $or: [
          { humanSupportRequired: true },
          { ticketStatus: { $in: ['OPEN', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] } },
        ],
      })
        .sort({ updatedAt: -1 })
        .lean();

      const customerIds = conversations.map((c) => c.facebookUserId).filter(Boolean);
      const customers = await Customer.find({ facebookUserId: { $in: customerIds } }).lean();
      const customerMap = new Map(customers.map((c) => [c.facebookUserId, c]));

      const tickets = conversations.map((conv) => {
        const cust = customerMap.get(conv.facebookUserId) || {};
        return {
          id: conv._id.toString(),
          ticketId: conv.ticketId || `fb_tkt_${conv.facebookUserId.slice(-6)}`,
          customerId: conv.facebookUserId,
          customerName: cust.name || cust.username || `User ${conv.facebookUserId.slice(-4)}`,
          username: cust.username || '',
          profilePictureUrl: cust.profilePictureUrl || '',
          issueCategory: conv.escalationIntent || 'Customer Support',
          escalationReason: conv.escalationReason || 'Customer requested assistance',
          ticketStatus: conv.ticketStatus || (conv.humanSupportRequired ? 'OPEN' : 'RESOLVED'),
          aiMode: conv.aiMode || 'AI',
          assignedAgent: conv.assignedAgent || null,
          humanSupportRequired: !!conv.humanSupportRequired,
          createdAt: conv.supportRequestedAt || conv.createdAt || conv.updatedAt,
          updatedAt: conv.updatedAt,
        };
      });

      return {
        success: true,
        count: tickets.length,
        tickets,
      };
    } catch (err) {
      console.error('[FacebookCrmService] getSupportTickets error:', err.message);
      return { success: false, message: err.message, count: 0, tickets: [] };
    }
  }

  async deleteSupportTicket(ticketId) {
    if (!this.isMongoReady() || !ticketId) return { success: false, message: 'Invalid ticket ID' };

    try {
      const { FacebookConversation: Conversation } = getModels();
      await Conversation.deleteOne({
        $or: [{ _id: mongoose.Types.ObjectId.isValid(ticketId) ? ticketId : null }, { ticketId: ticketId }],
      });
      return { success: true, message: 'Ticket removed successfully' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ==================== LEAD GENERATION ====================

  async getLeads(status = 'ALL', search = '') {
    if (!this.isMongoReady()) {
      return { success: true, count: 0, newCount: 0, leads: [] };
    }

    try {
      const { FacebookLead: Lead, FacebookCustomer: Customer } = getModels();

      const query = {};
      if (status && status !== 'ALL') {
        query.status = status;
      }
      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [{ username: regex }, { serviceRequirement: regex }, { notes: regex }];
      }

      const leads = await Lead.find(query).sort({ capturedAt: -1 }).lean();
      const newCount = await Lead.countDocuments({ status: 'NEW' });

      return {
        success: true,
        count: leads.length,
        newCount,
        leads: leads.map((l) => ({
          id: l._id.toString(),
          leadId: l.leadId,
          customerId: l.facebookUserId,
          username: l.username || '',
          serviceRequirement: l.serviceRequirement || 'General Inquiry',
          source: l.source || 'Facebook Messenger',
          status: l.status || 'NEW',
          notes: l.notes || '',
          assignedAgent: l.assignedAgent || null,
          capturedAt: l.capturedAt,
          createdAt: l.createdAt,
        })),
      };
    } catch (err) {
      console.error('[FacebookCrmService] getLeads error:', err.message);
      return { success: false, message: err.message, count: 0, newCount: 0, leads: [] };
    }
  }

  async createLead(leadData) {
    if (!this.isMongoReady()) return { success: false, message: 'Database unavailable' };

    try {
      const { FacebookLead: Lead } = getModels();
      const leadId = `fb_lead_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

      const newLead = await Lead.create({
        leadId,
        facebookUserId: String(leadData.customerId || leadData.facebookUserId || `manual_${Date.now()}`),
        username: leadData.username || leadData.customerName || 'Prospect',
        serviceRequirement: leadData.serviceRequirement || leadData.requirement || 'General Inquiry',
        source: leadData.source || 'Facebook Direct',
        status: leadData.status || 'NEW',
        notes: leadData.notes || '',
        assignedAgent: leadData.assignedAgent || null,
        capturedAt: new Date(),
      });

      return { success: true, lead: newLead };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateLead(leadId, updateData) {
    if (!this.isMongoReady()) return { success: false, message: 'Database unavailable' };

    try {
      const { FacebookLead: Lead } = getModels();
      const lead = await Lead.findOneAndUpdate(
        { $or: [{ _id: mongoose.Types.ObjectId.isValid(leadId) ? leadId : null }, { leadId }] },
        { $set: updateData },
        { new: true }
      );

      if (!lead) return { success: false, message: 'Lead not found' };
      return { success: true, lead };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async deleteLead(leadId) {
    if (!this.isMongoReady()) return { success: false, message: 'Database unavailable' };

    try {
      const { FacebookLead: Lead } = getModels();
      await Lead.deleteOne({
        $or: [{ _id: mongoose.Types.ObjectId.isValid(leadId) ? leadId : null }, { leadId }],
      });
      return { success: true, message: 'Lead deleted successfully' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ==================== AI SETTINGS ====================

  async getAiSettings() {
    try {
      const { FacebookAiSettings: Settings } = getModels();
      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({});
      }
      return { success: true, settings };
    } catch (err) {
      return {
        success: true,
        settings: {
          globalAiEnabled: true,
          autoTakeoverOnEscalation: true,
          defaultTeam: 'Support Desk',
        },
      };
    }
  }

  async updateAiSettings(newSettings) {
    try {
      const { FacebookAiSettings: Settings } = getModels();
      const updated = await Settings.findOneAndUpdate({}, { $set: newSettings }, { upsert: true, new: true });
      return { success: true, settings: updated };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = new FacebookCrmService();
