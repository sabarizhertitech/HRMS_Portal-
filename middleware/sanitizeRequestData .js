const xss = require('xss');

const sanitizeRequestData = (req, res, next) => {
    const sanitize = (data) => {
        if (typeof data === 'string') {
            return xss(data);
        } else if (typeof data === 'object') {
            for (let key in data) {
                if (data.hasOwnProperty(key)) {
                    data[key] = sanitize(data[key]);
                }
            }
            return data;
        } else {
            return data;
        }
    };

    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);

    next();
};

module.exports = sanitizeRequestData;
