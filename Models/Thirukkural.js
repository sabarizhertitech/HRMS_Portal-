const mongoose = require('mongoose');
const { astroDB } = require('../utils/dbConnections');

const ThirukkuralSchema = new mongoose.Schema({
  Number: { type: Number, required: true, unique: true, index: true },
  Line1: { type: String, required: true, trim: true },
  Line2: { type: String, required: true, trim: true },
  Translation: { type: String },
  mv: { type: String },
  sp: { type: String },
  mk: { type: String },
  explanation: { type: String },
  couplet: { type: String },
  transliteration1: { type: String },
  transliteration2: { type: String },
  paul_name: { type: String },
  paul_transliteration: { type: String },
  paul_translation: { type: String },
  iyal_name: { type: String },
  iyal_transliteration: { type: String },
  iyal_translation: { type: String },
  adikaram_name: { type: String },
  adikaram_transliteration: { type: String },
  adikaram_translation: { type: String },

  shown: {
    type: Boolean,
    default: false,
    index: true
  },

  currentShowing: {
    type: Boolean,
    default: false,
    index: true
  },

}, {
  timestamps: false,
  collection: 'thirukkural'
});

ThirukkuralSchema.index({
  shown: 1,
  currentShowing: 1
});

module.exports = astroDB.model(
  'Thirukkural',
  ThirukkuralSchema
);