const mongoose = require('mongoose');

// Astro DB
const astroDB = mongoose.connection.useDb('Astro');

// HR Portal DB
const hrPortalDB = mongoose.connection.useDb('Hr-Portal');

// Web Crawler DB (Connects to CRAWLER_MONGODB_URI)
const crawlerUri = process.env.CRAWLER_MONGODB_URI;
const crawlerDB = crawlerUri
  ? mongoose.createConnection(crawlerUri, { maxPoolSize: 50 })
  : mongoose.connection.useDb('webcrawler');

if (crawlerUri) {
  crawlerDB.on('connected', () => {
    console.log('✅ Connected to Web Crawler MongoDB database (webcrawler DB)');
  });
  crawlerDB.on('error', (err) => {
    console.error('❌ Web Crawler MongoDB connection error:', err.message);
  });
}

// Social Media DB (Connects to Social_Media_MONGODB_URI)
const socialMediaUri = process.env.Social_Media_MONGODB_URI;
const socialMediaDB = socialMediaUri
  ? mongoose.createConnection(socialMediaUri, { maxPoolSize: 50 })
  : mongoose.connection.useDb('Social-media');

if (socialMediaUri) {
  socialMediaDB.on('connected', () => {
    console.log('✅ Connected to Social Media MongoDB database (Social-media DB)');
  });
  socialMediaDB.on('error', (err) => {
    console.error('❌ Social Media MongoDB connection error:', err.message);
  });
}

// Chatbot DB (Connects to CHATBOT_MONGODB_URI or uses 'Chatbot' db)
const chatbotUri = process.env.CHATBOT_MONGODB_URI;
const chatbotDB = chatbotUri
  ? mongoose.createConnection(chatbotUri, { maxPoolSize: 50 })
  : mongoose.connection.useDb('Chatbot');

if (chatbotUri) {
  chatbotDB.on('connected', () => {
    console.log('✅ Connected to Chatbot MongoDB database');
  });
  chatbotDB.on('error', (err) => {
    console.error('❌ Chatbot MongoDB connection error:', err.message);
  });
}

module.exports = {
  astroDB,
  hrPortalDB,
  crawlerDB,
  socialMediaDB,
  chatbotDB,
};