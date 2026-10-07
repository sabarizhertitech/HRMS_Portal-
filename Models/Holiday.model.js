const mongoose = require("mongoose");

const HolidaySchema = new mongoose.Schema({
  date: {
    type: String, 
    required: true,
    unique: true,
  },
  name: {
    type: String,
  },
});

module.exports = mongoose.model("Holiday", HolidaySchema);