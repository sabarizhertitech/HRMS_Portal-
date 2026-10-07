const HolidayYear = require("../Models/Holiday.model");

exports.getYearlyHolidays = async (req, res) => {
  try {
    const { year } = req.params;

    const data = await HolidayYear.findOne({ year: parseInt(year) });

    if (!data) {
      return res.json({
        success: true,
        data: { year: parseInt(year), months: [] }
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error("Get yearly holidays error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.saveYearlyHolidays = async (req, res) => {
  try {
    const { year, months } = req.body;

    if (!year || !months) {
      return res.status(400).json({
        success: false,
        message: "Year and months required"
      });
    }

    
    months.forEach(m => {
      if (m.governmentHolidays) {
        m.governmentHolidays.sort((a, b) => a.date - b.date);
      }
      if (m.specialDays) {
        m.specialDays.sort((a, b) => a.date - b.date);
      }
    });

    const updated = await HolidayYear.findOneAndUpdate(
      { year: parseInt(year) },
      { year: parseInt(year), months },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Full year saved successfully",
      data: updated
    });
  } catch (err) {
    console.error("Save yearly error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.saveMonthHolidays = async (req, res) => {
  try {
    const { year, month, governmentHolidays, specialDays } = req.body;

    // Validation
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: "Year and month are required"
      });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Month must be between 1 and 12"
      });
    }

    
    const sortedGovHolidays = (governmentHolidays || []).sort(
      (a, b) => a.date - b.date
    );
    const sortedSpecialDays = (specialDays || []).sort(
      (a, b) => a.date - b.date
    );

  
    let doc = await HolidayYear.findOne({ year: parseInt(year) });

    if (!doc) {
     
      doc = new HolidayYear({
        year: parseInt(year),
        months: [
          {
            month: parseInt(month),
            governmentHolidays: sortedGovHolidays,
            specialDays: sortedSpecialDays
          }
        ]
      });
      await doc.save();
    } else {
      // Year exists — find the month
      const existingMonthIndex = doc.months.findIndex(
        m => m.month === parseInt(month)
      );

      if (existingMonthIndex !== -1) {
        // Month exists — UPDATE it
        doc.months[existingMonthIndex].governmentHolidays = sortedGovHolidays;
        doc.months[existingMonthIndex].specialDays = sortedSpecialDays;
      } else {
        // Month doesn't exist — PUSH new month
        doc.months.push({
          month: parseInt(month),
          governmentHolidays: sortedGovHolidays,
          specialDays: sortedSpecialDays
        });
      }

      // Sort months array by month number
      doc.months.sort((a, b) => a.month - b.month);
      await doc.save();
    }

    res.json({
      success: true,
      message: `Month ${month} saved successfully for year ${year}`,
      data: doc
    });
  } catch (err) {
    console.error("Save month error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// ✅ NEW: ADD SINGLE HOLIDAY TO A MONTH
// ================================
exports.addSingleHoliday = async (req, res) => {
  try {
    const { year, month, holiday, type } = req.body;
    // type = 'government' or 'special'

    if (!year || !month || !holiday || !holiday.date || !holiday.name) {
      return res.status(400).json({
        success: false,
        message: "Year, month, holiday (date, name), and type required"
      });
    }

    let doc = await HolidayYear.findOne({ year: parseInt(year) });

    if (!doc) {
      // Create new year document
      const monthData = {
        month: parseInt(month),
        governmentHolidays: [],
        specialDays: []
      };

      if (type === "special") {
        monthData.specialDays.push(holiday);
      } else {
        monthData.governmentHolidays.push(holiday);
      }

      doc = new HolidayYear({
        year: parseInt(year),
        months: [monthData]
      });
      await doc.save();
    } else {
      const monthObj = doc.months.find(
        m => m.month === parseInt(month)
      );

      if (!monthObj) {
        // Month doesn't exist, push new month
        const newMonth = {
          month: parseInt(month),
          governmentHolidays: [],
          specialDays: []
        };

        if (type === "special") {
          newMonth.specialDays.push(holiday);
        } else {
          newMonth.governmentHolidays.push(holiday);
        }

        doc.months.push(newMonth);
      } else {
        // Month exists, add to correct array
        const targetArray =
          type === "special"
            ? monthObj.specialDays
            : monthObj.governmentHolidays;

        // Check for duplicate
        const isDuplicate = targetArray.find(
          h => h.date === holiday.date && h.name === holiday.name
        );

        if (isDuplicate) {
          return res.status(400).json({
            success: false,
            message: "This entry already exists"
          });
        }

        targetArray.push(holiday);
        targetArray.sort((a, b) => a.date - b.date);
      }

      doc.months.sort((a, b) => a.month - b.month);
      await doc.save();
    }

    res.json({ success: true, message: "Holiday added", data: doc });
  } catch (err) {
    console.error("Add single holiday error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// ✅ NEW: REMOVE SINGLE HOLIDAY FROM A MONTH
// ================================
exports.removeSingleHoliday = async (req, res) => {
  try {
    const { year, month, date, name, type } = req.body;

    const doc = await HolidayYear.findOne({ year: parseInt(year) });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Year not found"
      });
    }

    const monthObj = doc.months.find(m => m.month === parseInt(month));
    if (!monthObj) {
      return res.status(404).json({
        success: false,
        message: "Month not found"
      });
    }

    if (type === "special") {
      monthObj.specialDays = monthObj.specialDays.filter(
        h => !(h.date === date && h.name === name)
      );
    } else {
      monthObj.governmentHolidays = monthObj.governmentHolidays.filter(
        h => !(h.date === date && h.name === name)
      );
    }

    await doc.save();

    res.json({ success: true, message: "Removed successfully", data: doc });
  } catch (err) {
    console.error("Remove holiday error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================================
// ✅ NEW: CLEAR ENTIRE MONTH DATA
// ================================
exports.clearMonth = async (req, res) => {
  try {
    const { year, month, type } = req.body;
    // type = 'government', 'special', or 'all'

    const doc = await HolidayYear.findOne({ year: parseInt(year) });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Year not found"
      });
    }

    const monthObj = doc.months.find(m => m.month === parseInt(month));
    if (!monthObj) {
      return res.json({ success: true, message: "Month already empty" });
    }

    if (type === "government" || type === "all") {
      monthObj.governmentHolidays = [];
    }
    if (type === "special" || type === "all") {
      monthObj.specialDays = [];
    }

    await doc.save();

    res.json({ success: true, message: "Month cleared", data: doc });
  } catch (err) {
    console.error("Clear month error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};