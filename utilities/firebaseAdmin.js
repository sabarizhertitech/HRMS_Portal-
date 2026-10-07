const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const path = require("path");

const serviceAccount = require("../hr-portal-notification-firebase-adminsdk-fbsvc-bfb00d3cb6.json");

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

module.exports = { getMessaging };
