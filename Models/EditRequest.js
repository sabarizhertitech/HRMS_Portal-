const mongoose = require("mongoose");

const editRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  empIdString: String,
  employeeName: String,

  requestMessage: {
    type: String,
    required: true
  },

  requestedFields: {
    type: [String],           
    required: true
  },

  approvedFields: {
    type: [String],          
    default: []
  },

  usedFields: {
    type: [String],           
    default: []
  },

  adminNote: String,

  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "used"],
    default: "pending"
  },

  actionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },

  actionAt: Date,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("EditRequest", editRequestSchema);

