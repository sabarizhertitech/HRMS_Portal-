require('dotenv').config();

const INSTAGRAM_CONFIG = {
  get appId() {
    return (process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '').trim();
  },
  get appSecret() {
    return (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '').trim();
  },
  get businessAccountId() {
    return (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
  },
  get accessToken() {
    return (
      process.env.INSTAGRAM_ACCESS_TOKEN ||
      process.env.INSTAGRAM_TOKEN ||
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
      ''
    ).trim();
  },
  get redirectUri() {
    return (process.env.INSTAGRAM_REDIRECT_URI || 'https://hr.ertitech.com/instagram').trim();
  },
  get verifyToken() {
    return (
      process.env.INSTAGRAM_VERIFY_TOKEN ||
      'ERTITECH_INSTAGRAM_WEBHOOK_2026'
    ).trim();
  },
  get frontendUrl() {
    return (process.env.FRONTEND_URL || 'https://hr-portal.ertitech.com/').trim();
  },
  scopes: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ],
  graphApiVersion: process.env.INSTAGRAM_GRAPH_API_VERSION || 'v25.0',
  apiTimeoutMs: 10000,
};

module.exports = INSTAGRAM_CONFIG;
