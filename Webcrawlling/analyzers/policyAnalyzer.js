/**

 *
 * @module policyAnalyzer
 */

"use strict";

const { extractGstin, extractCin } = require("../crawler/engine");


const SIGNAL_WEIGHTS = {
  urlExact: 40,  // URL slug perfectly matches a keyword (e.g. /refund-policy)
  urlPartial: 20,  // URL contains keyword as substring
  titleExact: 30,  // <title> tag exactly matches keyword phrase
  titlePartial: 15,  // <title> contains keyword
  h1: 25,  // H1 heading matches keyword
  h2: 12,  // H2 heading matches keyword
  bodyDensity: 8,  // Keyword occurs ≥3 times in body text
  footerLink: 18,  // Link in footer/nav area anchors to this page
};


const MIN_CONFIDENCE_THRESHOLD = 30;

const POLICY_DETECTORS = {

  // --------------------------------------------------------------------------
  privacy: {
    name: "Privacy Policy",
    severity: "HIGH",

    urlKeywords: [
      "privacy", "privacy-policy", "privacy-statement", "data-policy",
      "data-protection", "cookie-policy", "data-privacy", "privacypolicy",
      "privacy_policy", "data-notice", "personal-data",
    ],

    titleKeywords: [
      "privacy policy", "privacy statement", "data protection policy",
      "cookie policy", "data privacy", "personal data policy",
      "data protection notice", "privacy notice",
    ],

    headingKeywords: [
      "privacy policy", "privacy statement", "data protection",
      "our privacy", "your privacy", "personal data", "privacy notice",
      "data protection policy",
    ],

    bodyKeywords: [
      "personal information", "data retention", "consent",
      "grievance officer", "aadhaar", "pan card", "kyc",
      "bank account", "transaction monitoring", "dpdp", "gdpr",
      "upi", "right to erasure", "data fiduciary",
    ],
  },

  // --------------------------------------------------------------------------
  terms: {
    name: "Terms & Conditions / Terms of Use",
    severity: "HIGH",

    urlKeywords: [
      "terms", "terms-and-conditions", "terms-of-service", "terms-of-use",
      "tos", "user-agreement", "customer-agreement", "merchant-agreement",
      "legal", "acceptable-use", "termsandconditions", "terms_conditions",
      "use-terms",
      "website-terms",
      "general-terms",
      "service-terms",
      "legal-notice",
      "legal-policy",
    ],

    titleKeywords: [
      "terms and conditions", "terms of service", "terms of use",
      "user agreement", "customer agreement", "merchant agreement",
      "legal terms", "terms & conditions", "acceptable use policy",
      "website terms",
      "general terms",
      "service terms",
      "legal notice",
    ],

    headingKeywords: [
      "terms and conditions", "terms of service", "terms of use",
      "user agreement", "merchant terms", "customer agreement",
      "legal agreement", "governing terms", "terms & conditions",
      "website terms",
      "usage policy",
      "conditions of use",
    ],

    bodyKeywords: [
      "governing law", "arbitration", "jurisdiction", "liability",
      "indemnification", "termination", "suspension", "acceptable use",
      "merchant agreement", "binding agreement", "force majeure",
    ],
  },

  // --------------------------------------------------------------------------
  refund: {
    name: "Refund & Cancellation Policy",
    severity: "MEDIUM",

    urlKeywords: [
      "refund", "refund-policy", "refunds", "cancellation", "cancel",
      "cancellations", "return", "returns", "return-policy", "replacement",
      "exchange", "money-back", "chargeback", "billing-policy",
      "payment-policy", "refund-and-cancellation", "refund-and-cancellations",
      "refund-cancellation", "refund-cancellations",
      "returns-and-refunds", "refunds-and-cancellations",
      "transaction-reversal", "failed-transaction", "dispute",
      "cancellationpolicy", "refundpolicy", "refundandcancellation",
    ],

    titleKeywords: [
      "refund policy", "cancellation policy", "return policy",
      "refund and cancellation", "refund and cancellations",
      "refunds and cancellations", "cancellations and refunds",
      "refund & cancellation", "refund & cancellations",
      "returns and refunds", "money back",
      "payment refund", "chargeback policy",
      "transaction reversal", "exchange policy", "replacement policy",
      "refund timeline", "merchant refund",
      "cancellation and refund", "cancellations and refund",
    ],

    headingKeywords: [
      "refund policy", "cancellation policy", "return & refund",
      "refund and cancellation", "refund and cancellations",
      "refunds and cancellations", "cancellation and refund",
      "cancellations and refund", "our refund", "payment refund",
      "refund timeline", "failed transaction", "transaction reversal",
      "chargeback", "wallet reversal", "merchant refund", "money back",
      "refund & cancellation", "refund & cancellations",
    ],

    bodyKeywords: [
      "refund", "cancellation", "chargeback", "failed transaction",
      "transaction reversal", "refund processing", "merchant refund",
      "wallet reversal", "refund timeline", "money back",
      "payment policy", "business days", "dispute",
    ],
  },
};

// ============================================================================
// SECTION 2: CLAUSE DETECTION CONFIGURATION
// ============================================================================

/**
 * Clause validation profiles.
 * Detection requires ≥ minMatches pattern hits to mark as detected.
 * This prevents single-word false positives.
 */
const CLAUSE_DETECTORS = {

  dataCollection: {
    name: "Data Collection & Cookie Consent",
    minMatches: 2,
    patterns: [
      /collect(?:s|ing|ion)?\s+(?:your\s+)?(?:personal\s+)?(?:data|information)/i,
      /\bcookies?\b/i,
      /\bpersonal\s+(?:data|information)\b/i,
      /\bip\s+address(?:es)?\b/i,
      /information\s+(?:we\s+)?(?:collect|gather|process)/i,
      /data\s+(?:we\s+)?(?:collect|process|store)/i,
      /\btracking\s+(?:pixel|technology|cookies?)\b/i,
      /log\s+(?:files?|data|information)/i,
    ],
  },

  dataRetention: {
    name: "Data Retention & Deletion Rights",
    minMatches: 2,
    patterns: [
      /data\s+retention/i,
      /retain(?:ed|ing|s)?\s+(?:your\s+)?(?:data|information|records?)/i,
      /right\s+to\s+(?:erasure|deletion|be\s+forgotten)/i,
      /delete\s+(?:your\s+)?(?:account|data|information)/i,
      /\bpurging?\s+(?:data|records?|information)\b/i,
      /storage\s+(?:period|duration|limit)/i,
      /how\s+long\s+(?:we\s+)?(?:keep|store|retain)/i,
    ],
  },

  liability: {
    name: "Limitation of Liability",
    minMatches: 2,
    patterns: [
      /limitation\s+of\s+liability/i,
      /\bnot\s+(?:be\s+)?liable\b/i,
      /\bno\s+(?:warranty|warranties|guarantee)\b/i,
      /as[- ]is\s+basis/i,
      /maximum\s+extent\s+permitted\s+by\s+(?:applicable\s+)?law/i,
      /\bindemnif(?:y|ication|ied)\b/i,
      /\bdisclaimer\s+of\s+(?:warranties?|liability)\b/i,
      /aggregate\s+liability/i,
      /consequential\s+damages/i,
    ],
  },

  refundConditions: {
    name: "Refund Conditions & Cancellation Terms",
    minMatches: 3,
    patterns: [
      /\brefund(?:s|ed|ing|able)?\b/i,
      /\bcancel(?:lation|led|ing)?\b/i,
      /\bchargeback\b/i,
      /\btransaction\s+(?:reversal|failure|failed)\b/i,
      /(?:\d+)\s+(?:business\s+)?days?\s+(?:for\s+)?(?:refund|processing|credit)/i,
      /money\s+(?:back|returned|refunded)/i,
      /\bmerchant\s+refund\b/i,
      /\bwallet\s+(?:reversal|credit|refund)\b/i,
      /\bpayment\s+(?:reversal|failed|failure)\b/i,
      /\brefund\s+(?:timeline|period|processing)\b/i,
    ],
  },

  userObligations: {
    name: "User Obligations & Prohibited Use",
    minMatches: 2,
    patterns: [
      /user\s+(?:obligations?|responsibilities|duties)/i,
      /prohibited\s+(?:use|activities|actions|conduct)/i,
      /\bmust\s+not\b/i,
      /\byou\s+(?:agree\s+to|shall\s+not|must\s+not)\b/i,
      /\bsole\s+(?:risk|responsibility)\b/i,
      /\bacceptable\s+use\b/i,
      /\bmisuse\b|\babuse\b/i,
      /\bunlawful\b|\billegal\b/i,
    ],
  },


  governingLaw: {
    name: "Governing Law & Jurisdiction",
    minMatches: 2,
    patterns: [
      /governing\s+law/i,
      /\bjurisdiction\b/i,
      /\barbitration\b/i,
      /laws?\s+of\s+(?:india|republic\s+of\s+india)/i,
      /\bindelhi\b|\bmumbai\b|\bbangalore\b/i,
      /\bcourts?\s+of\s+(?:india|delhi|mumbai|bengaluru|chennai|hyderabad)\b/i,
      /\bindian\s+(?:law|courts?|jurisdiction)\b/i,
      /\bcivil\s+(?:court|procedure)\b/i,
    ],
  },
};


// ============================================================================
// SECTION 4: POLICY IDENTIFICATION ENGINE (Best-Match Scoring)
// ============================================================================

/**
 * Extracts the URL path slug for keyword matching.
 * Strips query strings, fragments, and normalises separators.
 *
 * @param {string} rawUrl - Full page URL.
 * @returns {string} Normalised lowercase URL path.
 */
function normaliseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return (parsed.pathname + parsed.search).toLowerCase().replace(/[_/]/g, "-");
  } catch (_) {
    return (rawUrl || "").toLowerCase().replace(/[_/]/g, "-");
  }
}

/**
 * Counts occurrences of a keyword in a body text string.
 * Returns true if keyword appears ≥ threshold times.
 *
 * @param {string} body  - Normalised body text.
 * @param {string} kw    - Keyword phrase to count.
 * @param {number} threshold - Minimum occurrence count.
 * @returns {boolean}
 */
function keywordDense(body, kw, threshold = 3) {
  if (!body || !kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = body.match(new RegExp(escaped, "gi"));
  return matches ? matches.length >= threshold : false;
}

/**
 * Scores a single crawled page against a policy detector profile.
 * Returns a numeric confidence score (0 = no match, higher = stronger signal).
 *
 * @param {object} page     - Crawled CrawlPage document.
 * @param {object} detector - POLICY_DETECTORS entry.
 * @returns {number} Confidence score.
 */
function scorePageForPolicy(page, detector) {
  let score = 0;

  const normUrl = normaliseUrl(page.url || "");
  const normTitle = (page.title || "").toLowerCase();
  const normBody = (page.rawText || "").toLowerCase();

  // Concatenate all headings for H1/H2 checks
  const headings = Array.isArray(page.headings) ? page.headings : [];
  const h1Text = headings.filter(h => h.tag === "h1").map(h => (h.text || "").toLowerCase()).join(" ");
  const h2Text = headings.filter(h => h.tag === "h2").map(h => (h.text || "").toLowerCase()).join(" ");

  // --- URL matching ---
  for (const kw of detector.urlKeywords) {
    if (normUrl === `/${kw}` || normUrl.includes(`/${kw}`) || normUrl.endsWith(kw)) {
      score += SIGNAL_WEIGHTS.urlExact;
      break; // Only count once per best hit
    }
  }
  if (score === 0) {
    for (const kw of detector.urlKeywords) {
      if (normUrl.includes(kw)) {
        score += SIGNAL_WEIGHTS.urlPartial;
        break;
      }
    }
  }

  // --- Title matching ---
  let titleMatched = false;
  for (const kw of detector.titleKeywords) {
    if (normTitle === kw) {
      score += SIGNAL_WEIGHTS.titleExact;
      titleMatched = true;
      break;
    }
  }
  if (!titleMatched) {
    for (const kw of detector.titleKeywords) {
      if (normTitle.includes(kw)) {
        score += SIGNAL_WEIGHTS.titlePartial;
        break;
      }
    }
  }

  // --- H1 heading matching ---
  for (const kw of detector.headingKeywords) {
    if (h1Text.includes(kw)) {
      score += SIGNAL_WEIGHTS.h1;
      break;
    }
  }

  // --- H2 heading matching ---
  for (const kw of detector.headingKeywords) {
    if (h2Text.includes(kw)) {
      score += SIGNAL_WEIGHTS.h2;
      break;
    }
  }

  // --- Dense body occurrence matching ---
  for (const kw of detector.bodyKeywords) {
    if (keywordDense(normBody, kw, 3)) {
      score += SIGNAL_WEIGHTS.bodyDensity;
      break;
    }
  }

  return score;
}

/**
 * Scores a footer/nav link (text + href) for a policy detector.
 * Returns a score contribution if the link is a strong match.
 *
 * @param {object} link     - { url: string, text: string }
 * @param {object} detector - POLICY_DETECTORS entry.
 * @returns {number} Score contribution (0 or SIGNAL_WEIGHTS.footerLink).
 */
function scoreLinkForPolicy(link, detector) {
  const linkUrl = normaliseUrl(link.url || "");
  const linkText = (link.text || "").toLowerCase();

  const urlHit = detector.urlKeywords.some(kw => linkUrl.includes(kw));
  const textHit = detector.titleKeywords.some(kw => linkText.includes(kw));

  return (urlHit || textHit) ? SIGNAL_WEIGHTS.footerLink : 0;
}

/**
 * Identifies policy pages from all crawled pages using best-match scoring.
 * Replaces the legacy "first-match wins" approach.
 *
 * Algorithm:
 *   1. For each policy type, score every crawled page.
 *   2. If no page clears MIN_CONFIDENCE_THRESHOLD, fall back to scoring
 *      footer/nav links on the home page and resolving the linked page.
 *   3. Select the highest-scoring page above the threshold.
 *
 * @param {Array<object>} pages - All CrawlPage documents.
 * @returns {object} { privacy, terms, refund } — each with { found, url, text, score }.
 */
function identifyPolicies(pages) {
  const result = {
    privacy: { found: false, url: null, text: "", score: 0 },
    terms: { found: false, url: null, text: "", score: 0 },
    refund: { found: false, url: null, text: "", score: 0 },
  };

  if (!Array.isArray(pages) || pages.length === 0) return result;

  // Build a lookup map: url → page for O(1) link resolution
  const pageByUrl = new Map();
  pages.forEach(p => {
    if (p.url) pageByUrl.set(p.url, p);
  });

  // --- Phase 1: Score all crawled pages ---
  for (const [policyKey, detector] of Object.entries(POLICY_DETECTORS)) {
    let bestScore = 0;
    let bestPage = null;

    for (const page of pages) {
      let score = scorePageForPolicy(page, detector);

      // --- REFUND POLICY OVERRIDE ---
      if (policyKey === "refund") {

        const refundIndicators = [
          "refund",
          "refunds",
          "refund policy",
          "refund and cancellation",
          "refund and cancellations",
          "cancellation",
          "chargeback",
          "chargebacks",
          "merchant settlement",
          "wallet reversal",
          "transaction dispute",
          "transaction reversal",
          "refund processing",
          "refund timeline",
          "business days",
          "working days",
          "money back",
          "refund amount",
          "failed transaction",
          "disputed amount",
        ];

        const body = (page.rawText || "").toLowerCase();

        let refundKeywordMatches = 0;

        for (const keyword of refundIndicators) {
          if (body.includes(keyword)) {
            refundKeywordMatches++;
          }
        }

        // Embedded refund section inside Terms page
        const isTermsPage =
          body.includes("terms and conditions") ||
          body.includes("terms of use") ||
          body.includes("terms of service");

        if (refundKeywordMatches >= 4) {

          score += 80;

          if (isTermsPage) {
            score += 40;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPage = page;
      }
    }

    if (bestScore >= MIN_CONFIDENCE_THRESHOLD && bestPage) {
      result[policyKey] = {
        found: true,
        url: bestPage.url,
        text: bestPage.rawText || "",
        score: bestScore,
      };
    }
  }

  // --- Phase 2: Footer/nav link fallback for unresolved policies ---
  const homePage = pages.find(p => p.depth === 0) || pages[0];
  if (!homePage || !Array.isArray(homePage.links)) return result;

  for (const [policyKey, detector] of Object.entries(POLICY_DETECTORS)) {
    if (result[policyKey].found) continue; // already resolved

    let bestScore = 0;
    let bestLinkPage = null;
    let bestLinkUrl = null;

    for (const link of homePage.links) {
      const linkScore = scoreLinkForPolicy(link, detector);
      if (linkScore > 0) {
        const linkedPage = pageByUrl.get(link.url);
        if (linkedPage) {
          // Additional confirmation: score the linked page itself
          const pageScore = scorePageForPolicy(linkedPage, detector);
          const combined = linkScore + pageScore;
          if (combined > bestScore) {
            bestScore = combined;
            bestLinkPage = linkedPage;
            bestLinkUrl = link.url;
          }
        } else if (linkScore > bestScore) {
          // Page wasn't crawled — use the link signal alone
          bestScore = linkScore;
          bestLinkUrl = link.url;
        }
      }
    }

    // Threshold: 18 = footerLink hit alone (page not crawled), 30 = page also scored
    const threshold = bestLinkPage ? MIN_CONFIDENCE_THRESHOLD : SIGNAL_WEIGHTS.footerLink;
    if (bestScore >= threshold) {
      result[policyKey] = {
        found: true,
        url: bestLinkPage ? bestLinkPage.url : bestLinkUrl,
        text: bestLinkPage ? (bestLinkPage.rawText || "") : "",
        score: bestScore,
      };
    }
  }

  for (const [policyKey, detector] of Object.entries(POLICY_DETECTORS)) {
    if (result[policyKey].found) continue; // already resolved

    const bodyKeywords = detector.bodyKeywords || [];
    const titleKeywords = detector.titleKeywords || [];
    const headingKeywords = detector.headingKeywords || [];
    const allKeywords = [...bodyKeywords, ...titleKeywords, ...headingKeywords];

    if (allKeywords.length === 0) continue;

    let bestBodyScore = 0;
    let bestBodyPage = null;

    for (const page of pages) {
      const rawText = (page.rawText || "").toLowerCase();
      if (!rawText) continue;

      // Count how many distinct keywords appear in the body text
      let hits = 0;
      for (const kw of allKeywords) {
        if (rawText.includes(kw.toLowerCase())) hits++;
      }
      // Weight by keyword density
      const density = hits / allKeywords.length;
      const bodyScore = Math.round(density * 60); // max 60 pts

      if (bodyScore > bestBodyScore) {
        bestBodyScore = bodyScore;
        bestBodyPage = page;
      }
    }

    // Accept body-text detection if score >= 30 (~50% keyword coverage)
    if (bestBodyScore >= 30 && bestBodyPage) {
      result[policyKey] = {
        found: true,
        url: bestBodyPage.url,
        text: bestBodyPage.rawText || "",
        score: bestBodyScore,
        detectedVia: "body-text-scan",
      };
    }
  }

  return result;
}


/**
 * Counts how many regex patterns in a clause detector match the given text.
 *
 * @param {string} text         - Policy page raw text.
 * @param {object} clauseDet    - CLAUSE_DETECTORS entry.
 * @returns {{ detected: boolean, matchCount: number, confidence: number }}
 */
function scoreClauseInText(text, clauseDet) {
  if (!text || text.length < 200) {
    // Too short to be a real policy document
    return { detected: false, matchCount: 0, confidence: 0 };
  }

  let matchCount = 0;
  for (const pattern of clauseDet.patterns) {
    if (pattern.test(text)) matchCount++;
  }

  const detected = matchCount >= clauseDet.minMatches;
  const confidence = Math.round((matchCount / clauseDet.patterns.length) * 100);

  return { detected, matchCount, confidence };
}

/**
@param {object} identifiedPolicies - Output of identifyPolicies().
 * @returns {object} clauseChecks map keyed by CLAUSE_DETECTORS keys.
 */
function analyzePolicyClauses(identifiedPolicies) {
  // Initialise result structure
  const clauseChecks = {};
  for (const clauseKey of Object.keys(CLAUSE_DETECTORS)) {
    clauseChecks[clauseKey] = {
      detected: false,
      confidence: 0,
      pagesFound: [],
    };
  }

  // Scan text of all detected policy pages
  for (const [policyKey, policy] of Object.entries(identifiedPolicies)) {
    if (!policy.found || !policy.text) continue;

    for (const [clauseKey, clauseDet] of Object.entries(CLAUSE_DETECTORS)) {
      const { detected, confidence } = scoreClauseInText(policy.text, clauseDet);

      if (detected) {
        clauseChecks[clauseKey].detected = true;

        // Record the highest confidence across policy pages
        if (confidence > clauseChecks[clauseKey].confidence) {
          clauseChecks[clauseKey].confidence = confidence;
        }

        if (!clauseChecks[clauseKey].pagesFound.includes(policyKey)) {
          clauseChecks[clauseKey].pagesFound.push(policyKey);
        }
      }
    }
  }

  return clauseChecks;
}



/**

/**
 * @param {object} identifiedPolicies - identifyPolicies() result.
 * @param {object} clauseChecks       - analyzePolicyClauses() result.
 * @returns {Array<object>} issues[]
 */
function compileIssues(identifiedPolicies, clauseChecks) {
  const issues = [];

  // 1. Missing policy pages
  for (const [key, detector] of Object.entries(POLICY_DETECTORS)) {
    if (!identifiedPolicies[key].found) {
      issues.push({
        category: "compliance",
        severity: detector.severity,
        title: `Missing Required Policy: ${detector.name}`,
        description: `No dedicated ${detector.name} page was detected during the crawl. ` +
          `This is a regulatory requirement for operating in India.`,
        recommendation: `Draft and publish a comprehensive ${detector.name} that satisfies ` +
          `applicable guidelines, the DPDP Act 2023, and consumer protection norms.`,
        affectedUrls: [],
      });
    }
  }

  // 2. Missing critical clauses inside found policies
  const clauseSeverityMap = {
    dataCollection: "HIGH",
    dataRetention: "HIGH",
    liability: "MEDIUM",
    refundConditions: "HIGH",
    userObligations: "MEDIUM",
    governingLaw: "MEDIUM",
  };

  for (const [clauseKey, clauseDet] of Object.entries(CLAUSE_DETECTORS)) {
    if (!clauseChecks[clauseKey].detected) {
      issues.push({
        category: "compliance",
        severity: clauseSeverityMap[clauseKey] || "MEDIUM",
        title: `Incomplete Policy Content: Missing '${clauseDet.name}' Clause`,
        description: `Scanned policy documents do not contain sufficient verbiage for ` +
          `'${clauseDet.name}'. This clause is required for legal completeness and user trust.`,
        recommendation: `Add a dedicated '${clauseDet.name}' section to the relevant ` +
          `policy document (Privacy Policy or Terms and Conditions).`,
        affectedUrls: [],
      });
    }
  }

  return issues;
}


/**
 * @param {object} identifiedPolicies
 * @param {object} clauseChecks
 * @returns {{ overall: number, policyScore: number, clauseScore: number }}
 */
function calculateScores(identifiedPolicies, clauseChecks) {
  const totalPolicies = Object.keys(POLICY_DETECTORS).length;
  const foundPolicies = Object.values(identifiedPolicies).filter(p => p.found).length;
  const policyScore = Math.round((foundPolicies / totalPolicies) * 100);

  const totalClauses = Object.keys(CLAUSE_DETECTORS).length;
  const foundClauses = Object.values(clauseChecks).filter(c => c.detected).length;
  const clauseScore = Math.round((foundClauses / totalClauses) * 100);

  const overall = Math.round(
    policyScore * 0.50 +
    clauseScore * 0.50
  );

  return { overall, policyScore, clauseScore };
}


/**
 * @param {Array<object>} pages - Array of CrawlPage Mongoose documents.
 * @returns {object} Full compliance report.
 */
function auditPoliciesAndCompliance(pages) {
  // Gracefully handle empty or invalid input
  if (!Array.isArray(pages) || pages.length === 0) {
    return {
      score: 0,
      status: {
        hasPrivacyPolicy: false,
        hasTermsPolicy: false,
        hasRefundPolicy: false,
        completenessPercent: 0,
      },
      clauses: {},
      fintechIndicators: {},
      issues: [{
        category: "compliance",
        severity: "HIGH",
        title: "Policy Audit Failed: No Pages Available",
        description: "The compliance engine received no crawled pages to analyse.",
        recommendation: "Ensure the crawler successfully fetched page content before running the policy audit.",
        affectedUrls: [],
      }],
    };
  }

  // --- Step 1: Identify policy pages using best-match scoring ---
  const identifiedPolicies = identifyPolicies(pages);

  // --- Step 2: Analyse clause completeness in found policy pages ---
  const clauseChecks = analyzePolicyClauses(identifiedPolicies);

  // --- Step 3: Calculate weighted scores ---
  const scores = calculateScores(identifiedPolicies, clauseChecks);

  // --- Step 4: Compile structured issue list ---
  const issues = compileIssues(identifiedPolicies, clauseChecks);

  // --- Step 5: Build clause summary (Boolean map for consumers) ---
  const clauseSummary = {};
  for (const [key, check] of Object.entries(clauseChecks)) {
    clauseSummary[key] = check.detected;
  }

  return {
    // Primary compliance score (0–100), consumed by riskEngine.js and CrawlReport
    score: scores.overall,

    // Breakdown scores for detailed reporting
    scoreBreakdown: {
      policyPresence: scores.policyScore,
      clauseCompleteness: scores.clauseScore,
    },

    // Boolean status flags — consumed by riskEngine.js
    status: {
      hasPrivacyPolicy: identifiedPolicies.privacy.found,
      hasTermsPolicy: identifiedPolicies.terms.found,
      hasRefundPolicy: identifiedPolicies.refund.found,
      completenessPercent: scores.policyScore,
    },

    // Detailed info on identified policy pages (URL + confidence score)
    identifiedPages: {
      privacy: {
        found: identifiedPolicies.privacy.found,
        url: identifiedPolicies.privacy.url,
        confidenceScore: identifiedPolicies.privacy.score,
      },
      terms: {
        found: identifiedPolicies.terms.found,
        url: identifiedPolicies.terms.url,
        confidenceScore: identifiedPolicies.terms.score,
      },
      refund: {
        found: identifiedPolicies.refund.found,
        url: identifiedPolicies.refund.url,
        confidenceScore: identifiedPolicies.refund.score,
      },
    },

    clauses: clauseSummary,

    issues,
  };
}


function extractCompanyNames(text) {

  const normalized = (text || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const found = new Map();

  const legalPatterns = [

    /\b([A-Z][A-Za-z0-9&.,\- ]{2,80}(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|LLP|Ltd\.?|Limited))\b/g,

    /\\b([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+){0,2}\\s+(?:Technology|Technologies|Enterprise|Enterprises))\\b/g,

  ];

  const ownershipPatterns = [

    /owned\s+and\s+operated\s+by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80})/gi,

    /operated\s+by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80})/gi,

    /owned\s+by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80})/gi,

    /company\s+name\s*[:\-]\s*([A-Z][A-Za-z0-9&.,\- ]{2,80})/gi,

    /legal\s+entity\s*[:\-]\s*([A-Z][A-Za-z0-9&.,\- ]{2,80})/gi,
  ];

  const blacklist = [
    "Privacy Policy",
    "Terms & Conditions",
    "Refund Policy",
    "All Rights Reserved",
    "Custom Software Solutions",
    "Tailored Solutions",
    "ERP Solutions",
    "Advanced Technology",
    "Innovative Solutions",
    "Smart Solutions",
    "Scalable Solutions",
    "Education Technology",
    "Healthcare Software",
    "Transportation Solutions",
    "Retail Solutions",
    "Business Development Solutions"
  ];

  legalPatterns.forEach((pattern) => {

    let match;

    while ((match = pattern.exec(normalized)) !== null) {

      const company = match[1].trim();

      const rejectWords = [
  "contact",
  "about",
  "choose",
  "development",
  "solutions",
  "services",
  "technology partner",
  "incident",
  "response",
  "custom",
  "blockchain",
  "ethereum",
  "polygon",
  "cardano",
  "solana"
];

const lowerCompany = company.toLowerCase();

if (
  rejectWords.some(word =>
    lowerCompany.includes(word)
  )
) {
  continue;
}

      if (
        company.length > 3 &&
        company.split(" ").length <= 6 &&
        !blacklist.includes(company)
      ) {
        found.set(company.toLowerCase(), company);
      }
    }
  });

  ownershipPatterns.forEach((pattern) => {

    let match;

    while ((match = pattern.exec(normalized)) !== null) {

      const company = match[1]
        .split(".")[0]
        .trim();

      if (
        company.length > 3 &&
        company.split(" ").length <= 6 &&
        !blacklist.includes(company)
      ) {
        found.set(company.toLowerCase(), company);
      }
    }
  });

  return [...found.values()].slice(0, 10);
}

/**
 * @param {object} identifiedPolicies - Output of identifyPolicies()
 * @returns {object} extractedEntities
 */
function extractPolicyEntities(identifiedPolicies) {
  const entities = {
    companyNames: [],
    addresses: [],
    gstin: [],
    cin: [],
    grievanceOfficer: null,
    supportEmails: [],
    refundTimeline: null,
  };

  const allText = Object.values(identifiedPolicies)
    .filter(p => p.found && p.text)
    .map(p => p.text)
    .join("\n\n");

  if (!allText) return entities;

  const cleanedText = allText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleanPolicyText = (t) => {
    return (t || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const privacyText = cleanPolicyText(identifiedPolicies.privacy?.text || "");
  const termsText = cleanPolicyText(identifiedPolicies.terms?.text || "");
  const refundText = cleanPolicyText(identifiedPolicies.refund?.text || "");

  // Company/Legal entity names
  const privacyCompanies = extractCompanyNames(privacyText);
  const termsCompanies = extractCompanyNames(termsText);
  const refundCompanies = extractCompanyNames(refundText);

  entities.companyNames = [
    ...new Set([
      ...privacyCompanies,
      ...termsCompanies,
      ...refundCompanies,
    ])
  ];

  // Emails - removed extraction per user request
  entities.supportEmails = [];

  // Addresses — extracted by engine.js; not duplicated here
  entities.addresses = [];

  // GSTIN & CIN from Policy Texts
  entities.gstin = extractGstin(cleanedText);
  entities.cin = extractCin(cleanedText);


  // Grievance officer name
  const grievanceMatch = cleanedText.match(/(?:Grievance\s+Officer|Nodal\s+Officer)\s*[:\-]\s*([A-Z][a-zA-Z\s]{3,50})/i);
  if (grievanceMatch) {
    entities.grievanceOfficer = grievanceMatch[1].trim();
  }

  // Refund timeline commitment
  const refundTimelineMatch = cleanedText.match(/\d+(?:\s*[-–]\s*\d+)?\s+(?:business\s+|working\s+)?days?(?:\s+for\s+(?:refund|credit|processing))?/i);
  if (refundTimelineMatch) {
    entities.refundTimeline = refundTimelineMatch[0].trim();
  }

  return entities;
}

/**
 * @param {Array<object>} pages
 * @returns {object} Full compliance report including extractedEntities
 */
function auditPoliciesAndComplianceFull(pages) {
  const base = auditPoliciesAndCompliance(pages);

  // Run entity extraction on identified policy texts
  const rawPolicies = {
    privacy: { found: base.identifiedPages.privacy.found, url: base.identifiedPages.privacy.url, text: "" },
    terms: { found: base.identifiedPages.terms.found, url: base.identifiedPages.terms.url, text: "" },
    refund: { found: base.identifiedPages.refund.found, url: base.identifiedPages.refund.url, text: "" },
  };

  // Re-run identifyPolicies to get texts (needed for entity extraction)
  if (Array.isArray(pages) && pages.length > 0) {
    const identified = identifyPolicies(pages);
    rawPolicies.privacy.text = identified.privacy.text || "";
    rawPolicies.terms.text = identified.terms.text || "";
    rawPolicies.refund.text = identified.refund.text || "";
  }

  const extractedEntities = extractPolicyEntities(rawPolicies);

  return {
    ...base,
    extractedEntities,
  };
}

module.exports = {
  auditPoliciesAndCompliance,
  auditPoliciesAndComplianceFull,
  extractPolicyEntities,
};

