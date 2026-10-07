/**
 * instagramAiDecisionService.js
 *
 * Responsibilities:
 *  - Incoming message pipeline (duplicate check → save → upsert → mode check → intent → reply)
 *  - Intent detection (classify customer message category)
 *  - Human-required decision logic
 *  - Conversation context loading from Redis (temporary memory)
 *  - AI response generation via existing crmChatbot (Groq API)
 *  - Response safety validation (blocks unsafe claims, sensitive data)
 *  - Duplicate webhook protection (per-messageId Redis lock, 30s TTL)
 *
 * PRIVACY RULES:
 *  - Does NOT log full customer message content in production
 *  - Does NOT store message content in MongoDB
 *  - Reads and writes only to Redis (4-hour TTL via instagramCareService)
 */

const redisClient = require('../../utilities/redis');

// Processing lock TTL: 30 seconds (prevents duplicate webhook processing)
const PROCESSING_LOCK_TTL = 30;

// Maximum AI attempts before escalating to human
const MAX_AI_ATTEMPTS = 5;

// Redis key for per-message duplicate lock
const processingKey = (messageId) => `ig:ai:processing:${messageId}`;

// ==================== INSTAGRAM COMMENT RESPONSE TEMPLATES & ROTATION POOLS ====================

const POSITIVE_APPRECIATION_REPLIES = [
  "Thank you so much! 😊 We’re glad you liked it! ❤️",
  "Thank you for the kind words! We really appreciate it! 🙌",
  "So glad you liked it! ❤️ Thanks for your support!",
  "Thank you! 😊 Your support means a lot to us!",
  "We’re happy you enjoyed the post! ❤️",
  "Thanks a lot for the love and support! 🙌",
  "That means a lot to us! Thank you! 😊",
  "Thank you so much! We truly appreciate your support! ❤️",
  "Glad you liked it! 😊 Stay connected for more!",
  "Thank you! Your feedback is greatly appreciated! 🙏",
  "So happy to hear that! ❤️ Thanks for supporting us!",
  "Thank you for the amazing response! 🙌",
  "Really appreciate your kind words! 😊",
  "Thanks for the love! ❤️ We’re glad you enjoyed it!",
  "Your support keeps us going! Thank you! 🙌",
  "Thank you! We’re happy you found it interesting! 😊",
  "Much appreciated! ❤️ Thanks for being part of our community!",
  "Thank you for the wonderful feedback! 🙏",
  "Glad you enjoyed it! More exciting content is coming! 😊",
  "Thanks for your support! It truly means a lot to us! ❤️",
  // Extended AI memory & rotation pool
  "Thank you so much! 😊 We truly appreciate you taking the time to share your feedback!",
  "We’re so glad this resonated with you! ❤️ Thanks for your encouragement!",
  "Thank you! 🙏 Your feedback means the world to our team!",
  "Glad you enjoyed this! 😊 Stay tuned for more exciting updates!",
  "Thank you for being such an awesome part of our community! 🙌❤️",
  "Warm thanks from our entire team! 😊 We’re happy you enjoyed it! ❤️",
  "Appreciate you taking the time to share this! 🙌 Stay connected!",
  "Thank you for the encouragement! ❤️ It truly inspires us!",
];

const SHORT_COMMENT_REPLIES = [
  "Thank you so much! 😊",
  "Thank you! ❤️",
  "Glad you liked it! 🙌",
  "Really appreciate it! 😊",
  "Thanks for the love! ❤️",
  "So glad you liked it! 🙌",
  "Thank you for your support! 😊",
  "Much appreciated! ❤️",
  "Thanks a lot! 🙏",
  "Happy you liked it! 😊",
  // Extended AI memory & rotation pool
  "Thank you! 🙌😊",
  "Much love and appreciation! ❤️",
  "Glad you enjoyed it! 😊",
  "Thanks for dropping by! 🙌",
  "Thank you! 🙏✨",
  "Appreciate it! 😊❤️",
  "Thanks a ton! 🙌",
];

const EMOJI_ONLY_REPLIES = [
  "Thank you for the love! ❤️",
  "Appreciate the support! 🙌",
  "Glad you liked it! 🔥",
  "Thank you! ❤️😊",
  "Thanks for the amazing support! 🙌",
  // Extended AI memory & rotation pool
  "Sending lots of love right back! ❤️✨",
  "Appreciate the love and energy! 🔥🙌",
  "Thank you so much! 💯😊",
  "Thank you for the positive vibes! 🙌❤️",
  "Much love and gratitude! ❤️🙏",
  "Thank you for the great energy! 🔥😊",
];

const EXCITED_POSITIVE_REPLIES = [
  "Thank you so much! We’re thrilled that you loved it! ❤️",
  "That’s wonderful to hear! Thank you for the support! 🙌",
  "So happy you enjoyed it! ❤️",
  "Thank you for the amazing feedback! 😊",
  "We truly appreciate the love! 🙏❤️",
  // Extended AI memory & rotation pool
  "Your energy and support made our day! Thank you so much! 🙌❤️",
  "We’re absolutely delighted that you loved this! 😊🔥",
  "Thank you for the overwhelming love and positivity! ❤️🙏",
  "Thrilled to hear this! Thank you for the amazing enthusiasm! 🚀🙌",
  "So wonderful to hear your feedback! Thank you from all of us! 😊❤️",
];

const GREETING_COMMENT_REPLIES = [
  "Hello! 😊 Thanks for connecting with us! Have a wonderful day! 🙌",
  "Hi there! 👋 Hope you're having a great day!",
  "Hello! Welcome to our page! Feel free to explore our latest updates. 😊",
  "Hi! 👋 Thanks for stopping by! We're glad to have you here.",
];

class InstagramAiDecisionService {
  isRedisReady() {
    return redisClient && redisClient.isOpen;
  }

  // ==================== INTENT DETECTION ====================

  /**
   * Detect the intent of a customer message.
   * Returns a classification from the defined intent list.
   * Uses keyword patterns aligned with the CRM Chatbot knowledge base.
   */
  detectIntent(text) {
    if (!text) return 'GENERAL_CONVERSATION';
    const t = text.toLowerCase().trim();

    // Explicit human request — highest priority
    if (
      /\b(human|agent|person|support|help me|talk to|connect me|speak to|live chat|real person|someone from|staff|team member)\b/.test(t) ||
      /\b(not (helpful|satisfied|working|resolved)|didn'?t (work|solve|help)|still (not|having)|i need (someone|a person))\b/.test(t) ||
      /\b(connect|transfer) (me )?(to )?(a )?(human|agent|support|person|team)\b/.test(t)
    ) {
      return 'HUMAN_REQUEST';
    }

    // Escalation signals — dissatisfied customer
    if (
      /\b(complaint|complain|escalate|manager|supervisor|disappointed|frustrated|angry|unacceptable|pathetic|useless)\b/.test(t) ||
      /\b(not satisfied|very upset|this is wrong|totally wrong|bad service|worst service|bad experience)\b/.test(t)
    ) {
      return 'COMPLAINT';
    }

    // Transaction / payment specific issues (require human — cannot verify without backend data)
    if (
      /\b(transaction|payment|payout|refund|settlement|reversal|dispute|debit|credit|transfer|money|amount|rupee|inr|rs\.?)\b/.test(t) &&
      /\b(fail|failed|failing|stuck|pending|not (received|credited|processed|complete)|issue|problem|error|wrong|missing|deducted|lost|help|check|look into|query|concern)\b/.test(t)
    ) {
      return 'TRANSACTION_ISSUE';
    }

    // Account-specific issues
    if (
      /\b(my account|account (issue|problem|blocked|suspended|disabled|not working|access|login|password))\b/.test(t) ||
      /\b(kyc|verification|document|approve|rejected|banned|limit)\b/.test(t)
    ) {
      return 'ACCOUNT_ISSUE';
    }

    // Payment queries (general — can be handled by AI)
    if (
      /\b(payment|pay|gateway|payin|payout|upi|qr|merchant|settle|settlement|api|integration|integrate)\b/.test(t) &&
      !/\b(fail|stuck|pending|not received|missing|issue|problem|error)\b/.test(t)
    ) {
      return 'PAYMENT_QUERY';
    }

    // Technical queries
    if (
      /\b(error|bug|not working|technical|crash|down|server|api (error|issue|not|fail)|404|500|response|endpoint|webhook|sdk)\b/.test(t)
    ) {
      return 'TECHNICAL_QUERY';
    }

    // Product information requests
    if (
      /\b(ertipay|ertitech|product|feature|service|offer|plan|package|what (is|are)|tell me about|explain|describe|how does)\b/.test(t)
    ) {
      return 'PRODUCT_INFORMATION';
    }

    // Pricing queries
    if (/\b(price|pricing|cost|fee|charge|rate|slab|commission|how much)\b/.test(t)) {
      return 'GENERAL_INFORMATION';
    }

    // Greetings and general conversation
    if (/^(hi|hello|hai|hey|hola|good (morning|afternoon|evening)|namaste|test|testing|ok|okay|thanks|thank you|👋|🙏)/.test(t) || t.length < 20) {
      return 'GENERAL_CONVERSATION';
    }

    return 'GENERAL_INFORMATION';
  }

  // ==================== HUMAN-REQUIRED DECISION ====================

  /**
   * Determine if human support is required based on intent, text, and attempt count.
   * Returns { requiresHuman: boolean, reason: string }
   */
  requiresHuman(intent, text, aiAttemptCount = 0) {
    const t = (text || '').toLowerCase();

    // Always escalate for explicit human requests
    if (intent === 'HUMAN_REQUEST') {
      return { requiresHuman: true, reason: 'Customer explicitly requested human support' };
    }

    // Always escalate for complaints
    if (intent === 'COMPLAINT') {
      return { requiresHuman: true, reason: 'Customer complaint requires human attention' };
    }

    // Always escalate for escalation intent
    if (intent === 'ESCALATION') {
      return { requiresHuman: true, reason: 'Issue requires escalation to human agent' };
    }

    // Escalate account issues (sensitive, requires identity verification)
    if (intent === 'ACCOUNT_ISSUE') {
      return { requiresHuman: true, reason: 'Account issue requires identity verification by a human agent' };
    }

    // Escalate technical queries that mention specific errors
    if (
      intent === 'TECHNICAL_QUERY' &&
      /\b(error code|500|503|timeout|server down|not (responding|available))\b/.test(t)
    ) {
      return { requiresHuman: true, reason: 'Specific technical error requires human investigation' };
    }

    // Repeated AI failures — escalate after limit
    if (aiAttemptCount >= MAX_AI_ATTEMPTS) {
      return { requiresHuman: true, reason: `AI was unable to resolve the conversation after ${aiAttemptCount} attempts` };
    }

    // Repeated dissatisfaction signals in message text
    if (
      /\b(not (helpful|useful|working|solving|resolved)|still (having|facing|the same)|that didn'?t (help|work|solve)|try again|another solution|try something else)\b/.test(t)
    ) {
      return { requiresHuman: true, reason: 'Customer indicated AI response was not helpful' };
    }

    return { requiresHuman: false, reason: null };
  }

  // ==================== RESPONSE VALIDATION ====================

  /**
   * Validate an AI-generated response before sending.
   * Blocks responses containing:
   *  - Unverified transaction/account/payment status claims
   *  - Requests for sensitive credentials (OTP, PIN, CVV, password, API keys)
   * Returns { safe: boolean, reason: string | null }
   */
  validateResponse(replyText) {
    if (!replyText) return { safe: false, reason: 'Empty response' };

    const text = replyText.toLowerCase();

    // Block unverified status claims
    const unsafeClaims = [
      { pattern: /your (transaction|payment|transfer|payout) (is |has been )?(successful|completed|processed|credited|done)/i, label: 'unverified transaction success claim' },
      { pattern: /your (refund|amount|money) (has been |is )?(processed|credited|returned|reversed)/i, label: 'unverified refund claim' },
      { pattern: /your (settlement|balance|account) (has been |is )?(approved|credited|settled|updated)/i, label: 'unverified settlement claim' },
      { pattern: /your (kyc|verification|account) (has been |is )?(approved|verified|complete)/i, label: 'unverified account approval claim' },
    ];

    for (const { pattern, label } of unsafeClaims) {
      if (pattern.test(replyText)) {
        return { safe: false, reason: `Blocked: contains ${label}` };
      }
    }

    // Block requests or disclosures of sensitive data
    const sensitivePatterns = [
      { pattern: /\b(share|send|enter|provide|tell|give) (your |me )?(otp|one.?time.?password|pin|cvv|cvc|password|api (key|secret)|access token|private key|bank (details|credentials|account number))\b/i, label: 'sensitive data request' },
      { pattern: /\b(otp|one.?time.?password)\b.*\b(verify|confirm|authenticate)\b/i, label: 'OTP verification request' },
    ];

    for (const { pattern, label } of sensitivePatterns) {
      if (pattern.test(replyText)) {
        return { safe: false, reason: `Blocked: contains ${label}` };
      }
    }

    return { safe: true, reason: null };
  }

  // ==================== REDIS CONTEXT ====================

  /**
   * Load recent conversation context from Redis for AI history.
   * Returns formatted message history array for the AI model.
   * Messages expire after 4 hours (TTL managed by instagramCareService).
   */
  async buildConversationContext(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid || !this.isRedisReady()) return [];

    try {
      const chatKey = `ig:chat:${uid}`;
      const raw = await redisClient.get(chatKey);
      if (!raw) return [];

      const messages = JSON.parse(raw);
      if (!Array.isArray(messages) || messages.length === 0) return [];

      // Format for AI model: last 6 messages (3 exchanges) for context window
      const recent = messages.slice(-6);
      const history = [];

      for (const msg of recent) {
        if (!msg.text || !msg.direction) continue;
        if (msg.direction === 'INCOMING') {
          history.push({ role: 'user', content: msg.text });
        } else if (msg.direction === 'OUTGOING') {
          history.push({ role: 'assistant', content: msg.text });
        }
      }

      return history;
    } catch (err) {
      console.error(`[InstagramAiDecisionService] buildConversationContext error for ${uid}:`, err.message);
      return [];
    }
  }

  // ==================== DUPLICATE PROTECTION ====================

  /**
   * Acquire a per-message processing lock.
   * Returns true if lock acquired (first time processing this messageId).
   * Returns false if messageId already being/been processed (duplicate).
   */
  async acquireProcessingLock(messageId) {
    if (!messageId || !this.isRedisReady()) return true; // Allow if no Redis

    try {
      const key = processingKey(messageId);
      // SET NX EX — set only if not exists, with 30s expiry
      const result = await redisClient.set(key, '1', { NX: true, EX: PROCESSING_LOCK_TTL });
      return result === 'OK';
    } catch (err) {
      console.warn('[InstagramAiDecisionService] acquireProcessingLock error:', err.message);
      return true; // Allow processing on Redis error to avoid dropping messages
    }
  }

  // ==================== MAIN PIPELINE ====================

  /**
   * Process an incoming Instagram message through the full AI pipeline.
   *
   * Flow:
   *  1. Duplicate check (Redis lock per messageId)
   *  2. Save message to Redis (via instagramCareService — existing function)
   *  3. Upsert customer basic info (via instagramCrmService)
   *  4. Load conversation state
   *  5. Check AI mode — if HUMAN/PAUSED → stop
   *  6. Load Redis conversation context
   *  7. Detect intent
   *  8. Check if human required
   *  9. If human required → initiate handoff → return
   *  10. Generate AI reply (via existing crmChatbot.generateReply)
   *  11. Validate response
   *  12. If autoReplyEnabled → send via instagramCareService.sendMessage()
   *       else store suggestion in Redis only
   */
  async processIncomingMessage({ senderId, messageId, text, payload = null, businessAccountId }) {
    const uid = String(senderId || '').trim();
    const mid = String(messageId || '').trim();
    const incomingText = (text || '').trim();
    const buttonPayload = (payload || '').trim();

    if (!uid || (!incomingText && !buttonPayload)) return { skipped: true, reason: 'Empty sender or text' };

    // 1. Duplicate webhook protection — per message ID lock
    if (mid) {
      const lockAcquired = await this.acquireProcessingLock(mid);
      if (!lockAcquired) {
        return { skipped: true, reason: 'Duplicate messageId — already processing' };
      }
    }

    // Lazy-load services to avoid circular dependencies
    const instagramCrmService = require('./instagramCrmService');
    const instagramCareService = require('./instagramCareService');
    const crmChatbot = require('../crmChatbot');

    try {
      // 2. Check AI Mode — If conversation is in HUMAN or PAUSED mode, AI replies MUST STOP
      const aiMode = await instagramCrmService.getAiMode(uid);
      if (aiMode === 'HUMAN' || aiMode === 'PAUSED') {
        return { skipped: true, reason: `Conversation is in ${aiMode} mode (Human takeover active)` };
      }

      // 3. Load AI settings
      const settings = await instagramCrmService.getAiSettings();
      if (!settings.dmAiEnabled) {
        return { skipped: true, reason: 'dmAiEnabled = false' };
      }

      // 4. Fetch customer profile and upsert customer
      let customerProfile = null;
      try {
        customerProfile = await instagramCareService.fetchCustomerProfile(uid);
      } catch (_) {}
      instagramCrmService.upsertCustomer(uid, customerProfile || {}).catch(() => {});

      // ─── ACTION 0: CONTACT SUPPORT TEAM / HUMAN SUPPORT HANDOFF ───
      const normText = incomingText.toLowerCase();

      const isContactSupport =
        buttonPayload === 'ACTION_CONTACT_SUPPORT' ||
        buttonPayload === 'ACTION_CUSTOMER_SUPPORT' ||
        buttonPayload === 'PAYLOAD_CUSTOM_SUPPORT' ||
        /^(contact support team|contact support|custom support|customer support|support ticket|create ticket|raise ticket|ticket|talk to support|human support|talk to human|speak to human|agent|human|need support|help me)\b/i.test(incomingText) ||
        normText.includes('contact support') ||
        normText.includes('support team') ||
        normText.includes('human support') ||
        normText.includes('talk to team') ||
        normText.includes('talk to support');

      if (isContactSupport) {
        const cleanCustomerName = customerProfile?.name || (customerProfile?.username ? `@${String(customerProfile.username).replace(/^@+/, '')}` : null);
        const { ticketId } = await instagramCrmService.initiateHumanHandoff(
          uid,
          'Customer requested Support Team assistance via Suggested Options',
          'HUMAN_REQUEST',
          cleanCustomerName,
          'Customer Support Request'
        );

        const confirmationMsg =
          `🎫 Your support request has been received (Ticket #${ticketId})!\n\n` +
          `Our Support Team has been notified and will accept your conversation shortly. Please feel free to share any details about your query.\n\n` +
          `📬 For immediate assistance, you can also reach us:\n` +
          `• 📞 WhatsApp: +91 8122686806\n` +
          `• 📧 Email: hello@ertitech.com`;

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: confirmationMsg,
              isHumanReply: false,
            });
          } catch (sendErr) {
            console.error(`❌ [FAILED TO SEND HUMAN HANDOFF CONFIRMATION] User: ${uid}:`, sendErr.message);
          }
        }

        return { skipped: false, requiresHuman: true, intent: 'HUMAN_REQUEST', ticketId };
      }

      // ─── ACTION 1: TAP TO SEND SUGGESTED QUESTIONS (ICE BREAKERS) ───
      const isIceBreaker1 =
        buttonPayload === 'ICEBREAKER_SERVICES' ||
        /^(what services and software does ertitech provide|what services does ertitech provide|what software does ertitech provide|what are ertitech services|ertitech software and services|tell me about your services|what services do you offer)/i.test(incomingText) ||
        (normText.includes('services') && normText.includes('ertitech') && normText.includes('provide'));

      const isIceBreaker2 =
        buttonPayload === 'ICEBREAKER_ERTIPAY' ||
        /^(how does ertipay qr & fintech solutions work|how does ertipay work|how does ertipay qr work|what is ertipay|ertipay fintech|tell me about ertipay|ertipay qr solutions)/i.test(incomingText) ||
        (normText.includes('ertipay') && (normText.includes('how') || normText.includes('work') || normText.includes('qr') || normText.includes('fintech')));

      const isIceBreaker3 =
        buttonPayload === 'ICEBREAKER_DEMO_QUOTE' ||
        /^(how can i request a quote or book a demo|how can i request a quote|book a demo|request a quote|get a quote|book project demo|schedule a demo|request project quote)/i.test(incomingText) ||
        ((normText.includes('request') || normText.includes('book') || normText.includes('get')) && (normText.includes('quote') || normText.includes('demo')));

      const isIceBreaker4 =
        buttonPayload === 'ICEBREAKER_LOCATION_HOURS' ||
        /^(where is ertitech located and what are your support hours|where is ertitech located|what are your support hours|office location|support hours|where are you located|contact hours)/i.test(incomingText) ||
        ((normText.includes('where') || normText.includes('location')) && normText.includes('ertitech')) ||
        (normText.includes('support hours') || normText.includes('working hours') || normText.includes('office hours'));

      if (isIceBreaker1 || isIceBreaker2 || isIceBreaker3 || isIceBreaker4) {
        let replyText = '';
        let quickReplies = [];

        if (isIceBreaker1) {
          replyText =
            `👋 Welcome to *Ertitech Solutions Pvt Ltd*!\n\n` +
            `We are a premier Fintech & Digital Software Engineering company providing:\n\n` +
            `1️⃣ 💳 *Ertipay & Fintech Ecosystem*:\n` +
            `   • Static & Dynamic UPI QR Soundbox Systems\n` +
            `   • PayIn Payment Gateway & Bulk Payout APIs\n` +
            `   • BBPS Bill Payments & Multi-operator Recharge APIs\n\n` +
            `2️⃣ 💻 *Custom Software & Web Engineering*:\n` +
            `   • Enterprise ERP & CRM Portals\n` +
            `   • High-performance Web & Mobile Applications (iOS & Android)\n\n` +
            `3️⃣ 👥 *Enterprise HRMS & Payroll Platforms*:\n` +
            `   • Real-time Attendance, Staff Tracking, Automated Payroll & Payslips\n\n` +
            `4️⃣ ☁️ *Cloud, AI & Automation*:\n` +
            `   • 24/7 AI-powered Customer Care, Webhook automation & Cloud scaling\n\n` +
            `5️⃣ 🛠️ *Dedicated Technical Support & SLA Maintenance*`;

          quickReplies = [
            { content_type: 'text', title: '💳 ErtiPay Details', payload: 'ICEBREAKER_ERTIPAY' },
            { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
            { content_type: 'text', title: '🚀 Request Quote', payload: 'ICEBREAKER_DEMO_QUOTE' },
            { content_type: 'text', title: '📍 Office Location', payload: 'ICEBREAKER_LOCATION_HOURS' },
          ];
        } else if (isIceBreaker2) {
          replyText =
            `💳 *ErtiPay QR & Fintech Solutions Overview*:\n\n` +
            `ErtiPay is Ertitech's flagship all-in-one digital payment platform designed for merchants, businesses, and enterprises:\n\n` +
            `• 📲 *Unified UPI QR Collections*: Instant payment acceptance via PhonePe, GPay, Paytm, and all UPI apps with audio soundbox confirmation.\n` +
            `• ⚡ *High-Speed PayIn Gateway*: 99.9% uptime payment gateway for websites and mobile applications.\n` +
            `• 💸 *Instant Bulk Payouts*: Automated vendor disbursements, salary payouts, and instant refunds via IMPS/NEFT/UPI.\n` +
            `• 📱 *BBPS & Utilities*: Integrated bill payments (Electricity, Water, Gas, Fastag) and DTH/Mobile recharges.\n` +
            `• 🛡️ *Bank-Grade Security*: PCI-DSS compliant with real-time fraud monitoring and instant settlement reporting.`;

          quickReplies = [
            { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
            { content_type: 'text', title: '📋 Other Services', payload: 'ICEBREAKER_SERVICES' },
            { content_type: 'text', title: '🚀 Request Demo', payload: 'ICEBREAKER_DEMO_QUOTE' },
          ];
        } else if (isIceBreaker3) {
          replyText =
            `🚀 *Request a Project Quote or Schedule a Live Demo*:\n\n` +
            `We would love to collaborate and bring your ideas to life! Here is how you can connect with our solutions team:\n\n` +
            `• 📧 *Email Us*: hello@ertitech.com\n` +
            `• 💬 *WhatsApp / Direct Call*: +91 8122686806\n` +
            `• 🌐 *Official Website*: https://ertitech.com\n\n` +
            `💬 *Instant On-Chat Inquiry*: Simply reply here in Instagram DMs with your requirement (e.g. *Website, Mobile App, or ErtiPay QR*), and our engineering team will share a customized project estimation!`;

          quickReplies = [
            { content_type: 'text', title: '📝 Custom Software', payload: 'ACTION_LEAD_FORM_CUSTOM' },
            { content_type: 'text', title: '💳 ErtiPay QR Demo', payload: 'ACTION_LEAD_FORM_ERTIPAY' },
            { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
          ];
        } else if (isIceBreaker4) {
          replyText =
            `📍 *Ertitech Office Location & Support Hours*:\n\n` +
            `• 🏢 *Headquarters*: Ertitech Solutions Pvt Ltd, Salem, Tamil Nadu, India.\n` +
            `• ⏰ *Working Hours*: Monday to Saturday | 9:30 AM – 6:30 PM (IST)\n` +
            `• 🤖 *AI & Online Support*: 24/7 Active on Instagram DMs & Web Portal\n\n` +
            `📬 *Direct Contact Channels*:\n` +
            `• 📧 Email: hello@ertitech.com\n` +
            `• 📞 Phone / WhatsApp: +91 8122686806\n` +
            `• 🌐 Website: https://ertitech.com`;

          quickReplies = [
            { content_type: 'text', title: '📋 View Services', payload: 'ICEBREAKER_SERVICES' },
            { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
            { content_type: 'text', title: '🚀 Request Quote', payload: 'ICEBREAKER_DEMO_QUOTE' },
          ];
        }

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: replyText,
              quickReplies: quickReplies,
              isHumanReply: false,
            });
          } catch (sendErr) {
            console.error(`❌ [FAILED TO SEND ICE BREAKER REPLY] User: ${uid}:`, sendErr.message);
          }
        }

        return { skipped: false, requiresHuman: false, intent: 'PRODUCT_INFORMATION', reply: replyText };
      }

      // ─── ACTION 2: INQUIRY / LEAD INFORMATION SUBMITTED ───
      const extractedPhone = this._extractPhoneNumber(incomingText);
      const extractedEmail = this._extractEmail(incomingText);
      const extractedReq = this._extractRequirement(incomingText);

      if (extractedPhone || extractedEmail || extractedReq) {

        let detectedService = 'General Inquiry';
        const lower = incomingText.toLowerCase();
        if (lower.includes('ertipay') || lower.includes('1.') || lower.includes('recharge') || lower.includes('bbps')) detectedService = 'ErtiPay - Payment Gateway & Recharge APIs';
        else if (lower.includes('payin') || lower.includes('2.') || lower.includes('gateway')) detectedService = 'PayIn Payment Gateway';
        else if (lower.includes('payout') || lower.includes('3.') || lower.includes('disburse')) detectedService = 'Payout & Bulk Disbursement APIs';
        else if (lower.includes('qr') || lower.includes('upi')) detectedService = 'UPI Static & Dynamic QR Collections';
        else if (lower.includes('fintech') || lower.includes('software') || lower.includes('app') || lower.includes('web') || lower.includes('4.')) detectedService = 'Custom Fintech & Software Development';
        else if (lower.includes('priority') || lower.includes('5.')) detectedService = '24/7 Priority Support & Integration';
        else {
          // Check previous conversation context for which service was discussed
          try {
            const recentMsgs = await instagramCareService.getCustomerMessages(uid);
            const historyText = Array.isArray(recentMsgs) ? recentMsgs.map((m) => m.text || '').join(' ').toLowerCase() : '';
            if (historyText.includes('ertipay')) detectedService = 'ErtiPay - Payment Gateway & Recharge APIs';
            else if (historyText.includes('payin')) detectedService = 'PayIn Payment Gateway';
            else if (historyText.includes('payout')) detectedService = 'Payout & Bulk Disbursement APIs';
            else if (historyText.includes('recharge') || historyText.includes('bbps')) detectedService = 'Recharge & Utility APIs (BBPS)';
            else if (historyText.includes('fintech') || historyText.includes('software')) detectedService = 'Custom Fintech & Web Software';
          } catch (_) {}
        }

        const notesToSave = extractedReq || incomingText;

        // Create Lead without storing user PII (name, phone, email)
        const leadDoc = await instagramCrmService.createOrUpdateLead({
          instagramUserId: uid,
          username: customerProfile?.username || null,
          serviceRequirement: detectedService,
          notes: notesToSave,
          status: 'NEW',
        });

        const leadAckMsg =
          `Thank you for reaching out to Ertitech Solutions!\n\n` +
          `Your inquiry for *${detectedService}* has been received.\n\n` +
          `📬 For immediate assistance, please contact us directly:\n` +
          `• 📧 Email: hello@ertitech.com\n` +
          `• 💬 WhatsApp: +91 8122686806\n` +
          `• 🌐 Website: https://ertitech.com\n\n` +
          `Our team will also assist you right here in your Instagram DMs!`;

        const supportButtons = [
          { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
          { content_type: 'text', title: '📋 All Services', payload: 'ACTION_MAIN_MENU' },
        ];

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: leadAckMsg,
              quickReplies: supportButtons,
              isHumanReply: false,
            });
          } catch (sendErr) {
            console.error(`❌ [FAILED TO SEND LEAD ACKNOWLEDGMENT] User: ${uid}:`, sendErr.message);
          }
        }

        return { skipped: false, requiresHuman: false, intent: 'PRODUCT_INFORMATION', reply: leadAckMsg };
      }

      // ─── ACTION 3: DIRECT SERVICE LEAD GENERATION (User clicked to request quote / generate lead) ───
      const isLeadFormRequest =
        buttonPayload.startsWith('ACTION_LEAD_FORM') ||
        buttonPayload.startsWith('ACTION_CREATE_LEAD') ||
        /^(request quote|request quotation|get quote|get started|generate lead|lead form|proceed|apply now|register)\b/i.test(incomingText);

      if (isLeadFormRequest) {
        let serviceName = 'ErtiPay (Mobile Recharge & BBPS)';
        const bp = (buttonPayload || '').toUpperCase();
        const lower = incomingText.toLowerCase();

        if (bp.includes('ERTIPAY') || lower.includes('ertipay') || lower.includes('recharge') || lower.includes('1')) {
          serviceName = 'ErtiPay (Mobile Recharge & BBPS)';
        } else if (bp.includes('PAYIN') || lower.includes('payin') || lower.includes('gateway') || lower.includes('2')) {
          serviceName = 'PayIn Payment Gateway';
        } else if (bp.includes('PAYOUT') || lower.includes('payout') || lower.includes('disburse') || lower.includes('3')) {
          serviceName = 'Payout & Bulk Disbursement APIs';
        } else if (bp.includes('QR') || lower.includes('qr') || lower.includes('upi') || lower.includes('4')) {
          serviceName = 'UPI Static & Dynamic QR Collections';
        } else if (bp.includes('FINTECH') || lower.includes('fintech') || lower.includes('software') || lower.includes('5')) {
          serviceName = 'Custom Fintech & Software Development';
        } else {
          // Check previous conversation context for which service was discussed
          try {
            const recentMsgs = await instagramCareService.getCustomerMessages(uid);
            const historyText = Array.isArray(recentMsgs) ? recentMsgs.map((m) => m.text || '').join(' ').toLowerCase() : '';
            if (historyText.includes('ertipay')) serviceName = 'ErtiPay (Mobile Recharge & BBPS)';
            else if (historyText.includes('payin')) serviceName = 'PayIn Payment Gateway';
            else if (historyText.includes('payout')) serviceName = 'Payout & Bulk Disbursement APIs';
            else if (historyText.includes('qr')) serviceName = 'UPI Static & Dynamic QR Collections';
            else if (historyText.includes('fintech') || historyText.includes('software')) serviceName = 'Custom Fintech & Software Development';
          } catch (_) {}
        }

        // Store Lead in Database with only Service and Inquiry (NO user name, mobile, email)
        const leadDoc = await instagramCrmService.createOrUpdateLead({
          instagramUserId: uid,
          username: customerProfile?.username || null,
          serviceRequirement: serviceName,
          notes: `User requested quotation and onboarding details for ${serviceName}`,
          status: 'NEW',
        });

        const leadAckMsg =
          `Thank you for choosing Ertitech Solutions!\n\n` +
          `Your inquiry for *${serviceName}* has been registered successfully.\n\n` +
          `📬 For immediate assistance, feel free to contact us:\n` +
          `• 📧 Email: hello@ertitech.com\n` +
          `• 💬 WhatsApp: +91 8122686806\n` +
          `• 🌐 Website: https://ertitech.com\n\n` +
          `Our support team will also connect with you right here in Instagram DMs!`;

        const supportButtons = [
          { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
          { content_type: 'text', title: '📋 All Services', payload: 'ACTION_MAIN_MENU' },
        ];

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: leadAckMsg,
              quickReplies: supportButtons,
              isHumanReply: false,
            });
          } catch (sendErr) {
            console.error(`❌ [FAILED TO SEND LEAD CONFIRMATION] User: ${uid}:`, sendErr.message);
          }
        }

        return { skipped: false, requiresHuman: false, intent: 'PRODUCT_INFORMATION', reply: leadAckMsg };
      }

      // ─── ACTION 4: ALL SERVICES LIST REQUESTED (Numbered list: 1 to 5) ───
      // Triggered when user asks "What are the services in Ertitech?" or clicks All Services
      const isServicesListRequest =
        buttonPayload === 'ACTION_MAIN_MENU' ||
        /^(what are the services|what services|services in ertitech|service in ertitech|ertitech services|services list|list of services|all services|services|menu|options|products|what do you do|what do you offer|what are your services)\b/i.test(incomingText) ||
        (incomingText.toLowerCase().includes('service') &&
          !incomingText.toLowerCase().includes('ertipay') &&
          !incomingText.toLowerCase().includes('payin') &&
          !incomingText.toLowerCase().includes('payout') &&
          !incomingText.toLowerCase().includes('qr') &&
          !incomingText.toLowerCase().includes('fintech') &&
          !incomingText.toLowerCase().includes('software'));

      if (isServicesListRequest) {
        const servicesListText = crmChatbot.getServicesListText();
        const serviceButtons = crmChatbot.getServiceQuickReplies();

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: servicesListText,
              quickReplies: serviceButtons,
              isHumanReply: false,
            });
          } catch (sendErr) {
            console.error(`❌ [FAILED TO SEND SERVICES LIST] User: ${uid}:`, sendErr.message);
          }
        }

        return { skipped: false, requiresHuman: false, intent: 'GENERAL_CONVERSATION', reply: servicesListText };
      }

      // ─── ACTION 5: SPECIFIC SERVICE SELECTED (Show Service Details & Option to proceed to lead form) ───
      const isSpecificServiceSelected =
        buttonPayload.startsWith('SERVICE_') ||
        /^(1|2|3|4|5)$/i.test(incomingText.trim()) ||
        /\b(ertipay|recharge|payin|payment gateway|payout|disbursement|upi qr|qr code|custom fintech|fintech dev|software dev)\b/i.test(incomingText);

      if (isSpecificServiceSelected) {
        const serviceKey = buttonPayload || incomingText.trim();
        const serviceDetailsObj = crmChatbot.getServiceDetails(serviceKey);

        if (serviceDetailsObj) {

          const serviceDetailsButtons = [
            { content_type: 'text', title: '📝 Get Started / Quote', payload: serviceDetailsObj.payloadKey },
            { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
            { content_type: 'text', title: '📋 All Services', payload: 'ACTION_MAIN_MENU' },
          ];

          if (settings.autoReplyEnabled) {
            try {
              await instagramCareService.sendMessage({
                recipientId: uid,
                text: serviceDetailsObj.text,
                quickReplies: serviceDetailsButtons,
                isHumanReply: false,
              });
            } catch (sendErr) {
              console.error(`❌ [FAILED TO SEND SERVICE DETAILS] User: ${uid}:`, sendErr.message);
            }
          }

          return { skipped: false, requiresHuman: false, intent: 'PRODUCT_INFORMATION', reply: serviceDetailsObj.text };
        }
      }

      // ─── ACTION 6: GREETINGS ───
      const isGreeting = /^(hi|hello|hai|hey|hola|greetings|good\s*(morning|afternoon|evening)|test|testing)/i.test(incomingText) || incomingText.length < 10;
      if (isGreeting) {
        const greetingText = crmChatbot.getServicesListText();
        const serviceButtons = crmChatbot.getServiceQuickReplies();

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: greetingText,
              quickReplies: serviceButtons,
              isHumanReply: false,
            });
          } catch (_) {}
        }

        return { skipped: false, requiresHuman: false, intent: 'GENERAL_CONVERSATION', reply: greetingText };
      }

      // ─── ACTION 5: GENERAL AI CONVERSATION PIPELINE ───
      const conversationHistory = await this.buildConversationContext(uid);
      const intent = this.detectIntent(incomingText);

      const attemptCount = await this._getAttemptCount(uid);
      const { requiresHuman, reason } = this.requiresHuman(intent, incomingText, attemptCount);

      if (requiresHuman) {
        const { ticketId } = await instagramCrmService.initiateHumanHandoff(
          uid,
          reason,
          intent,
          customerProfile?.name || customerProfile?.username || null
        );

        const escalationNotice =
          `🎫 Your Support request has been created.\n\n` +
          `Our support team will contact you within 24 hours.`;

        if (settings.autoReplyEnabled) {
          try {
            await instagramCareService.sendMessage({
              recipientId: uid,
              text: escalationNotice,
              isHumanReply: false,
            });
          } catch (_) {}
        }

        return { skipped: false, requiresHuman: true, intent, reason, ticketId };
      }

      // 5. Generate AI reply
      let aiReply = null;
      try {
        aiReply = await crmChatbot.generateReply(incomingText, conversationHistory);
      } catch (genErr) {
        console.error(`❌ [AI GENERATION ERROR] For User: ${uid}:`, genErr.message);
        await instagramCrmService.initiateHumanHandoff(uid, 'AI provider error — could not generate response', intent);
        return { skipped: false, requiresHuman: true, intent, reason: 'AI generation error' };
      }

      if (!aiReply) {
        await instagramCrmService.initiateHumanHandoff(uid, 'AI returned empty response', intent);
        return { skipped: false, requiresHuman: true, intent, reason: 'Empty AI response' };
      }

      // Append support question if not already present
      let finalReply = typeof aiReply === 'string' ? aiReply : (aiReply?.text || aiReply?.reply || String(aiReply || ''));
      const lowerReply = finalReply.toLowerCase();
      if (!lowerReply.includes('support team') && !lowerReply.includes('contact support')) {
        finalReply = `${finalReply}\n\nWould you like to contact our support team?`;
      }

      // 6. Safety validation
      const { safe, reason: unsafeReason } = this.validateResponse(finalReply);
      if (!safe) {
        console.warn(`🛡️ [UNSAFE AI RESPONSE BLOCKED] User: ${uid} | Reason: ${unsafeReason}`);
        await instagramCrmService.incrementAiAttemptCount(uid);
        const newCount = attemptCount + 1;
        if (newCount >= MAX_AI_ATTEMPTS) {
          await instagramCrmService.initiateHumanHandoff(uid, 'Repeated unsafe AI responses — escalating to human', intent);
          return { skipped: false, requiresHuman: true, intent, reason: unsafeReason };
        }
        return { skipped: false, safe: false, reason: unsafeReason };
      }

      await instagramCrmService.resetAiAttemptCount(uid);

      // 7. Send AI response with Contact Support button
      if (settings.autoReplyEnabled) {
        try {
          const sendRes = await instagramCareService.sendMessage({
            recipientId: uid,
            text: finalReply,
            quickReplies: [
              { content_type: 'text', title: '🎧 Contact Support', payload: 'ACTION_CONTACT_SUPPORT' },
              { content_type: 'text', title: '📋 All Services', payload: 'ACTION_MAIN_MENU' },
            ],
            isHumanReply: false,
          });
          console.log(`✅ [InstagramDM] AI reply delivered to user: ${uid}`);
        } catch (sendErr) {
          console.error(`❌ [InstagramDM] Failed to deliver AI reply to ${uid}:`, sendErr.message);
        }
      } else {
        try {
          await instagramCareService.saveOutgoingMessage({
            businessAccountId: String(businessAccountId || ''),
            recipientId: uid,
            messageId: `ai_suggest_${Date.now()}`,
            text: `[AI Suggestion — Not Sent] ${finalReply}`,
            timestamp: Date.now(),
            isHumanReply: false,
          });
        } catch (saveErr) {
          console.warn(`[InstagramAiDecisionService] Could not save AI suggestion to Redis for ${uid}:`, saveErr.message);
        }
      }

      return {
        skipped: false,
        requiresHuman: false,
        intent,
        confidence: 0.9,
        reply: finalReply,
        autoSent: settings.autoReplyEnabled,
      };
    } catch (err) {
      console.error(`[InstagramAiDecisionService] Pipeline error for ${uid}:`, err.message);
      return { skipped: false, error: err.message };
    }
  }

  // ==================== INTERNAL HELPERS ====================

  _extractPhoneNumber(text) {
    if (!text) return null;
    const match = text.match(/(?:\+91|91)?[-.\s]?([6-9]\d{9})\b/);
    return match ? match[1] : null;
  }

  _extractEmail(text) {
    if (!text) return null;
    const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    return match ? match[0] : null;
  }

  _extractName(text) {
    if (!text) return null;
    const nameMatch = text.match(/(?:my name is|name\s*[:=-]\s*|i am)\s*([A-Za-z\s]{2,30})/i);
    if (nameMatch) {
      const firstPart = nameMatch[1].split(/[\n,;•]/)[0].trim();
      if (firstPart.length >= 2) return firstPart;
    }
    return null;
  }

  _extractRequirement(text) {
    if (!text) return null;
    const match = text.match(/(?:requirement|required|need|looking for|notes|details|purpose|service)\s*[:=-]\s*([^\n\r]+)/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return null;
  }

  async _getAttemptCount(instagramUserId) {
    const uid = String(instagramUserId || '').trim();
    if (!uid) return 0;

    try {
      const mongoose = require('mongoose');
      if (mongoose.connection?.readyState !== 1) return 0;

      const InstagramConversation = require('../../Models/Social Media/care/InstagramConversation');
      const conv = await InstagramConversation.findOne({ instagramUserId: uid }).select('aiAttemptCount');
      return conv?.aiAttemptCount || 0;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Helper to rotate and pick a random reply from a category pool
   */
  _getRandomRotatedReply(repliesArray, userTag = '') {
    if (!Array.isArray(repliesArray) || repliesArray.length === 0) return '';
    const randomIndex = Math.floor(Math.random() * repliesArray.length);
    const chosen = repliesArray[randomIndex];
    return userTag ? `${userTag} ${chosen}`.trim() : chosen.trim();
  }

  /**
   * ==================== INSTAGRAM COMMENT AI ENGINE ====================
   * Process incoming Instagram Comments on Posts, Reels, or Videos.
   * Generates a contextual public threaded reply and optional direct message (DM).
   * Note: Discounts and promotional offers are excluded as requested.
   */
  async processIncomingComment({
    commentId,
    mediaId = '',
    text = '',
    senderId = '',
    username = '',
    businessAccountId = '',
  }) {
    if (!commentId) return { skipped: true, reason: 'No commentId provided' };

    const cId = String(commentId).trim();
    const rawText = String(text || '').trim();
    const uname = String(username || '').replace(/^@/, '').trim();
    const userTag = uname ? `@${uname}` : '';

    // 1. Deduplication check via Redis (24-hour lock)
    const lockKey = `ig:ai:comment:replied:${cId}`;
    if (this.isRedisReady()) {
      try {
        const isLocked = await redisClient.get(lockKey);
        if (isLocked) {
          return { skipped: true, reason: 'ALREADY_REPLIED' };
        }
      } catch (err) {
        console.warn(`[InstagramCommentAI] Redis check notice for comment ${cId}:`, err.message);
      }
    }

    const instagramCareService = require('./instagramCareService');
    const instagramCrmService = require('./instagramCrmService');

    // 2. Ignore if comment is from the connected business account itself
    if (senderId && (await instagramCareService.isBusinessAccountId(senderId))) {
      return { skipped: true, reason: 'BUSINESS_ACCOUNT_SELF_COMMENT' };
    }

    try {
      const settings = await instagramCrmService.getAiSettings();
      if (settings && settings.autoReplyEnabled === false) {
        return { skipped: true, reason: 'AUTO_REPLY_DISABLED' };
      }
    } catch (_) {}

    const normText = rawText.toLowerCase().trim();

    // 3. Rule-based classification for high-precision brand responses

    // Rule 10: Complaints, problems, requests, or questions should NOT be treated as simple positive comments
    const isComplaintOrIssue =
      /\b(complaint|complain|escalate|dissatisfied|frustrated|angry|bad service|worst service|scam|fraud|cheat|refund|money deducted|payment failed|fail|stuck|not working|error|bug|issue|problem|help me|support)\b/i.test(normText);

    // Type 1: Explicit Pricing / Quotation Inquiries (ONLY when user explicitly asks for cost/price)
    const isPricingInquiry =
      !isComplaintOrIssue &&
      /\b(price|pricing|cost|how much|charges|quotation|rate card|fees|costing)\b/i.test(normText);

    // Type 2: Business & Brand Partnerships / Collaboration
    const isPartnership =
      !isComplaintOrIssue &&
      (/\b(partner|partnership|collaborate|collaboration|work together|agency|sponsor|tie up|business proposal)\b/i.test(normText) ||
        (normText.includes('brand') && (normText.includes('involved') || normText.includes('collaborate') || normText.includes('partner'))));

    // Type 3: Product & Tech Inquiries (Ertipay, Soundbox, ERP, HRMS, Custom Web/Mobile App)
    const isProductInquiry =
      !isComplaintOrIssue &&
      (/\b(ertipay|soundbox|qr|upi|payin|payout|bbps|erp|hrms|payroll|custom software|web app|mobile app|software engineering)\b/i.test(normText) ||
        normText.includes('soundbox') ||
        normText.includes('ertipay') ||
        normText.includes('payment gateway') ||
        normText.includes('upi qr') ||
        normText.includes('payroll') ||
        normText.includes('hrms') ||
        normText.includes('mobile app') ||
        normText.includes('website development') ||
        normText.includes('custom software') ||
        normText.includes('features') ||
        normText.includes('integration'));

    // Type 4: Location, Office & Support Contact
    const isLocationOrContact =
      !isComplaintOrIssue &&
      (/\b(where is your office|where is ertitech located|where are you located|office location|contact number|phone number|call us|support hours|office address)\b/i.test(normText) ||
        normText.includes('office address') ||
        normText.includes('contact number') ||
        normText.includes('phone number') ||
        normText.includes('office hours'));

    // Type 5: Emoji-Only Comments (e.g. ❤️, 🔥, 😍, 👏, 🙌, 💯)
    const isEmojiOnly =
      rawText.length > 0 &&
      (/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s.,!?*#\-_+]+$/u.test(rawText) ||
        /^([🔥❤️👏🙌💯😍👍🎉✨💪🤝🥰💖]+)$/u.test(rawText));

    // Type 6: Short Comments (e.g. "Nice", "Super", "Good", "Wow", "Awesome", "Great", "Amazing", "Excellent", "Lovely")
    const isShortComment =
      /^(nice|super|good|wow|awesome|great|amazing|excellent|lovely|cool|fire|lit|superb|best|brilliant|perfect|clean|top|kudos|fabulous|wonderful|beautiful|dope|neat)[.!, ]*$/i.test(normText) ||
      /^(nice one|so nice|so good|very nice|very good|looking good|looks good|nice pic|nice video|good one|awesome work|great one|love it|loved it)[.!, ]*$/i.test(normText) ||
      (normText.split(/\s+/).length <= 2 && /^(nice|super|good|wow|awesome|great|amazing|excellent|lovely|cool|superb|best|brilliant|perfect)\b/i.test(normText));

    // Type 7: Excited / Highly Positive Comments (e.g. "This is amazing!", "Love this!", "Wow this is awesome!", "Absolutely fantastic!")
    const isExcitedComment =
      /\b(this is amazing|love this|wow this is awesome|absolutely fantastic|mind blowing|blown away|masterpiece|outstanding work|insane|stunner|out of this world|unbelievable|pure gold|so inspiring|loved this so much|best post ever|so awesome|truly amazing)\b/i.test(normText) ||
      (normText.includes('love this') || normText.includes('this is amazing') || normText.includes('wow this is') || normText.includes('absolutely fantastic'));

    // Type 8: Positive / General Appreciation Comments (e.g. "great work", "nice post", "thank you", "well done", "keep it up")
    const isAppreciation =
      /\b(super|superb|awesome|great|nice|amazing|good\s*job|congrats|congratulations|excellent|best|brilliant|proud|keep\s*it\s*up|wow|hats\s*off|outstanding|cool|beautiful|wonderful|fantastic|fabulous|perfect|kudos|inspiring|helpful|informative|valuable|well done)\b/i.test(normText) ||
      normText.includes('looks amazing') ||
      normText.includes('great work') ||
      normText.includes('nice post') ||
      normText.includes('great post') ||
      normText.includes('love this') ||
      normText.includes('keep going') ||
      normText.includes('good work') ||
      normText.includes('proud of') ||
      normText.includes('thank you') ||
      normText.includes('thanks');

    // Type 9: Greetings & General Check-in (e.g. "hi", "hai", "hello", "hey", "testing", etc.)
    const isGreeting =
      /\b(hi|hai|hello|hey|hola|greetings|good\s*(morning|afternoon|evening)|testing|test)\b/i.test(normText);

    let publicReply = '';
    let privateDm = '';

    if (isComplaintOrIssue) {
      publicReply = `${userTag} We apologize for any inconvenience caused. For prompt assistance with your concern, please email hello@ertitech.com or WhatsApp us at +91 8122686806 with your details. 🙏`.trim();
      privateDm = `Hi ${userTag || 'there'}! We noticed your comment regarding an issue. Our support team is here to assist you promptly.\n\n📧 Email: hello@ertitech.com\n📞 WhatsApp / Phone: +91 8122686806\n\nPlease share details of your issue so we can help resolve it right away!`;
    } else if (isPricingInquiry) {
      publicReply = `${userTag} Thank you for your inquiry! Our pricing is tailored to your business requirements. We have sent details to your DMs, or you can contact hello@ertitech.com for a customized quotation. 💼`.trim();
      privateDm = `Hi ${userTag || 'there'}! Thank you for inquiring about our pricing.\n\nWe provide competitive and customized plans tailored to your specific business requirements:\n• 💳 Ertipay UPI QR Soundbox & Payment Solutions\n• 💻 Custom Web & Mobile App Development\n• 👥 HRMS & Enterprise Software\n\n📞 Direct / WhatsApp: +91 8122686806\n📧 Email: hello@ertitech.com`;
    } else if (isPartnership) {
      publicReply = `${userTag} Thank you for your interest in collaborating with Ertitech Solutions! We would be delighted to connect. We have sent our details to your DMs, or feel free to email hello@ertitech.com. 🤝`.trim();
      privateDm = `Hi ${userTag || 'there'}! Thanks for reaching out about collaborating with Ertitech Solutions.\n\n🌐 Explore our portfolio: https://ertitech.com\n📞 WhatsApp / Direct Line: +91 8122686806\n📧 Email: hello@ertitech.com\n\nPlease share your proposal or requirements, and our solutions team will connect with you!`;
    } else if (isProductInquiry) {
      publicReply = `${userTag} Thank you for your interest! Ertitech Solutions provides end-to-end fintech solutions (Ertipay UPI Soundbox) and custom software engineering. We have sent details to your DMs! 💻`.trim();
      privateDm = `Hi ${userTag || 'there'}! Thanks for your interest in Ertitech's tech solutions.\n\n• 💳 Ertipay UPI QR Soundbox & Payment Gateway\n• 💻 Custom Web & Mobile Apps (iOS & Android)\n• 👥 HRMS & Enterprise ERP Systems\n\n💬 Feel free to reply here with your requirement or contact us at +91 8122686806!`;
    } else if (isLocationOrContact) {
      publicReply = `${userTag} Ertitech Solutions is headquartered in Salem, Tamil Nadu, India. Our office hours are Mon–Sat (9:30 AM – 6:30 PM IST). You can also call us at +91 8122686806 or email hello@ertitech.com 📍`.trim();
    } else if (isEmojiOnly) {
      // Rotated natural reply for emoji-only comments
      publicReply = this._getRandomRotatedReply(EMOJI_ONLY_REPLIES, userTag);
    } else if (isShortComment) {
      // Rotated natural reply for short comments ("Nice", "Super", "Good", etc.)
      publicReply = this._getRandomRotatedReply(SHORT_COMMENT_REPLIES, userTag);
    } else if (isExcitedComment) {
      // Rotated natural reply for excited/highly positive comments
      publicReply = this._getRandomRotatedReply(EXCITED_POSITIVE_REPLIES, userTag);
    } else if (isAppreciation) {
      // Rotated natural reply for positive/appreciation comments
      publicReply = this._getRandomRotatedReply(POSITIVE_APPRECIATION_REPLIES, userTag);
    } else if (isGreeting) {
      // Rotated natural reply for greetings
      publicReply = this._getRandomRotatedReply(GREETING_COMMENT_REPLIES, userTag);
    } else {
      // 4. Fallback to Groq AI CRM Chatbot for general/conversational comments with full AI response rules
      try {
        const crmChatbot = require('../crmChatbot');
        const aiPrompt = `A user commented on our Instagram post/reel:
User: ${userTag || 'Instagram User'}
Comment: "${rawText}"

Apply these Instagram Comment AI Response Rules:
1. Keep replies short, warm, and natural for Instagram (under 160 characters).
2. Do not use robotic or promotional language when the user is simply appreciating the post.
3. Match the user's tone: casual comments receive a casual, friendly response.
4. Use emojis naturally (e.g., 😊, ❤️, 🙌, 🙏), without overusing them.
5. Do not unnecessarily mention products, pricing, or services unless asked.
6. Do not ask a question unless relevant to the user's comment.
7. Never invent facts about the post, product, or business.
8. If the comment is ambiguous, generate a neutral, polite, and friendly response.
9. Vary sentence structure, wording, and emojis to make replies feel human and authentic.

Write a natural reply for ${userTag || '@user'}:`;

        let aiRes = '';
        if (crmChatbot) {
          if (typeof crmChatbot.generateReply === 'function') {
            aiRes = await crmChatbot.generateReply(aiPrompt);
          } else if (typeof crmChatbot.generateResponse === 'function') {
            aiRes = await crmChatbot.generateResponse({
              customerId: senderId || `comment_${cId}`,
              incomingMessage: aiPrompt,
              conversationHistory: [],
            });
          }
        }
        const replyText = typeof aiRes === 'string' ? aiRes : (aiRes?.reply || aiRes?.replyText || '');
        if (replyText) {
          publicReply = replyText.replace(/^["']|["']$/g, '').trim();
          if (userTag && !publicReply.includes(userTag)) {
            publicReply = `${userTag} ${publicReply}`.trim();
          }
        }
      } catch (aiErr) {
        console.warn('[InstagramCommentAI] AI fallback generation notice:', aiErr.message);
        publicReply = this._getRandomRotatedReply(POSITIVE_APPRECIATION_REPLIES, userTag);
      }
    }

    // 5. Post Public Threaded Reply to Instagram Comment
    let replyResult = null;
    if (publicReply) {
      try {
        replyResult = await instagramCareService.replyToComment(cId, publicReply);
        console.log(`✅ [InstagramCommentAI] Public reply posted to comment ${cId}: "${publicReply}"`);
      } catch (sendErr) {
        console.error(`❌ [InstagramCommentAI] Failed to post public reply to comment ${cId}:`, sendErr.message);
      }
    }

    // 6. Send Private DM if applicable
    if (privateDm) {
      try {
        if (senderId) {
          await instagramCareService.sendMessage({
            recipientId: String(senderId),
            text: privateDm,
            isHumanReply: false,
          });
          console.log(`✅ [InstagramCommentAI] Private DM sent to sender ${senderId}`);
        } else {
          await instagramCareService.sendPrivateCommentReply(cId, privateDm);
          console.log(`✅ [InstagramCommentAI] Private comment DM sent via comment_id ${cId}`);
        }
      } catch (dmErr) {
        console.warn(`[InstagramCommentAI] Private DM notice for comment ${cId}:`, dmErr.message);
      }
    }

    // 7. Lock in Redis for 24 hours (86400 seconds) to prevent duplicate processing
    if (this.isRedisReady()) {
      try {
        await redisClient.setEx(lockKey, 86400, '1');
      } catch (_) {}
    }

    return {
      success: true,
      commentId: cId,
      publicReply,
      privateDmSent: Boolean(privateDm),
      classification: isComplaintOrIssue
        ? 'COMPLAINT_ISSUE'
        : isPricingInquiry
        ? 'PRICING_INQUIRY'
        : isPartnership
        ? 'PARTNERSHIP'
        : isProductInquiry
        ? 'PRODUCT_INQUIRY'
        : isLocationOrContact
        ? 'LOCATION_CONTACT'
        : isEmojiOnly
        ? 'EMOJI'
        : isShortComment
        ? 'SHORT_COMMENT'
        : isExcitedComment
        ? 'EXCITED_POSITIVE'
        : isAppreciation
        ? 'APPRECIATION'
        : isGreeting
        ? 'GREETING'
        : 'GENERAL_AI',
    };
  }
}

module.exports = new InstagramAiDecisionService();
