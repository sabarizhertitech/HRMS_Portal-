const express = require('express');
const router = express.Router();

const facebookCareRoutes = require('./facebookCareRoutes');
const instagramCareRoutes = require('./instagramCareRoutes');

// Subroutes
router.use('/facebook', facebookCareRoutes);
router.use('/instagram', instagramCareRoutes);

// General health / status check for Care module
router.get('/status', (req, res) => {
  res.status(200).json({
    success: true,
    module: 'Care Module',
    features: ['instagram_business_manage_comments', 'facebook_pages'],
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
