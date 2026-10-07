const express = require('express');
const router = express.Router();
const paymentScriptsController = require('../controllers/paymentScriptsController');
const { authMiddleware } = require('../middleware/portalAuth');
const permissionMiddleware = require('../middleware/PermissionMiddleware');

router.use(authMiddleware);
router.use(permissionMiddleware);

router.get('/', paymentScriptsController.getAllPaymentScriptsData);
router.get('/download', paymentScriptsController.downloadExcel);

router.post('/script', paymentScriptsController.savePaymentScript);
router.delete('/script/:id', paymentScriptsController.deletePaymentScript);
router.post('/script/status', paymentScriptsController.updateStatus);

router.post('/revision-history', paymentScriptsController.saveRevisionHistory);
router.delete('/revision-history/:id', paymentScriptsController.deleteRevisionHistory);

module.exports = router;
