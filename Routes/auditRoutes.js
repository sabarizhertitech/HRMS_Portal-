const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authMiddleware } = require('../middleware/portalAuth');
const permissionMiddleware = require('../middleware/PermissionMiddleware');

router.use(authMiddleware);
router.use(permissionMiddleware);

// Fetch all
router.get('/', auditController.getAllAuditData);

// User Access Review
router.post('/access-review', auditController.saveAccessReview);
router.delete('/access-review/:id', auditController.deleteAccessReview);

// Firewall Rules
router.post('/firewall-rule', auditController.saveFirewallRule);
router.delete('/firewall-rule/:id', auditController.deleteFirewallRule);


// Revision History
router.post('/revision-history', auditController.saveRevisionHistory);
router.delete('/revision-history/:id', auditController.deleteRevisionHistory);

// Admin Approval Status
router.put('/status', auditController.updateStatus);

// Download Excel
router.get('/download', auditController.downloadExcel);

// ────────────────────────────────────────────────
// Payment Script Routes
// ────────────────────────────────────────────────

// Fetch all payment scripts
router.get('/payment-scripts', auditController.getAllPaymentScripts);

// Create / edit a payment script record
router.post('/payment-scripts', auditController.savePaymentScript);

// Delete a payment script record
router.delete('/payment-scripts/:id', auditController.deletePaymentScript);

// Admin: update approval status
router.put('/payment-scripts/status', auditController.updatePaymentScriptStatus);

// Download Payment Scripts Excel
router.get('/payment-scripts/download', auditController.downloadPaymentScriptsExcel);

// ────────────────────────────────────────────────
// Vendor Routes
// ────────────────────────────────────────────────

// Fetch all vendors
router.get('/vendors', auditController.getAllVendors);

// Create / edit a vendor record
router.post('/vendors', auditController.saveVendor);

// Delete a vendor record
router.delete('/vendors/:id', auditController.deleteVendor);

// Admin: update approval status
router.put('/vendors/status', auditController.updateVendorStatus);

// Download Vendors Excel
router.get('/vendors/download', auditController.downloadVendorsExcel);

module.exports = router;
