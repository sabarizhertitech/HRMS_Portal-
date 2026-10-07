
const SUSPICIOUS_KEYWORDS = [
  "guaranteed return",
  "get rich quick",
  "unregulated investment",
  "no risk trading",
  "double your money",
  "offshore bank",
  "guaranteed weekly payout",
];


// Phishing keywords/patterns in DOM
const PHISHING_INDICATORS = [
  "verify your ssn",
  "enter your pin code",
  "confirm online banking password",
  "secure transaction verification",
];

/**
 * Grades report items to build a risk profile.
 * 
 * @param {Array<object>} pages Crawled page objects.
 * @param {object} ssl SSL cert details.
 * @param {object} compliance Policy checklist details.
 * @param {Array<object>} brokenLinks List of broken/redirect links.
 * @param {object} aggregatedSEO SEO audit metrics.
 * @param {object} aggregatedSecurity Security audit metrics.
 * @returns {object} Calculated risk analysis report.
 */
function evaluateRiskProfile(pages, ssl, compliance, brokenLinks, aggregatedSEO, aggregatedSecurity) {
  const issues = [];
  let riskScore = 0; // starts at 0 (perfect, no risk), maxes out at 100 (extreme risk)

  const homePage = pages.find(p => p.depth === 0) || pages[0];
  const url = homePage ? homePage.url : "";

  const isHttps = url.toLowerCase().startsWith("https://");
  if (!isHttps && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    riskScore += 30;
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Security Violation: Site Serves Over Unencrypted Connection (No HTTPS)",
      description: "Critical data transmitted over plain HTTP is vulnerable to interception and active injection attacks by bad actors.",
      recommendation: "Acquire an SSL/TLS certificate and configure full-domain HTTPS enforcement.",
      affectedUrls: [url],
    });
  }

  // B. Missing Crucial Policies
  if (!compliance.status.hasPrivacyPolicy) {
    riskScore += 15;
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Compliance Failure: Missing Privacy Policy Page",
      description: "Hosting a website in modern jurisdictions without transparent privacy disclosures is a severe compliance violation.",
      recommendation: "Draft and launch a legally compliant Privacy Policy detailing user data protection standards.",
      affectedUrls: [],
    });
  }

  if (!compliance.status.hasTermsPolicy) {
    riskScore += 15;
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Compliance Failure: Missing Terms and Conditions",
      description: "Absence of client usage parameters exposes operations to infinite civil liability and transaction disputes.",
      recommendation: "Provide a Terms and Conditions page establishing account rights and legal boundaries.",
      affectedUrls: [],
    });
  }

  // C. Exposed .env credentials
  const hasEnvLeaks = aggregatedSecurity.issues.some(i => i.item === "env_keys_exposed" || i.title.includes("environment variable"));
  if (hasEnvLeaks) {
    riskScore += 25;
    const leakIssue = aggregatedSecurity.issues.find(i => i.item === "env_keys_exposed" || i.title.includes("environment variable"));
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Critical Vulnerability: Configuration Credentials Leak (.env exposed)",
      description: "Server variables or secret keys (e.g. AWS, database, JWT passwords) were exposed in scripts or public text.",
      recommendation: "Rotate compromised API secrets immediately and sanitize scripts to only load public values.",
      affectedUrls: leakIssue ? leakIssue.affectedUrls : [url],
    });
  }

  // D. Exposed Admin Routes
  const hasExposedAdmin = aggregatedSecurity.issues.some(i => i.item === "admin_route_exposed");
  if (hasExposedAdmin) {
    riskScore += 15;
    const adminIssue = aggregatedSecurity.issues.find(i => i.item === "admin_route_exposed");
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "High Vulnerability: Public Administrative Router Open",
      description: "Standard administrative panels (e.g. /admin, /wp-admin) are visible to unauthenticated internet traffic.",
      recommendation: "Isolate default administrative controllers behind restricted corporate networks or custom URL paths.",
      affectedUrls: adminIssue ? adminIssue.affectedUrls : [],
    });
  }

  // E. Suspicious Keywords or Phishing Signs in Body Content
  let suspiciousFound = [];
  let phishingFound = [];

  pages.forEach((page) => {
    const text = (page.rawText || "").toLowerCase();
    
    SUSPICIOUS_KEYWORDS.forEach((kw) => {
      if (text.includes(kw) && !suspiciousFound.includes(kw)) {
        suspiciousFound.push(kw);
      }
    });

    PHISHING_INDICATORS.forEach((kw) => {
      if (text.includes(kw) && !phishingFound.includes(kw)) {
        phishingFound.push(kw);
      }
    });
  });

  if (suspiciousFound.length > 0) {
    riskScore += 15;
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Trust Violation: Suspicious Marketing Keywords Detected",
      description: `Website text contains high-risk marketing expressions: [${suspiciousFound.join(", ")}].`,
      recommendation: "Ensure marketing materials align with SEC/FINRA regulations, avoiding non-compliant guarantees.",
      affectedUrls: [],
    });
  }

  if (phishingFound.length > 0) {
    riskScore += 25;
    issues.push({
      category: "risk",
      severity: "HIGH",
      title: "Threat Flag: Probable Phishing/Social Engineering Prompts detected",
      description: `Inputs or labels request suspicious banking information: [${phishingFound.join(", ")}].`,
      recommendation: "Sanitize form labels; ensure identity onboarding portals clearly specify secure transaction guidelines.",
      affectedUrls: [],
    });
  }

  const brokenLinksCount = brokenLinks.filter(l => l.isBroken).length;
  if (brokenLinksCount > 0) {
    const penalty = Math.min(10, brokenLinksCount * 2);
    riskScore += penalty;
    issues.push({
      category: "risk",
      severity: "MEDIUM",
      title: `Usability Warning: Broken URLs detected (${brokenLinksCount} dead links)`,
      description: "Scanning identified broken hypertext references that return invalid 404 or server failure statuses.",
      recommendation: "Remove or update outdated references to point to valid online targets.",
      affectedUrls: brokenLinks.filter(l => l.isBroken).slice(0, 5).map(l => l.url),
    });
  }

  // B. Missing SEO metadata
  const missingMetaCount = aggregatedSEO.issues.filter(i => i.severity === "HIGH").length;
  if (missingMetaCount > 0) {
    riskScore += 8;
    issues.push({
      category: "risk",
      severity: "MEDIUM",
      title: "SEO Failure: Core Metadata Tags Missing",
      description: "Crucial search engine descriptors (page titles or meta descriptions) are missing on crawled views.",
      recommendation: "Audit indexing guidelines and add compliant meta elements to all pages.",
      affectedUrls: [],
    });
  }

  // C. Weak Policy content
  let weakPolicies = [];
  if (compliance.status.hasPrivacyPolicy && compliance.score < 50) {
    weakPolicies.push("Privacy Policy");
  }
  if (compliance.status.hasTermsPolicy && compliance.score < 50) {
    weakPolicies.push("Terms of Service");
  }

  if (weakPolicies.length > 0) {
    riskScore += 8;
    issues.push({
      category: "risk",
      severity: "MEDIUM",
      title: `Compliance Warning: Extremely Weak Legal Disclosures (${weakPolicies.join(", ")})`,
      description: "Policy records are either too short or fail to satisfy essential compliance guidelines.",
      recommendation: "Perform an institutional compliance audit and populate policies with mandatory legal paragraphs.",
      affectedUrls: [],
    });
  }

  const missingAlts = aggregatedSEO.issues.find(i => i.item === "images_missing_alt");
  if (missingAlts) {
    riskScore += 4;
    issues.push({
      category: "risk",
      severity: "LOW",
      title: "Aesthetics Alert: Static Media Assets lacking Alternative Text (alt tags)",
      description: "Multiple image nodes are served without alt text, disrupting usability and search ranking structures.",
      recommendation: "Append short descriptions in alt attributes across all static image nodes.",
      affectedUrls: [],
    });
  }

  // B. Weak SEO layout/structure
  const headingsIssues = aggregatedSEO.issues.some(i => i.item === "h1_missing" || i.item === "h1_multiple");
  if (headingsIssues) {
    riskScore += 2;
    issues.push({
      category: "risk",
      severity: "LOW",
      title: "Usability Alert: Headings Hierarchy Inconsistencies",
      description: "Multiple H1 headings or missing structural headers disrupt reader focus and indexing frameworks.",
      recommendation: "Audit and reorganize headings to respect sequential thematic hierarchies.",
      affectedUrls: [],
    });
  }

  // Bound overall risk score between 0 and 100
  const finalRiskScore = Math.min(100, Math.max(0, riskScore));

  // Determine Severity Category
  let severity = "LOW";
  if (finalRiskScore >= 31 && finalRiskScore <= 60) {
    severity = "MEDIUM";
  } else if (finalRiskScore > 60) {
    severity = "HIGH";
  }

  return {
    score: finalRiskScore,
    severity: severity,
    issues: issues,
  };
}

module.exports = {
  evaluateRiskProfile,
};
