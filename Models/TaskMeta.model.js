const mongoose = require("mongoose");

/* ══════════════════════════════════════════════════════════
   TASK META — Category-wise Project mapping.
   One document per category name (unique).
   
   DB Format:
   {
     category: "Dashboard",
     projects: ["Ertipay App", "Admin Dash"]
   }
══════════════════════════════════════════════════════════ */
const taskMetaSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    projects: [{ type: String }],
  }
);

module.exports = mongoose.model("TaskMeta", taskMetaSchema);
