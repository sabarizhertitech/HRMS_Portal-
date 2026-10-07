const axios = require("axios");
const { URL } = require("url");
const { isPrivateHostname } = require("../crawler/engine");


async function checkLink(url, timeout = 5000) {
  try {
    const parsed = new URL(url);
    if (isPrivateHostname(parsed.hostname)) {
      return { url, isBroken: true, statusCode: 0, statusText: "Blocked (Private/Internal IP)" };
    }
  } catch (err) {
    return { url, isBroken: true, statusCode: 0, statusText: "Invalid Link Format" };
  }

  const config = {
    timeout,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebAudit/1.0",
    },
    validateStatus: () => true, // resolve promise for any status code
  };

  try {
    // Try HEAD first
    let response = await axios.head(url, config).catch(() => null);

    // Fall back to GET if HEAD failed or returned a method-disallowed code (e.g. 405)
    if (!response || response.status === 405 || response.status === 403) {
      response = await axios.get(url, { ...config, maxContentLength: 1024 }).catch(() => null);
    }

    if (!response) {
      return { url, isBroken: true, statusCode: 0, statusText: "Network/Resolution Failure" };
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    const isBroken = response.status >= 400;

    return {
      url,
      isBroken,
      isRedirect,
      statusCode: response.status,
      statusText: response.statusText || `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      url,
      isBroken: true,
      statusCode: err.response ? err.response.status : 0,
      statusText: err.message || "Timeout/Connection Error",
    };
  }
}

/**
 * Check multiple links in batches.
 * 
 * @param {Array<string>} urls List of unique URLs.
 * @param {number} concurrency Maximum concurrent requests.
 * @returns {Promise<Array>} List of broken/redirect links.
 */
async function checkBrokenLinks(urls, concurrency = 5) {
  const uniqueUrls = [...new Set(urls)].filter(u => u && (u.startsWith("http://") || u.startsWith("https://")));
  const results = [];
  
  // Clone array to process as a queue
  const queue = [...uniqueUrls];

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      const result = await checkLink(url);
      if (result.isBroken || result.isRedirect) {
        results.push(result);
      }
    }
  };

  const activeWorkers = Math.min(concurrency, queue.length);
  const workers = Array(activeWorkers).fill(null).map(worker);
  await Promise.all(workers);

  return results;
}

module.exports = {
  checkBrokenLinks,
};
