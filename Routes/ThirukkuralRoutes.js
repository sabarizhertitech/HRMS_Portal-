const ThirukkuralController = require('../controllers/ThirukkuralController');
const ThirukkuralRouter = require('express').Router();

ThirukkuralRouter.get('/current', ThirukkuralController.getCurrentKural);
ThirukkuralRouter.post('/rotate', ThirukkuralController.manualRotate);

module.exports = ThirukkuralRouter;