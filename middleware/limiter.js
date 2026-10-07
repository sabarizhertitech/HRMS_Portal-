const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 12 * 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    return req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  },
  message: 'Too many requests. Please try again later.',
});


module.exports = limiter;
