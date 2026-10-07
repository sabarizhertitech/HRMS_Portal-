const express = require('express');
const router = express.Router();
const portalAuth = require('../middleware/portalAuth');
const sanitizeRequestData = require('../middleware/sanitizeRequestData');
const LetterController = require('../controllers/LetterController');

const uploadMemory = require('../middleware/uploadMemory');

const rateLimit = require('express-rate-limit');

const saveUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  statusCode: 429,
  message: { success: false, message: 'Too many upload requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// All endpoints inside this file are protected and sanitize input
router.use(portalAuth.adminMiddleware);
router.use(sanitizeRequestData);

// Letter Templates management
router.get('/templates', LetterController.getTemplates);
router.post('/templates', LetterController.saveTemplate);
router.put('/templates', LetterController.saveTemplate);
router.post('/templates/reset', LetterController.resetTemplate);

// Generated Letters records management
router.get('/history', LetterController.getGeneratedLetters);
router.get('/employees', LetterController.getIncrementEmployees);
router.post('/save', saveUploadLimiter, uploadMemory.single('file'), LetterController.saveGeneratedLetter);
router.delete('/delete/:id', LetterController.deleteGeneratedLetter);

module.exports = router;
