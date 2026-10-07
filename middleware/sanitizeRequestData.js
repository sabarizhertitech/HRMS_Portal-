const xss = require('xss');

const sanitizeRequestData = (req, res, next) => {
    const sanitize = (data, keyName = null) => {
        if (!data) {
            return data;
        }
        if (typeof data === 'string') {
            if (keyName === 'html' || keyName === 'customHtml' || keyName === 'defaultHtml') {
                return data;
            }
            return xss(data);
        } else if (typeof data === 'object') {
            for (let key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    data[key] = sanitize(data[key], key);
                }
            }
            return data;
        } else {
            return data;
        }
    };

    if (req.body) req.body = sanitize(req.body);
    if (req.query) req.query = sanitize(req.query);
    if (req.params) req.params = sanitize(req.params);

    next();
};

module.exports = sanitizeRequestData;

