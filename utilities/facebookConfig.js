require('dotenv').config();

const FACEBOOK_CONFIG = {
  get pageId() {
    return (process.env.FACEBOOK_PAGE_ID || '').trim();
  },

  get pageName() {
    return (process.env.FACEBOOK_PAGE_NAME || 'Ertitech').trim();
  },

  get pageAccessToken() {
    return (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  },

  get verifyToken() {
    return (process.env.FACEBOOK_VERIFY_TOKEN || '').trim();
  },

  get appId() {
    return (process.env.FACEBOOK_APP_ID || '').trim();
  },

  get appSecret() {
    return (process.env.FACEBOOK_APP_SECRET || '').trim();
  },

  get graphApiVersion() {
    return (process.env.FACEBOOK_GRAPH_API_VERSION || 'v25.0').trim();
  },

  get graphApiBase() {
    return 'https://graph.facebook.com';
  },

  get webhookUrl() {
    return (process.env.FACEBOOK_WEBHOOK_URL || 'https://hr.ertitech.com/facebook').trim();
  },

  apiTimeoutMs: 8000,
};

module.exports = FACEBOOK_CONFIG;
