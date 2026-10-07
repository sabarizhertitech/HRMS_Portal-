const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const redisClient = require('../utilities/redis');
const Notification = require('../Models/Notification');

/**
 * CRM Chatbot Service for Instagram Direct Messaging
 * Powered by Groq API Key Pooling (Multi-Key Rotation & Failover),
 * Redis Intelligent Response Cache, and CRM Chatbot.json Knowledge Base.
 */
class CRMChatbotService {
  constructor() {
    this.apiUrl =
      process.env.INSTAGRAM_GROQ_API_URL ||
      process.env.INSTAGRAM_GROK_API_URL ||
      process.env.GROQ_API_URL ||
      process.env.GROK_API_URL ||
      'https://api.groq.com/openai/v1/chat/completions';
    this.model =
      process.env.INSTAGRAM_GROQ_MODEL ||
      process.env.INSTAGRAM_GROK_MODEL ||
      process.env.GROQ_MODEL ||
      process.env.GROK_MODEL ||
      'llama-3.3-70b-versatile';
    this.cacheTtlSeconds = 3600; // 1 hour cache for frequent questions
    this.currentKeyIndex = 0;
    this.knowledge = this._loadKnowledgeBase();
    this.systemPrompt = this._buildSystemPrompt();
  }

  /**
   * Helper to check if Redis is connected
   */
  isRedisReady() {
    return redisClient && redisClient.isOpen;
  }

  /**
   * Safely retrieve ALL configured Groq API keys from environment or .env file
   * Supports:
   *  - Comma-separated: INSTAGRAM_GROQ_API_KEYS, GROQ_API_KEYS
   *  - Single vars: INSTAGRAM_GROK_API_KEY, INSTAGRAM_GROQ_API_KEY, GROK_API_KEY, GROQ_API_KEY, etc.
   *  - Direct .env reading as backup
   * @returns {string[]} Array of valid API keys
   */
  getAllApiKeys() {
    const keys = [];

    // 1. Check comma-separated list
    const multiList =
      process.env.INSTAGRAM_GROQ_API_KEYS ||
      process.env.INSTAGRAM_GROK_API_KEYS ||
      process.env.GROQ_API_KEYS ||
      process.env.GROK_API_KEYS;
    if (multiList && multiList.trim()) {
      multiList.split(',').forEach((k) => {
        const trimmed = k.trim();
        if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
      });
    }

    // 2. Check individual environment variables
    const singleEnvVars = [
      'INSTAGRAM_GROK_API_KEY',
      'INSTAGRAM_GROQ_API_KEY',
      'INSTAGRAM_GROQ_API_KEY_1',
      'INSTAGRAM_GROQ_API_KEY_2',
      'INSTAGRAM_GROQ_API_KEY_3',
      'GROK_API_KEY',
      'GROQ_API_KEY',
      'GROQ_API_KEY_1',
      'GROQ_API_KEY_2',
      'GROQ_API_KEY_3',
      'GROQ_API_KEY_4',
      'GROK API KEY',
    ];

    for (const varName of singleEnvVars) {
      const val = process.env[varName];
      if (val && val.trim()) {
        const trimmed = val.trim();
        if (!keys.includes(trimmed)) keys.push(trimmed);
      }
    }

    // 3. Fallback: Parse .env directly if empty
    if (keys.length === 0) {
      try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
          const raw = fs.readFileSync(envPath, 'utf8');
          const matches = raw.match(/gsk_[a-zA-Z0-9_-]+/g);
          if (matches && matches.length > 0) {
            matches.forEach((m) => {
              if (!keys.includes(m.trim())) keys.push(m.trim());
            });
          }
        }
      } catch (e) {
        console.warn('[CRMChatbot] Could not parse .env for keys:', e.message);
      }
    }

    return keys;
  }

  /**
   * Load CRM Chatbot.json knowledge base
   * @private
   */
  _loadKnowledgeBase() {
    try {
      const jsonPath = path.resolve(__dirname, '../CRM Chatbot.json');
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(raw);
        console.log('[CRMChatbot] Successfully loaded CRM Chatbot.json knowledge base');
        return data;
      }
    } catch (e) {
      console.error('[CRMChatbot] Error loading CRM Chatbot.json:', e.message);
    }
    return null;
  }

  /**
   * Build comprehensive System Prompt from CRM Chatbot.json
   * @private
   */
  _buildSystemPrompt() {
    const k = this.knowledge || {};
    const company = k.company || {
      name: 'Ertitech Solutions Private Limited',
      website: 'https://www.ertitech.com/',
      email: 'hello@ertitech.com',
      whatsapp: '+91 8122686806',
    };

    return `You are the official Ertitech AI Customer Support Assistant for Instagram Direct Messages.
About the Company: ${company.name} is a premier fintech and digital technology solutions company.
Flagship Product - ErtiPay: ErtiPay is Ertitech's digital payment application product for mobile recharges, BBPS utility bill payments, and merchant QR collections.
Website: ${company.website}
Email: ${company.email}
WhatsApp Support: ${company.whatsapp}
Support Hours: Business days 10:00 AM – 6:30 PM IST

Core Fintech & Business Services:
- ErtiPay: Ertitech's digital payment product for mobile recharges and utility bill payments.
- PayIn: Payment gateway and merchant API integrations for websites and apps.
- Payout: Bulk and individual payout disbursement APIs for businesses.
- UPI QR: Static and Dynamic QR payment collection for merchants.
- Fintech Software Development: Custom fintech platforms, web applications, and merchant dashboards.

Strict Rules:
1. Company vs Product Distinction: Ertitech is the parent fintech company; ErtiPay is Ertitech's digital payment product.
2. Conversational Style: Speak warmly and directly as an Ertitech team member on Instagram. NEVER use "Q&A", "Question:", "Answer:", or bullet points.
3. Short Length: Strictly 1 to 2 short sentences maximum. Keep it concise, friendly, and quick to read.
4. Accuracy: Only mention verified Ertitech fintech services and products.
5. Privacy: Never request passwords, OTPs, or PINs.
6. Direct Contact: Mention WhatsApp (${company.whatsapp}) or email (${company.email}) when the customer wants to get started or needs support.
7. Payment & Transaction Status: When the customer asks about payment status, transaction status, refund status, payout status, or transaction failure/verification (e.g. "What is my payment status", "status of today transaction"), ALWAYS reply asking them to contact our support team and explicitly provide both our Support Email (${company.email}) and Mobile/WhatsApp (${company.whatsapp}) with their Transaction ID.
8. Unknown / Out-of-Scope Questions: If the customer asks an unknown question, something outside Ertitech services, or an unrecognized inquiry, ALWAYS reply: "Thank you for reaching out to Ertitech! For further assistance or specific queries, please contact our support team at ${company.email} or call/WhatsApp ${company.whatsapp}."
9. Language: Always respond strictly in English only. Keep the tone warm, professional, concise, and helpful.
`;
  }

  /**
   * Return interactive Quick Reply buttons for all Ertitech core services
   */
  getServiceQuickReplies() {
    return [
      { content_type: 'text', title: '💳 ErtiPay', payload: 'SERVICE_ERTIPAY' },
      { content_type: 'text', title: '🌐 PayIn Gateway', payload: 'SERVICE_PAYIN' },
      { content_type: 'text', title: '💸 Payout APIs', payload: 'SERVICE_PAYOUT' },
      { content_type: 'text', title: '📱 UPI QR Code', payload: 'SERVICE_UPI_QR' },
      { content_type: 'text', title: '💻 Custom Fintech', payload: 'SERVICE_FINTECH_DEV' },
      { content_type: 'text', title: '🎧 Custom Support', payload: 'ACTION_CUSTOMER_SUPPORT' },
    ];
  }

  /**
   * Return follow-up Quick Reply buttons (Custom Support & Menu)
   */
  getSupportQuickReplies() {
    return [
      { content_type: 'text', title: '🎧 Custom Support', payload: 'ACTION_CUSTOMER_SUPPORT' },
      { content_type: 'text', title: '📋 All Services', payload: 'ACTION_MAIN_MENU' },
    ];
  }

  /**
   * Return detailed service information along with 24-hour team outreach notice
   * @param {string} servicePayload
   * @returns {string}
   */
  getServiceDetails(servicePayload) {
    const p = String(servicePayload || '').toUpperCase();
    if (p.includes('ERTIPAY')) {
      return (
        "💳 ErtiPay by Ertitech\n\n" +
        "ErtiPay is Ertitech's flagship digital payment app for instant mobile recharges, BBPS utility bill payments (electricity, gas, water), and merchant QR collections.\n\n" +
        "✨ Key Features: Instant recharge, utility bills, secure transactions, merchant settlements.\n\n" +
        "⏳ Our team will reach out to you within 24 hours regarding your query. If you need an immediate response, please tap Custom Support below!"
      );
    }

    if (p.includes('PAYIN')) {
      return (
        "🌐 PayIn Payment Gateway\n\n" +
        "Collect customer payments on your website or mobile app seamlessly with Ertitech's robust PayIn gateway.\n\n" +
        "✨ Key Features: Multi-bank UPI, Debit/Credit Cards, NetBanking, instant webhooks, and automatic merchant settlement.\n\n" +
        "⏳ Our team will reach out to you within 24 hours regarding your query. If you need an immediate response, please tap Custom Support below!"
      );
    }

    if (p.includes('PAYOUT')) {
      return (
        "💸 Payout & Bulk Disbursement APIs\n\n" +
        "Automate 24/7 instant bank and UPI payouts for vendor settlements, partner commissions, and salary disbursements.\n\n" +
        "✨ Key Features: Instant IMPS/NEFT/UPI transfers, beneficiary validation, automated reconciliation, high success rates.\n\n" +
        "⏳ Our team will reach out to you within 24 hours regarding your query. If you need an immediate response, please tap Custom Support below!"
      );
    }

    if (p.includes('UPI_QR') || p.includes('QR')) {
      return (
        "📱 UPI Static & Dynamic QR Collections\n\n" +
        "Accept instant contactless UPI payments at physical counters or digital checkouts with custom static and dynamic QR codes.\n\n" +
        "✨ Key Features: Instant payment notification, zero transaction loss, custom merchant QR branding, merchant analytics.\n\n" +
        "⏳ Our team will reach out to you within 24 hours regarding your query. If you need an immediate response, please tap Custom Support below!"
      );
    }

    if (p.includes('FINTECH') || p.includes('SOFTWARE') || p.includes('DEV')) {
      return (
        "💻 Custom Fintech & Software Development\n\n" +
        "Ertitech engineers end-to-end custom fintech web platforms, merchant dashboards, payment gateways, and enterprise mobile apps.\n\n" +
        "✨ Key Features: Scalable cloud microservices, banking API integrations, top-tier security, dedicated engineering team.\n\n" +
        "⏳ Our team will reach out to you within 24 hours regarding your query. If you need an immediate response, please tap Custom Support below!"
      );
    }

    return (
      "Hello! Welcome to Ertitech Solutions. Please choose from our fintech services or tap Custom Support to connect with our team.\n\n" +
      "⏳ Our team will reach out to you within 24 hours. For immediate assistance, tap Custom Support below!"
    );
  }

  /**
   * Intelligent fallback response grounded in CRM Chatbot.json knowledge base
   * @private
   */
  _generateSmartFallback(customerMessage) {
    const text = (customerMessage || '').toLowerCase().trim();
    if (/^(hi|hello|hai|hey|hola|greetings|good\s*(morning|afternoon|evening)|test|testing)/i.test(text) || text.includes('testing purpose')) {
      return "Hello! Thank you for reaching out to Ertitech. Please select an option below to explore our fintech services or connect with our support team:";
    }
    if (
      /\b(payment|transaction|refund|payout|settlement|money|transfer)\b/i.test(text) &&
      /\b(status|check|update|today|fail|failed|stuck|pending|not received|my|verify)\b/i.test(text)
    ) {
      return "For payment and transaction status inquiries, please contact our support team at hello@ertitech.com or call/WhatsApp +91 8122686806 with your Transaction ID for immediate verification.";
    }
    if (text.includes('ertipay') || text.includes('recharge') || text.includes('utility') || text.includes('bill')) {
      return this.getServiceDetails('SERVICE_ERTIPAY');
    }
    if (text.includes('gateway') || text.includes('payin') || text.includes('payment') || text.includes('merchant') || text.includes('qr') || text.includes('integrate') || text.includes('api')) {
      return this.getServiceDetails('SERVICE_PAYIN');
    }
    if (text.includes('payout') || text.includes('disburse') || text.includes('salary') || text.includes('bulk')) {
      return this.getServiceDetails('SERVICE_PAYOUT');
    }
    if (text.includes('contact') || text.includes('support') || text.includes('phone') || text.includes('email') || text.includes('whatsapp') || text.includes('address') || text.includes('office')) {
      return "You can reach the Ertitech team on WhatsApp at +91 8122686806 or email hello@ertitech.com. If you need immediate assistance, tap Custom Support below!";
    }
    if (text.includes('price') || text.includes('pricing') || text.includes('cost') || text.includes('charge') || text.includes('fee')) {
      return "Our pricing is transparent and competitive with customized slabs for businesses. Our team will reach out within 24 hours, or tap Custom Support for instant help!";
    }
    return "Thank you for reaching out to Ertitech! For further assistance or specific queries, please contact our support team at hello@ertitech.com or call/WhatsApp +91 8122686806. You can also select an option below:";
  }

  /**
   * Helper: Normalize text for caching
   */
  _normalizeText(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  /**
   * Helper: Get Redis cache key for question
   */
  _getCacheKey(text) {
    const normalized = this._normalizeText(text);
    if (!normalized || normalized.length < 3) return null;
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    return `ig:ai:cache:${hash}`;
  }

  /**
   * Generate AI response with Multi-API-Key Failover and Redis Response Caching
   * @param {string} customerMessage - The incoming message text from customer
   * @param {Array} history - Optional recent message exchange [{ role: 'user'|'assistant', content: string }]
   * @returns {Promise<string>} The generated reply
   */
  async generateReply(customerMessage, history = []) {
    if (!customerMessage || !customerMessage.trim()) {
      return 'Hello! Thanks for reaching out to Ertitech. How can we help you today?';
    }

    const trimmedMessage = customerMessage.trim();

    // 1. Check Redis Response Cache (For single queries without complex context)
    const hasHistory = Array.isArray(history) && history.length > 0;
    const cacheKey = !hasHistory ? this._getCacheKey(trimmedMessage) : null;

    if (cacheKey && this.isRedisReady()) {
      try {
        const cachedReply = await redisClient.get(cacheKey);
        if (cachedReply) {
          console.log(`[CRMChatbot] ⚡ Response served from Redis Cache for: "${trimmedMessage.slice(0, 30)}..."`);
          return cachedReply;
        }
      } catch (cacheErr) {
        console.warn('[CRMChatbot] Redis cache read error:', cacheErr.message);
      }
    }

    // 2. Retrieve all API keys
    const apiKeys = this.getAllApiKeys();
    if (apiKeys.length === 0) {
      console.warn('[CRMChatbot] No API keys found. Using grounded knowledge base fallback.');
      return this._generateSmartFallback(trimmedMessage);
    }

    const messages = [{ role: 'system', content: this.systemPrompt }];

    if (hasHistory) {
      const recent = history.slice(-4);
      for (const h of recent) {
        if (h.role && h.content) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: 'user', content: trimmedMessage });

    // 3. Multi-Key Round-Robin & Failover Loop
    // Try keys starting from current index, rotating to next key if 429 or error happens
    const totalKeys = apiKeys.length;
    let keyIndex = this.currentKeyIndex % totalKeys;

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const activeKey = apiKeys[keyIndex];
      const keyShort = activeKey.slice(0, 8) + '...' + activeKey.slice(-4);

      try {
        console.log(`📡 [GROQ API CALL] Key #${keyIndex + 1}/${totalKeys} (${keyShort}) | Model: ${this.model}`);
        const response = await axios.post(
          this.apiUrl,
          {
            model: this.model,
            messages,
            max_tokens: 200,
            temperature: 0.6,
          },
          {
            headers: {
              Authorization: `Bearer ${activeKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          }
        );

        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        if (reply) {
          console.log(`✅ [GROQ API SUCCESS] Reply: "${reply}"`);
          // Advance index for load distribution
          this.currentKeyIndex = (keyIndex + 1) % totalKeys;

          // Save to Redis cache for instant future reuse
          if (cacheKey && this.isRedisReady()) {
            redisClient.set(cacheKey, reply, { EX: this.cacheTtlSeconds }).catch(() => {});
          }

          return reply;
        }
      } catch (error) {
        const status = error.response?.status;
        console.warn(
          `[CRMChatbot] Key [${keyIndex + 1}/${totalKeys}: ${keyShort}] returned HTTP ${status || error.code}: ${error.response?.data?.error?.message || error.message}`
        );

        // If rate limit (429) or quota exceeded, failover immediately to next key!
        if (status === 429 || (status >= 500 && status < 600)) {
          console.warn(`[CRMChatbot] 🔄 Rate limit / server error on key ${keyIndex + 1}. Failing over to next API key...`);
          keyIndex = (keyIndex + 1) % totalKeys;
          continue;
        }

        // For other client errors, try next key
        keyIndex = (keyIndex + 1) % totalKeys;
      }
    }

    // 4. All API keys exhausted or failed — use verified CRM Chatbot Knowledge Base
    console.warn('[CRMChatbot] All API keys exhausted or rate-limited. Serving verified Knowledge Base fallback.');
    return this._generateSmartFallback(trimmedMessage);
  }

  /**
   * Handle incoming Instagram DM and send automated AI response
   * @param {Object} param
   * @param {string} param.senderId - Customer Instagram user ID
   * @param {string} param.text - Customer message text
   * @param {string} param.businessAccountId - Ertitech Instagram business account ID
   * @returns {Promise<Object>}
   */
  async handleInstagramAutoReply({ senderId, text, businessAccountId }) {
    if (!senderId || !text || !text.trim()) {
      return { skipped: true, reason: 'Empty sender or text' };
    }

    console.log(`[CRMChatbot] Generating AI reply for Instagram user: ${senderId} | text: "${text}"`);
    const aiReply = await this.generateReply(text);
    console.log(`[CRMChatbot] Generated AI reply: "${aiReply}"`);

    // Dynamically require instagramCareService to avoid circular dependency
    try {
      const instagramCareService = require('./care/instagramCareService');
      const sendResult = await instagramCareService.sendMessage({
        recipientId: String(senderId),
        text: aiReply,
      });

      console.log(`[CRMChatbot] AI Reply successfully dispatched to Instagram user ${senderId}`);
      return {
        success: true,
        senderId,
        replyText: aiReply,
        sendResult,
      };
    } catch (err) {
      console.error(`[CRMChatbot] Failed to send AI reply to Instagram user ${senderId}:`, err.message);
      return {
        success: false,
        senderId,
        replyText: aiReply,
        error: err.message,
      };
    }
  }
}

module.exports = new CRMChatbotService();
