const { URL } = require("url");

/**
 * Analyzes security features and vulnerabilities of a single page.
 * 
 * @param {object} page Crawled page data.
 * @returns {object} Page security report.
 */
function analyzePageSecurity(page) {
  const issues = [];
  let score = 100;
  const url = page.url || "";
  const headers = page.securityHeaders || {};
  const forms = page.forms || [];
  const rawHtml = page.renderedHtml || page.rawHtml || "";

  // 1. Serves over HTTPS
  const isHttps = url.toLowerCase().startsWith("https://");
  if (!isHttps && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    score -= 30;
    issues.push({
      item: "insecure_http",
      severity: "HIGH",
      message: "The page is served over insecure HTTP.",
      recommendation: "Deploy SSL/TLS certificates and force all HTTP traffic to redirect to HTTPS.",
    });
  }

  // 2. CSP (Content-Security-Policy) Header Audit
  if (!headers.csp) {
    score -= 15;
    issues.push({
      item: "csp_missing",
      severity: "MEDIUM",
      message: "Content Security Policy (CSP) header is missing.",
      recommendation: "Implement a robust Content-Security-Policy header to prevent Cross-Site Scripting (XSS) and code injection attacks.",
    });
  }

  // 3. HSTS (Strict-Transport-Security) Header Audit
  if (isHttps && !headers.hsts) {
    score -= 10;
    issues.push({
      item: "hsts_missing",
      severity: "MEDIUM",
      message: "HTTP Strict Transport Security (HSTS) is missing.",
      recommendation: "Add the Strict-Transport-Security header to ensure modern browsers only communicate with your domain over secure HTTPS.",
    });
  }

  // 4. Clickjacking prevention headers (X-Frame-Options)
  if (!headers.xFrameOptions) {
    score -= 10;
    issues.push({
      item: "x_frame_options_missing",
      severity: "MEDIUM",
      message: "X-Frame-Options clickjacking protection is missing.",
      recommendation: "Configure X-Frame-Options to DENY or SAMEORIGIN to restrict unauthorized third-party embeds in nested frame nodes.",
    });
  }

  // 5. Exposed Admin Routes
  const adminRoutes = ["/admin", "/wp-admin", "/administrator", "/backend", "/dashboard/admin", "/cpanel"];
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (adminRoutes.some(route => pathname.startsWith(route))) {
      score -= 15;
      issues.push({
        item: "admin_route_exposed",
        severity: "HIGH",
        message: `Exposed administrative path detected: ${pathname}`,
        recommendation: "Restrict administrative access to local networks, change default URL structures, or enforce IP blocklists.",
      });
    }
  } catch (e) {}

  // 6. Public .env references or typical credentials keywords in script tags/DOM
  const envKeywords = ["DB_PASSWORD", "AWS_SECRET_ACCESS_KEY", "JWT_SECRET", "process.env.", "API_KEY="];
  const detectedKeys = envKeywords.filter(keyword => rawHtml.includes(keyword));
  if (detectedKeys.length > 0) {
    score -= 25;
    issues.push({
      item: "env_keys_exposed",
      severity: "HIGH",
      message: `Sensitive environment variable keyword references found in client source: [${detectedKeys.join(", ")}]`,
      recommendation: "Move private configuration keys to server runtime variables; ensure public code files do not leak configuration profiles.",
    });
  }

  // 7. Login forms audit
  const loginForms = forms.filter((f) => {
    if (!f) return false;
    const action = (f.action || f.formAction || "").toLowerCase();
    const formType = (f.formType || "").toLowerCase();
    const inputs = Array.isArray(f.inputs) ? f.inputs : (Array.isArray(f.fields) ? f.fields : []);
    const hasPassword = inputs.some(i => {
      if (!i) return false;
      const type = (i.type || i.fieldType || "").toLowerCase();
      const name = (i.name || i.fieldName || "").toLowerCase();
      return type === "password" || name.includes("pass");
    });
    return formType === "login" || action.includes("login") || action.includes("signin") || hasPassword;
  });

  if (loginForms.length > 0) {
    loginForms.forEach((form) => {
      // Check if login form is served on insecure page or submits over insecure HTTP
      const submitUrl = form.action || form.formAction || "";
      const isSecureSubmit = submitUrl.toLowerCase().startsWith("https://") || submitUrl.startsWith("/");
      if (!isHttps || !isSecureSubmit) {
        score -= 25;
        issues.push({
          item: "insecure_login_submission",
          severity: "HIGH",
          message: "Login forms are served or submitted over insecure channels.",
          recommendation: "Enforce secure HTTPS pages for authentication portals, and submit all login credentials to secure TLS controllers.",
        });
      }
    });
  }

  // 8. Mixed Content Audit
  const srcMatches = rawHtml.match(/src="http:\/\/[^"]+/g) || [];
  const linkMatches = rawHtml.match(/href="http:\/\/[^"]+/g) || [];
  const insecureAssets = [...new Set([...srcMatches, ...linkMatches])]
    .map(match => match.split('"')[1])
    // Filter out external plain HTTP links, we only care about loading active assets
    .filter(asset => asset && (asset.endsWith(".js") || asset.endsWith(".css") || asset.endsWith(".png") || asset.endsWith(".jpg") || asset.endsWith(".gif")));

  if (isHttps && insecureAssets.length > 0) {
    score -= 15;
    issues.push({
      item: "mixed_content",
      severity: "MEDIUM",
      message: `Mixed content detected: Loaded ${insecureAssets.length} insecure assets over HTTP inside secure HTTPS template.`,
      recommendation: "Replace all static http:// paths with self-referencing absolute or relative secure https:// asset locations.",
      assets: insecureAssets.slice(0, 5), // show up to 5 examples
    });
  }

  return {
    url,
    score: Math.max(0, score),
    issues,
  };
}

/**
 * Aggregates individual page security reports to generate overall security health status.
 */
function aggregateReportSecurity(pageAudits) {
  if (pageAudits.length === 0) return { score: 0, issues: [] };

  const totalScore = pageAudits.reduce((acc, curr) => acc + curr.score, 0);
  const averageScore = Math.round(totalScore / pageAudits.length);

  const pooledIssues = {};

  pageAudits.forEach((audit) => {
    audit.issues.forEach((issue) => {
      const key = `${issue.item}:${issue.message}`;
      if (!pooledIssues[key]) {
        pooledIssues[key] = {
          category: "security",
          severity: issue.severity,
          title: issue.message,
          description: issue.recommendation,
          recommendation: issue.recommendation,
          affectedUrls: [audit.url],
        };
      } else {
        if (!pooledIssues[key].affectedUrls.includes(audit.url)) {
          pooledIssues[key].affectedUrls.push(audit.url);
        }
      }
    });
  });

  return {
    score: averageScore,
    issues: Object.values(pooledIssues),
  };
}

module.exports = {
  analyzePageSecurity,
  aggregateReportSecurity,
};
