const mongoose = require("mongoose");

const birthdayWishSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    reply: {
      type: String,
      default: "",
    },
    repliedAt: {
      type: Date,
      default: null,
    },
    wishDate: {
      type: String, // Format: YYYY-MM-DD in IST
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB 1-day TTL auto-deletion index
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.BirthdayWish ||
  mongoose.model("BirthdayWish", birthdayWishSchema);
