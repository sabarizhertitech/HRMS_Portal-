const tls = require("tls");
const { URL } = require("url");

/**
 * Connects to the host via TLS socket and fetches peer SSL certificate.
 * 
 * @param {string} targetUrl The target URL to test.
 * @returns {Promise<object>} SSL analysis report.
 */
function analyzeSSL(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const host = parsedUrl.hostname;

      // Skip analysis for localhost or simple IPs without SSL support
      if (host === "localhost" || host === "127.0.0.1") {
        return resolve({
          isValid: false,
          issuer: "Local Development Server",
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          daysRemaining: 365,
          error: "Localhost bypass SSL validation.",
        });
      }

      const socket = tls.connect(
        {
          host: host,
          port: 443,
          servername: host,
          rejectUnauthorized: false, // allow capturing expired/self-signed certs
          timeout: 10000, // 10 second timeout
        },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            return resolve({
              isValid: false,
              issuer: "",
              validFrom: null,
              validTo: null,
              daysRemaining: 0,
              error: "No SSL/TLS certificate was returned by the server.",
            });
          }

          const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
          
          let daysRemaining = 0;
          let isValid = false;

          if (validTo) {
            const timeDiff = validTo.getTime() - Date.now();
            daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
            // Check if socket is authorized and cert is not expired
            isValid = socket.authorized && daysRemaining > 0;
          }

          // Extract issuer name
          let issuer = "";
          if (cert.issuer) {
            issuer = cert.issuer.O || cert.issuer.CN || "Unknown Issuer";
          }

          resolve({
            isValid,
            issuer,
            validFrom,
            validTo,
            daysRemaining,
            error: socket.authorized ? null : `Authorization failed: ${socket.authorizationError || "Self-signed or invalid CA chain"}`,
          });
        }
      );

      socket.on("error", (err) => {
        resolve({
          isValid: false,
          issuer: "",
          validFrom: null,
          validTo: null,
          daysRemaining: 0,
          error: `TLS Socket Error: ${err.message}`,
        });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({
          isValid: false,
          issuer: "",
          validFrom: null,
          validTo: null,
          daysRemaining: 0,
          error: "TLS connection timed out (10s limit).",
        });
      });
    } catch (err) {
      resolve({
        isValid: false,
        issuer: "",
        validFrom: null,
        validTo: null,
        daysRemaining: 0,
        error: `URL Parsing Error: ${err.message}`,
      });
    }
  });
}

module.exports = {
  analyzeSSL,
};
