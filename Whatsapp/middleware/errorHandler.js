// middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
    return res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
};

module.exports = errorHandler;