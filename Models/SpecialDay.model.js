const mongoose = require("mongoose");

const specialDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true }, // "YYYY-MM-DD"
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

specialDaySchema.index({ date: 1 });

module.exports = mongoose.model("SpecialDay", specialDaySchema);