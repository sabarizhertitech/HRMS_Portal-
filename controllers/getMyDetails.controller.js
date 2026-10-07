const getMyDetails = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: req.user
    });
  } catch (error) {
    console.error("Get My Details Error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

module.exports = getMyDetails;


const apiLogger = require('../utils/apiLogger');
module.exports = apiLogger(module.exports, 'getMyDetails.controller.js');
