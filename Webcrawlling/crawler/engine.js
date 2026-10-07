"use strict";

const { chromium } = require("playwright");
const cheerio = require("cheerio");
const { URL } = require("url");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const { CrawlPage } = require("../../Models/CrawlReport");
const { detectTechnologies } = require("../analyzers/techDetector");
const { analyzeEmails } = require("../analyzers/emailAnalyzer");
const { detectAndTestPageForms } = require("../analyzers/formValidator");

// ============================================================================
// SECTION 1: LOGGING HELPER
// ============================================================================

async function writeLog(jobId, message, level = "info", stage = "crawl") {
  const prefix = `[Engine][${stage.toUpperCase()}][${level.toUpperCase()}]`;
  if (level === "error" || level === "warn") {
    console.error(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }

  if (jobId) {
    const jobKey = jobId.toString();
    if (!global.crawlJobLogs) global.crawlJobLogs = new Map();
    if (!global.crawlJobLogs.has(jobKey)) global.crawlJobLogs.set(jobKey, []);
    global.crawlJobLogs.get(jobKey).push({
      message: `${prefix} ${message}`,
      level,
      timestamp: new Date()
    });
  }
}

// ============================================================================
// SECTION 2: URL UTILITIES
// ============================================================================

function normalizeUrl(rawUrl, baseUrl) {
  try {
    const resolved = new URL(rawUrl, baseUrl);
    resolved.hash = "";
    let pathname = resolved.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
    return {
      url: `${resolved.protocol}//${resolved.host}${pathname}${resolved.search}`,
      host: resolved.host,
      hostname: resolved.hostname,
      pathname,
      protocol: resolved.protocol,
      search: resolved.search,
      isValid: ["http:", "https:"].includes(resolved.protocol),
    };
  } catch {
    return { url: null, isValid: false };
  }
}

function cleanQueryParams(url) {
  return url
    .replace(/([?&])(session_id|sid|ref|token|csrf|nonce|utm_[^=]+)=[^&]+(&|$)/gi, "$1")
    .replace(/&$/, "")
    .replace(/\?$/, "");
}

// ============================================================================
// SECTION 3: SSRF PROTECTION
// ============================================================================

function isPrivateHostname(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^0\.0\.0\.0$/.test(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  return false;
}

// ============================================================================
// SECTION 4: PAGE TYPE DETECTION
// ============================================================================

function detectPageType(pathname, title, h1Text, rawText) {
  const p = (pathname || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const h = (h1Text || "").toLowerCase();
  const b = (rawText || "").slice(0, 2000).toLowerCase();

  const check = (...terms) => terms.some(term => p.includes(term) || t.includes(term) || h.includes(term));

  if (p === "/" || p === "" || p === "/home" || p === "/index") return "home";
  if (check("login", "signin", "sign-in", "log-in")) return "login";
  if (check("privacy", "data-protection", "privacy-policy", "data-policy")) return "privacy";
  if (check("terms", "tos", "terms-of-service", "terms-and-conditions", "user-agreement", "legal")) return "terms";
  if (check("refund", "cancellation", "return-policy", "money-back", "chargeback")) return "refund";
  if (check("contact", "contact-us", "reach-us", "support", "help", "customer-care", "customer-support", "locations", "office", "branches")) return "contact";
  if (check("about", "about-us", "our-story", "who-we-are")) return "about";
  if (check("dashboard", "portal", "panel", "console")) return "dashboard";
  if (check("pricing", "plans", "subscription")) return "pricing";
  if (check("blog", "news", "articles", "press", "resources")) return "blog";
  if (b.includes("404") && (b.includes("not found") || b.includes("page not found"))) return "error";

  return "general";
}

// ============================================================================
// SECTION 5: UNIVERSAL EXTRACTION HELPERS
// ============================================================================

function normalizeWhitespace(text) {
  if (!text) return "";
  return text
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u2024\u2027]/g, ".")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VALID_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "co", "in",
  "us", "uk", "ca", "au", "de", "fr", "jp", "cn", "ru", "br",
  "info", "biz", "name", "pro", "mobi", "tel", "asia", "tv", "me",
  "app", "dev", "tech", "ai", "cloud", "online", "site", "store",
  "xyz", "club", "live", "shop", "blog", "news", "agency", "studio",
  "global", "world", "group", "company", "today", "digital", "media",
]);

// ============================================================================
// ✅ FIXED: EMAIL EXTRACTION
// ============================================================================

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  email = email.toLowerCase().trim();

  // ✅ FIX: Strip mailto: prefix if present
  email = email.replace(/^mailto:/i, "").trim();

  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;

  // ✅ FIX: Allow wider local part characters
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._%+\-]*$/.test(local)) return false;
  if (local.length < 1 || local.length > 64) return false;
  if (!domain.includes(".")) return false;

  const domainParts = domain.split(".");
  const tld = domainParts[domainParts.length - 1];
  if (!/^[a-z]{2,10}$/.test(tld)) return false;
  if (tld.length > 6 && !VALID_TLDS.has(tld)) return false;
  if (email.includes("..")) return false;

  // ✅ FIX: Expanded invalid patterns
  const invalidPatterns = [
    /\.(governing|government|policy|terms|privacy|company|business|services|conditions)$/,
    /@.*\.(png|jpg|jpeg|gif|svg|webp|pdf|css|js|html|woff|ttf|eot|map|xml|ico|txt)$/i,
    /^(example|test|sample|placeholder|your|name|user)@(example|test|domain|email)\./,
    /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|abuse|spam|unsubscribe)@/i,
    /@(example|test|localhost|placeholder|domain)\./i,
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|pdf|xml|html|ico|woff|ttf|map)$/i,
  ];
  if (invalidPatterns.some(p => p.test(email))) return false;

  // ✅ FIX: Reject emails that look like file paths
  if (/\/(assets|static|images|css|js|fonts|media)\//i.test(email)) return false;

  return true;
}

function extractEmails(text) {
  if (!text) return [];
  const normalized = normalizeWhitespace(text);
  const results = new Set();

  // ✅ FIX: Pattern 1 — Standard email regex (wider matching)
  const standardRegex = /\b([a-zA-Z][a-zA-Z0-9._%+\-]{0,63}@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,10})\b/g;
  let m;
  while ((m = standardRegex.exec(normalized)) !== null) {
    const email = m[1].toLowerCase().replace(/[.,;:'")\]]+$/, "");
    if (isValidEmail(email)) results.add(email);
  }

  // ✅ FIX: Pattern 2 — Obfuscated: user [at] domain [dot] com
  const obfuscatedPatterns = [
    /([a-zA-Z0-9._%+\-]+)\s*[\[\({\s]at[\]\)}\s]\s*([a-zA-Z0-9.\-]+)\s*[\[\({\s]dot[\]\)}\s]\s*([a-zA-Z]{2,10})/gi,
    /([a-zA-Z0-9._%+\-]+)\s*\(at\)\s*([a-zA-Z0-9.\-]+)\s*\(dot\)\s*([a-zA-Z]{2,10})/gi,
    /([a-zA-Z0-9._%+\-]+)\s*\[at\]\s*([a-zA-Z0-9.\-]+)\s*\[dot\]\s*([a-zA-Z]{2,10})/gi,
    /([a-zA-Z0-9._%+\-]+)\s*\{at\}\s*([a-zA-Z0-9.\-]+)\s*\{dot\}\s*([a-zA-Z]{2,10})/gi,
  ];
  for (const pattern of obfuscatedPatterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(normalized)) !== null) {
      const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
      if (isValidEmail(email)) results.add(email);
    }
  }

  // ✅ FIX: Pattern 3 — HTML entity encoded: &#64; for @, &#46; for .
  const entityPattern = /([a-zA-Z0-9._%+\-]+)(?:&#64;|&#x40;|%40)([a-zA-Z0-9.\-]+)(?:&#46;|&#x2e;|%2E)([a-zA-Z]{2,10})/gi;
  while ((m = entityPattern.exec(normalized)) !== null) {
    const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
    if (isValidEmail(email)) results.add(email);
  }

  // ✅ FIX: Pattern 4 — Data URI encoded emails
  const uriDecodedText = (() => {
    try { return decodeURIComponent(normalized.replace(/\+/g, " ")); }
    catch { return normalized; }
  })();
  if (uriDecodedText !== normalized) {
    while ((m = standardRegex.exec(uriDecodedText)) !== null) {
      const email = m[1].toLowerCase();
      if (isValidEmail(email)) results.add(email);
    }
  }

  const cleaned = [...results].map(e => {
    const atIdx = e.indexOf("@");
    if (atIdx === -1) return null;
    const local = e.substring(0, atIdx).replace(/^\d+/, "");
    const domain = e.substring(atIdx + 1).replace(/\.+$/, "");
    return local ? `${local}@${domain}` : null;
  }).filter(Boolean);

  return [...new Set(cleaned)].filter(isValidEmail);
}

// ============================================================================
// ✅ FIXED: PHONE EXTRACTION
// ============================================================================

const FAKE_SEQUENCES = [
  "0123456789", "1234567890", "9876543210", "0987654321",
  "1111111111", "2222222222", "3333333333", "4444444444",
  "5555555555", "6666666666", "7777777777", "8888888888",
  "9999999999", "0000000000",
];

function isFakePhone(digits) {
  if (!digits) return true;
  const d = String(digits);
  if (d.length < 7) return true;
  if (/^(\d)\1+$/.test(d)) return true;
  if (/0{7,}/.test(d)) return true;
  if (FAKE_SEQUENCES.some(seq => d.includes(seq) || seq.includes(d))) return true;
  if (/(\d)\1{5,}/.test(d)) return true;
  if (/^(?:19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(d)) return true;
  const digitArr = d.split("").map(Number);
  let ascRun = 1, descRun = 1;
  for (let i = 1; i < digitArr.length; i++) {
    ascRun = digitArr[i] === digitArr[i - 1] + 1 ? ascRun + 1 : 1;
    descRun = digitArr[i] === digitArr[i - 1] - 1 ? descRun + 1 : 1;
    if (ascRun >= 7 || descRun >= 7) return true;
  }
  return false;
}

// ✅ FIX: Enhanced classifyPhone with better country detection
function classifyPhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/^tel:/i, "")
    .replace(/^callto:/i, "")
    .replace(/^sms:/i, "")
    .trim();

  let digits = cleaned.replace(/[^\d+]/g, "");
  const hasPlus = digits.startsWith("+");
  digits = digits.replace(/\+/g, "");

  if (!digits || digits.length < 7) return null;

  // ✅ FIX: Reject clearly invalid digit strings
  if (digits.length > 15) return null;

  // ✅ FIX: Indian toll-free (1800, 1860, 1900)
  if (/^1[89]0[06]\d{6,7}$/.test(digits)) {
    return { number: digits, type: "tollfree", country: "IN", formatted: formatTollFree(digits) };
  }

  // ✅ FIX: US/Canada toll-free
  if (/^1?8(00|88|77|66|55|44|33)\d{7}$/.test(digits)) {
    return { number: digits, type: "tollfree", country: "US", formatted: formatUSPhone(digits) };
  }

  // ✅ FIX: Indian mobile with +91 prefix (12-13 digits)
  if ((hasPlus || digits.startsWith("91")) && digits.startsWith("91") && (digits.length === 12 || digits.length === 13)) {
    const withoutCC = digits.substring(2);
    if (withoutCC.length === 10 && /^[6-9]\d{9}$/.test(withoutCC)) {
      if (isFakePhone(withoutCC)) return null;
      return {
        number: withoutCC, type: "mobile", country: "IN",
        formatted: `+91 ${withoutCC.substring(0, 5)} ${withoutCC.substring(5)}`
      };
    }
    // ✅ FIX: Indian landline with +91 prefix
    if (withoutCC.length >= 9 && withoutCC.length <= 11 && /^[1-9]/.test(withoutCC)) {
      const landline = "0" + withoutCC;
      if (isFakePhone(withoutCC)) return null;
      return { number: landline, type: "landline", country: "IN", formatted: formatIndianLandline(landline) };
    }
  }

  // ✅ FIX: Indian mobile (10 digits starting 6-9)
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    if (isFakePhone(digits)) return null;
    return {
      number: digits, type: "mobile", country: "IN",
      formatted: `+91 ${digits.substring(0, 5)} ${digits.substring(5)}`
    };
  }

  // ✅ FIX: Indian landline starting with 0 (STD code)
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 12) {
    const noZero = digits.substring(1);
    if (isFakePhone(noZero)) return null;
    return { number: digits, type: "landline", country: "IN", formatted: formatIndianLandline(digits) };
  }

  // ✅ FIX: Indian landline without 0 prefix (STD code 2-4 digits + number)
  if (digits.length >= 8 && digits.length <= 11 && /^[1-9]/.test(digits) && !hasPlus) {
    // Could be landline without STD 0, e.g. 4427173940 or 9144-2717-3940
    const withZero = "0" + digits;
    if (withZero.length >= 10 && withZero.length <= 12 && !isFakePhone(digits)) {
      return { number: withZero, type: "landline", country: "IN", formatted: formatIndianLandline(withZero) };
    }
  }

  // ✅ FIX: International numbers with + prefix
  if (hasPlus && digits.length >= 7 && digits.length <= 15) {
    if (isFakePhone(digits)) return null;

    // Detect country from prefix
    if (digits.startsWith("44") && digits.length === 12) {
      return { number: digits, type: "phone", country: "UK", formatted: `+44 ${digits.substring(2, 6)} ${digits.substring(6)}` };
    }
    if (digits.startsWith("1") && digits.length === 11) {
      return { number: digits, type: "phone", country: "US", formatted: formatUSPhone(digits) };
    }
    if (digits.startsWith("61") && digits.length === 11) {
      return { number: digits, type: "phone", country: "AU", formatted: `+61 ${digits.substring(2)}` };
    }
    if (digits.startsWith("971") && digits.length >= 12) {
      return { number: digits, type: "phone", country: "UAE", formatted: `+971 ${digits.substring(3)}` };
    }
    if (digits.startsWith("65") && digits.length === 10) {
      return { number: digits, type: "phone", country: "SG", formatted: `+65 ${digits.substring(2, 6)} ${digits.substring(6)}` };
    }
    if (digits.startsWith("60") && digits.length >= 10 && digits.length <= 12) {
      return { number: digits, type: "phone", country: "MY", formatted: `+60 ${digits.substring(2)}` };
    }

    return { number: digits, type: "international", country: "INTL", formatted: `+${digits}` };
  }

  // ✅ FIX: US/Canada 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith("1") && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    if (isFakePhone(digits)) return null;
    return { number: digits, type: "landline", country: "US", formatted: formatUSPhone(digits) };
  }

  // ✅ FIX: Short international (7-9 digits)
  if (digits.length >= 7 && digits.length <= 9) {
    if (!isFakePhone(digits)) {
      return { number: digits, type: "phone", country: "UNKNOWN", formatted: digits };
    }
  }

  return null;
}

function formatTollFree(digits) {
  if (digits.startsWith("1800") && digits.length === 10) {
    return `1800 ${digits.substring(4, 7)} ${digits.substring(7)}`;
  }
  if (digits.startsWith("1800") && digits.length === 11) {
    return `1800 ${digits.substring(4, 7)} ${digits.substring(7)}`;
  }
  if (digits.length === 11) return `${digits.substring(0, 4)} ${digits.substring(4, 7)} ${digits.substring(7)}`;
  if (digits.length === 10) return `${digits.substring(0, 4)} ${digits.substring(4, 7)} ${digits.substring(7)}`;
  return digits;
}

function formatUSPhone(digits) {
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
  }
  return digits;
}

function formatIndianLandline(digits) {
  if (!digits.startsWith("0")) digits = "0" + digits;
  // Metro: 2-digit STD code (011=Delhi, 022=Mumbai, 033=Kolkata, 044=Chennai)
  const metroPattern = /^0(11|22|33|44|40|79|80)\d+$/;
  if (metroPattern.test(digits) && digits.length === 11) {
    return `${digits.substring(0, 3)} ${digits.substring(3, 7)} ${digits.substring(7)}`;
  }
  // Standard: 3-4 digit STD + 6-8 digit number
  if (digits.length === 11) {
    return `${digits.substring(0, 4)} ${digits.substring(4, 8)} ${digits.substring(8)}`;
  }
  if (digits.length === 10) {
    return `${digits.substring(0, 4)} ${digits.substring(4)}`;
  }
  if (digits.length === 12) {
    return `${digits.substring(0, 4)} ${digits.substring(4)}`;
  }
  return digits;
}

// ✅ FIX: Significantly enhanced phone extraction with multiple patterns
function extractPhones(text) {
  if (!text) return [];
  const normalized = normalizeWhitespace(text);
  const foundMap = new Map();

  // ✅ FIX: Multi-pattern approach for different phone formats
  // NOTE: [\s\u2010-\u2015\u2212\-\.] covers hyphen, en-dash (–), em-dash, minus
  const SEP = "[\\s\\u2010-\\u2015\\u2212\\-\\.]";
  const phonePatterns = [
    // Explicit phone keywords (including landline / Fax labels)
    /(?:Ph(?:one)?|Tel(?:ephone)?|Landline|Fax|Ph\.?\s*No\.?|Tel\.?\s*No\.?|Call Us|Contact)\s*[:\-–]?\s*(\+?\d[\d\s\u2010-\u2015\u2212\-\.]{6,18}\d)/gi,
    // International with + prefix
    /(?<!\d)(\+\d{1,3}[\s\u2013\u2014\-\.]*\(?\d{1,4}\)?[\s\u2013\u2014\-\.]*\d{3,5}[\s\u2013\u2014\-\.]*\d{3,5}(?:[\s\u2013\u2014\-\.]*\d{1,5})?)(?!\d)/g,
    // Indian mobile: 10 digits starting 6-9 with optional spaces/dashes/en-dashes
    /(?<!\d)([6-9]\d{2}[\s\u2013\u2014\-\.]*\d{3,4}[\s\u2013\u2014\-\.]*\d{3,4})(?!\d)/g,
    // Indian landline with 0-prefix (STD + local), allows en-dash: 0427 – 4043355
    /(?<!\d)(0\d{2,4}[\s\u2013\u2014\-\.]*\d{3,4}[\s\u2013\u2014\-\.]*\d{3,4})(?!\d)/g,
    // Indian landline 0-prefix compact: 0427-4043355 or 04274043355 or 0427 – 4043355
    /(?<!\d)(0\d{2,4}[\s\u2013\u2014\-\.]*\d{6,8})(?!\d)/g,
    // General bracketed format: (xxx) xxx-xxxx
    /\(\d{2,5}\)\s*\d{3,5}[\s\u2013\u2014\-\.]*\d{3,5}/g,
    // Any sequence of digits with separators that looks like a phone
    /(?<!\d)(\d{2,5}[\s\u2013\u2014\-\.]*\d{3,5}[\s\u2013\u2014\-\.]*\d{3,5}(?:[\s\u2013\u2014\-\.]*\d{1,5})?)(?!\d)/g,
  ];

  for (const pattern of phonePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = regex.exec(normalized)) !== null) {
      const candidate = (m[1] || m[0] || "").trim();
      const digitCount = (candidate.match(/\d/g) || []).length;
      if (digitCount < 7 || digitCount > 15) continue;

      // ✅ FIX: Skip IP addresses
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(candidate)) continue;
      // ✅ FIX: Skip dates
      if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(candidate)) continue;
      if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(candidate)) continue;
      // ✅ FIX: Skip PIN codes (pure 6-digit standalone)
      if (/^\s*\d{6}\s*$/.test(candidate)) continue;
      // ✅ FIX: Skip version numbers
      if (/^\d+\.\d+\.\d+$/.test(candidate)) continue;

      const classified = classifyPhone(candidate);
      if (classified && classified.number) {
        // Use last-10 digits as dedup key
        const key = classified.number.length >= 10
          ? classified.number.replace(/\D/g, "").slice(-10)
          : classified.number.replace(/\D/g, "");
        if (!foundMap.has(key)) {
          foundMap.set(key, classified.formatted);
        }
      }
    }
  }

  return [...foundMap.values()].slice(0, 20);
}

function extractPhoneFromContactHref(href) {
  if (!href || typeof href !== "string") return null;
  const url = href.trim();

  const protoMatch = url.match(/^(?:tel|callto|sms|skype):(\+?[\d\s\-\.\(\)]+)/i);
  if (protoMatch) {
    return classifyPhone(protoMatch[1]);
  }

  const waMatch = url.match(/wa\.me\/(\+?\d{7,15})/i);
  if (waMatch) {
    return classifyPhone(waMatch[1]);
  }

  const waApiMatch = url.match(/(?:api|web)\.whatsapp\.com\/send\?.*?phone=(\+?\d{7,15})/i);
  if (waApiMatch) {
    return classifyPhone(waApiMatch[1]);
  }

  const viberMatch = url.match(/viber:\/\/.*?number=(\+?\d{7,15})/i);
  if (viberMatch) {
    return classifyPhone(viberMatch[1]);
  }

  return null;
}

function stripJsonBlobs(text) {
  if (!text) return "";
  return text
    .replace(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
}

// ============================================================================
// ✅ FIXED: ADDRESS EXTRACTION — COMPLETE REWRITE
// ============================================================================

// ✅ FIX: Comprehensive Indian state names + territories
const INDIAN_STATES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh",
  "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
  "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
  "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "tamilnadu",
  "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal",
  "andaman and nicobar", "chandigarh", "dadra and nagar haveli", "daman and diu",
  "delhi", "lakshadweep", "puducherry", "pondicherry", "jammu and kashmir", "ladakh",
].join("|");

// ✅ FIX: Major Indian cities
const INDIAN_CITIES = [
  "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "ahmedabad", "chennai",
  "kolkata", "surat", "pune", "jaipur", "lucknow", "kanpur", "nagpur", "indore",
  "thane", "bhopal", "visakhapatnam", "pimpri", "patna", "vadodara", "ghaziabad",
  "ludhiana", "agra", "nashik", "faridabad", "meerut", "rajkot", "kalyan",
  "vasai", "varanasi", "srinagar", "aurangabad", "dhanbad", "amritsar", "navi mumbai",
  "allahabad", "prayagraj", "ranchi", "haora", "coimbatore", "jabalpur", "gwalior",
  "vijayawada", "jodhpur", "madurai", "raipur", "kota", "guwahati", "chandigarh",
  "solapur", "hubballi", "tiruchirappalli", "trichy", "bareilly", "moradabad",
  "mysuru", "mysore", "tiruppur", "tirupur", "gurgaon", "gurugram", "noida",
  "salem", "warangal", "guntur", "bhiwandi", "saharanpur", "gorakhpur", "bikaner",
  "amravati", "noida", "jamshedpur", "bhilai", "cuttack", "firozabad", "kochi",
  "erode", "vellore", "thiruvananthapuram", "kozhikode", "thrissur", "mangalore",
  "nellore", "belgaum", "ajmer", "kolhapur", "gulbarga", "tirunelveli", "udaipur",
  "siliguri", "jhansi", "ulhasnagar", "jammu", "sangli", "srinagar", "mangaluru",
  "malegaon", "gaya", "puducherry", "pondicherry", "tumkur", "shimoga", "vizag",
  "attayampatti", "sandiyur", "chromepet", "ambattur", "perambur", "velachery",
  "adyar", "t nagar", "nungambakkam", "anna nagar", "porur", "tambaram",
  "sholinganallur", "kelambakkam", "siruseri", "semmancheri", "perungudi",
].join("|");

// ✅ FIX: Address-related keywords
const ADDRESS_KEYWORDS = [
  "street", "road", "nagar", "layout", "sector", "phase", "floor", "building",
  "tower", "avenue", "lane", "block", "plot", "main", "cross", "circle",
  "colony", "enclave", "vihar", "marg", "chowk", "bazaar", "market",
  "industrial", "estate", "area", "zone", "complex", "plaza", "center",
  "centre", "junction", "gate", "park", "garden", "district", "taluk",
  "taluka", "tehsil", "mandal", "village", "post", "near", "opp", "opposite",
  "adjacent", "beside", "behind", "front", "above", "below", "flat", "house",
  "no\\.", "number", "sf no", "survey", "door", "old no", "new no",
  "2nd", "3rd", "4th", "1st", "ground", "basement",
  "pvt ltd", "private limited", "llp", "limited",
].join("|");

function extractAddresses(text) {
  if (!text) return [];

  // ✅ FIX: Clean HTML tags, scripts, styles before processing
  const stripped = (text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\"title\"\s*:\s*\".*?\"/gi, " ")
    .replace(/\"id\"\s*:\s*\".*?\"/gi, " ")
    .replace(/\{[^{}]*\"title\"[^{}]*\}/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const normalized = normalizeWhitespace(stripped);
  const found = new Map();

  // ✅ FIX: Expanded blacklist
  const blacklist = [
    "fastag", "operators", "insurance policy", "loan eligibility",
    "scroll for more", "toastify", "javascript:", "all operators",
    "safe & secure", "recharge now", "privacy policy", "terms & conditions",
    "full name", "email id", "contact number", "project details",
    "send message", "reach out manually", "send enquiry", "submit form",
    "all rights reserved", "newsletter", "subscribe now",
    "get every single", "promotional", "click here", "read more",
    "learn more", "see more", "view more", "download", "upload",
    "loading", "processing", "please wait", "redirecting",
    "indian contract act", "services are intended", "users agree",
    "applicable laws", "governing law", "chargeback", "binding contracts",
    "terms and conditions", "privacy policy", "refund policy",
  ];

  // ✅ FIX: 8 comprehensive address patterns covering various formats
  const patterns = [
    // Pattern 1: Explicit label + address body ending with 6-digit pincode
    {
      regex: /\b(?:registered\s+(?:office|address)|corporate\s+office|head\s+office|branch\s+office|business\s+headquarters|office\s+address|our\s+office|company\s+(?:location|address)|registered\s+address|mailing\s+address|postal\s+address|factory\s+address|plant\s+(?:address|location))\s*[:\-–]?\s*([\w][\s\S]{10,250}?\b\d{6}\b)/gi,
      group: 1,
    },
    // Pattern 2: Starts with SF No, Survey No, Door No, Plot No, etc.
    {
      regex: /\b(?:SF\.?\s*No\.?\s*\d+|Survey\s+No\.?\s*\d+|Sy\.?\s*No\.?\s*\d+|Door\s*No\.?\s*[\w\/\-]+|Old\s*No\.?\s*[\w\/\-]+|New\s*No\.?\s*[\w\/\-]+|Plot\s*No\.?\s*[\w\/\-]+|Flat\s*No\.?\s*[\w\/\-]+|H\.?\s*No\.?\s*[\w\/\-]+|W\.?\s*No\.?\s*[\w\/\-]+|Shed\s+No\.?\s*[\w\/\-]+|C\/O\s+[\w\s]+|D\.?\s*No\.?\s*[\w\/\-]+)\b[\s\S]{5,250}?\b\d{6}\b/gi,
      group: 0,
    },
    // Pattern 3: Starts with a floor/building/tower reference
    {
      regex: /\b(?:\d{1,3}(?:st|nd|rd|th)?\s+Floor|Ground\s+Floor|Basement|Mezzanine)\b[\s\S]{5,250}?\b\d{6}\b/gi,
      group: 0,
    },
    // Pattern 4: Contains city/state name and ends with pincode (City, State - 636203)
    {
      regex: new RegExp(
        `\\b[A-Z0-9][\\w\\s,\\.\\-\\/()&]{15,250}?(?:${INDIAN_CITIES}|${INDIAN_STATES})\\b[\\w\\s,\\.\\-]*\\d{6}\\b`,
        "gi"
      ),
      group: 0,
    },
    // Pattern 5: Address with hyphen-attached pincode (Salem-636203, Coimbatore-641001)
    {
      regex: new RegExp(
        `\\b[A-Z0-9][\\w\\s,\\.\\-\\/()&]{10,200}?(?:${INDIAN_CITIES})\\s*[-–,]\\s*\\d{6}\\b`,
        "gi"
      ),
      group: 0,
    },
    // Pattern 6: Contains address keyword + pincode somewhere in block
    {
      regex: new RegExp(
        `\\b[A-Z0-9][\\w\\s,\\.\\-\\/()&]{5,250}?(?:${ADDRESS_KEYWORDS})[\\w\\s,\\.\\-\\/()&]{2,200}?\\b\\d{6}\\b`,
        "gi"
      ),
      group: 0,
    },
    // Pattern 7: Catch-all — any text ending in city[-space]pincode
    {
      regex: /\b[A-Z0-9][A-Za-z0-9][\w\s,.\-\/()&]{10,200}?[-–,\s]\d{6}\b/g,
      group: 0,
    },
    // Pattern 8: Space-separated PIN (e.g. "636 203")
    {
      regex: /\b[A-Z0-9][A-Za-z0-9,\-\/(). &]{15,250}?\b\d{3}\s\d{3}\b/g,
      group: 0,
    },

    // Pattern 9: Indian address with city + pincode
    {
      regex: /\b(?:SF\.?\s*NO\.?|Survey\s*No\.?|Door\s*No\.?|Plot\s*No\.?|Old\s*No\.?|New\s*No\.?)?[\w\s,\/\-]{10,250}?(?:salem|chennai|coimbatore|erode|madurai|trichy|tirupur|attayampatti|sandiyur)[\s,\-]*\d{6}\b/gi,
      group: 0,
    },
  ];

  for (const { regex, group } of patterns) {
    let match;
    const re = new RegExp(regex.source, regex.flags);
    while ((match = re.exec(normalized)) !== null) {
      let addr = ((group === 0 ? match[0] : match[group]) || "").trim();
      // Remove Google Maps / JSON garbage
      addr = addr
        .replace(/\{\".*$/s, "")
        .replace(/\"}\}.*$/s, "")
        .replace(/\[\{.*$/s, "")
        .replace(/Copy\s.*$/si, "")
        .replace(/"id":.*$/si, "")
        .replace(/"title":.*$/si, "")
        .replace(/\\+"/g, "")
        .trim();
      if (!addr) continue;

      const lower = addr.toLowerCase();
      if (
        addr.includes('{"') ||
        addr.includes('"title"') ||
        addr.includes('"id"') ||
        addr.includes('io:[') ||
        addr.includes('bb:[')
      ) {
        continue;
      }


      // ✅ FIX: Apply blacklist
      if (blacklist.some(k => lower.includes(k.toLowerCase()))) continue;

      // ✅ FIX: Reject email/phone-like content
      if (/@/.test(addr)) continue;
      if (/\+\s?91[\s\-]?\d{5,}/.test(addr)) continue;
      if (/\b1[89]00[\s\-]?\d/.test(addr)) continue;

      // ✅ FIX: Reject pure copyright/legal text
      if (/©|copyright|\btos\b|\bpolicy\b|\bterms\b/i.test(addr)) continue;

      // ✅ FIX: Length validation
      if (addr.length < 15 || addr.length > 350) continue;

      // ✅ FIX: Too many words (likely a paragraph)
      if (addr.split(/\s+/).length > 50) continue;

      // ✅ FIX: Must contain pincode (6 digits or space-separated)
      const pincodeRaw = addr.match(/(\d{3})\s?(\d{3})/);
      if (!pincodeRaw) continue;
      const pincode = (pincodeRaw[1] + pincodeRaw[2]).replace(/\s/g, "");

      // ✅ FIX: Validate pincode range (Indian: 100000–999999)
      const pincodeNum = parseInt(pincode, 10);
      if (pincodeNum < 100000 || pincodeNum > 999999) continue;

      // ✅ FIX: Trim address to pincode
      const pinIdx = addr.search(/\d{3}\s?\d{3}/);
      if (pinIdx >= 0) {
        const pinLen = pincodeRaw[0].length;
        addr = addr.substring(0, pinIdx + pinLen).trim().replace(/[,;.\-–]+$/, "").trim();
      }

      // ✅ FIX: Remove leading label words
      addr = addr
        .replace(/^.*?\b(?:registered\s+address|corporate\s+office|head\s+office|business\s+headquarters|registered\s+office|company\s+location|our\s+location|office\s+location|office\s+address|branch\s+office|location|address|visit\s+us|find\s+us|get\s+directions)\b[\s:\-–]*/gi, "")
        .replace(/^(?:is|are\s+located\s+at|are|located\s+at|situated\s+at|find\s+us\s+at|we\s+are\s+at|at)\s+/gi, "")
        .trim();

      // ✅ FIX: Remove leading lowercase junk
      addr = addr.replace(/^[a-z\s,.\-:]+/, "").trim();

      // ✅ FIX: Minimum meaningful address (must have enough words)
      if (addr.split(/\s+/).length < 3) continue;
      if (addr.length < 15) continue;

      // ✅ FIX: Store by pincode — prefer LONGER (more complete) address
      if (!found.has(pincode)) {
        found.set(pincode, addr);
      } else {
        const existing = found.get(pincode);
        // Prefer the longer address: it contains more location components
        if (addr.length > existing.length && addr.length <= 350) {
          found.set(pincode, addr);
        }
      }
    }
  }

  // Fallback Indian address extraction — wider window to capture multi-line addresses
  const lines = normalized.split(/[|\n]/);

  for (let i = 0; i < lines.length; i++) {
    // Use ±5 line window (wider than before) so multi-part addresses are captured
    const block = lines.slice(Math.max(0, i - 5), i + 6).join(", ");

    if (
      /\b\d{6}\b/.test(block) &&
      new RegExp(INDIAN_STATES + "|" + INDIAN_CITIES, "i").test(block)
    ) {
      let addr = block.trim();

      // Clean up excessive commas from joining
      addr = addr
        .replace(/,\s*,/g, ",")
        .replace(/^[,\s]+/, "")
        .trim();

      // Trim to pincode
      const pinMatch = addr.match(/\b(\d{6})\b/);
      if (pinMatch) {
        const pinEnd = addr.indexOf(pinMatch[0]) + pinMatch[0].length;
        addr = addr.substring(0, pinEnd).trim();
      }

      if (
        addr.length > 20 &&
        addr.length < 400 &&
        !blacklist.some(k => addr.toLowerCase().includes(k.toLowerCase()))
      ) {
        const fallbackPin = (addr.match(/\b(\d{6})\b/) || [])[1] || `fallback_${i}`;
        if (!found.has(fallbackPin) || found.get(fallbackPin).length < addr.length) {
          found.set(fallbackPin, addr);
        }
      }
    }
  }

  // ✅ FIX: Post-process — normalize formatting
  return [...new Set(
    [...found.values()].map(addr =>
      addr
        .replace(/\s+/g, " ")
        .replace(/,\s*,/g, ",")
        .replace(/\s*,\s*/g, ", ")
        .replace(/Old\.no\./gi, "Old No.")
        .replace(/New\.no\./gi, "New No.")
        .replace(/[-–]\s*(\d{3})\s*(\d{3})/, " - $1$2")
        .replace(/,\s*$/, "")
        .trim()
    ).filter(addr => addr.length >= 15)
  )].slice(0, 10);
}

// ============================================================================
// ✅ GSTIN & CIN EXTRACTION HELPERS
// ============================================================================

function extractGstin(text) {
  if (!text || typeof text !== "string") return [];
  const normalized = normalizeWhitespace(text);
  const found = new Set();

  // Pattern 1: Labeled GSTIN (e.g. GSTIN: 33AAACC1206C1ZM or GST No. 33AAACC1206C1ZM)
  const labeledRegex = /(?:GSTIN(?:\/UIN)?|GST\s*No\.?|GST\s*Number|GST\s*Reg(?:istration)?\.?\s*No\.?|Goods\s*&\s*Services\s*Tax\s*(?:Registration)?\s*No\.?|GST)\s*[:\-–]?\s*([0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z])\b/gi;
  let m;
  while ((m = labeledRegex.exec(normalized)) !== null) {
    if (m[1]) found.add(m[1].toUpperCase());
  }

  // Pattern 2: Standalone 15-character GSTIN pattern
  const standaloneRegex = /\b([0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z])\b/gi;
  while ((m = standaloneRegex.exec(normalized)) !== null) {
    if (m[1]) found.add(m[1].toUpperCase());
  }

  return [...found];
}

function extractCin(text) {
  if (!text || typeof text !== "string") return [];
  const normalized = normalizeWhitespace(text);
  const found = new Set();

  // Pattern 1: Labeled CIN (e.g. CIN: U72900TN2020PTC123456 or Corporate Identity Number: U72900TN2020PTC123456)
  const labeledRegex = /(?:CIN|Corporate\s*Id(?:entification)?\s*No\.?|Corporate\s*Identity\s*Number(?:\s*\(CIN\))?|CIN\s*No\.?|Company\s*CIN)\s*[:\-–]?\s*([ULul][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6})\b/gi;
  let m;
  while ((m = labeledRegex.exec(normalized)) !== null) {
    if (m[1]) found.add(m[1].toUpperCase());
  }

  // Pattern 2: Standalone 21-character CIN pattern
  const standaloneRegex = /\b([ULul][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6})\b/gi;
  while ((m = standaloneRegex.exec(normalized)) !== null) {
    if (m[1]) found.add(m[1].toUpperCase());
  }

  return [...found];
}

function extractGstinFromHtml($) {
  const results = new Set();

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const content = $(el).html() || "";
      extractGstin(content).forEach(g => results.add(g));
    } catch { }
  });

  $("meta").each((_, el) => {
    const content = $(el).attr("content") || "";
    if (content) extractGstin(content).forEach(g => results.add(g));
  });

  $("footer, address, [class*='footer'], [id*='footer'], [class*='contact'], [id*='contact'], [class*='legal'], [id*='legal'], [class*='terms'], [id*='terms'], [class*='privacy'], [id*='privacy']").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) extractGstin(text).forEach(g => results.add(g));
  });

  return [...results];
}

function extractCinFromHtml($) {
  const results = new Set();

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const content = $(el).html() || "";
      extractCin(content).forEach(c => results.add(c));
    } catch { }
  });

  $("meta").each((_, el) => {
    const content = $(el).attr("content") || "";
    if (content) extractCin(content).forEach(c => results.add(c));
  });

  $("footer, address, [class*='footer'], [id*='footer'], [class*='contact'], [id*='contact'], [class*='legal'], [id*='legal'], [class*='terms'], [id*='terms'], [class*='privacy'], [id*='privacy']").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) extractCin(text).forEach(c => results.add(c));
  });

  return [...results];
}

// ============================================================================
// ✅ FIXED: EXTRACT EMAILS FROM STRUCTURED HTML ELEMENTS
// ============================================================================

/**
 * NEW: Extract emails from all possible HTML contexts
 */
function extractEmailsFromHtml($, currentUrl) {
  const results = new Set();

  // ✅ FIX: Method 1 — mailto: links
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (/^mailto:/i.test(href)) {
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (isValidEmail(email)) results.add(email);
    }
  });

  // ✅ FIX: Method 2 — data-email, data-mail, data-contact attributes
  $("[data-email], [data-mail], [data-contact], [data-email-address]").each((_, el) => {
    for (const attr of ["data-email", "data-mail", "data-contact", "data-email-address"]) {
      const val = ($(el).attr(attr) || "").trim().toLowerCase();
      if (val && isValidEmail(val)) results.add(val);
    }
  });

  // ✅ FIX: Method 3 — content attributes in meta
  $("meta").each((_, el) => {
    const name = ($(el).attr("name") || $(el).attr("property") || "").toLowerCase();
    const content = ($(el).attr("content") || "").trim();
    if (content && (name.includes("email") || name.includes("contact"))) {
      const emails = extractEmails(content);
      emails.forEach(e => results.add(e));
    }
  });



  // ✅ FIX: Method 4 — JSON-LD scripts
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const content = $(el).html() || "";
      const json = JSON.parse(content);
      const traverseJson = (obj) => {
        if (!obj) return;
        if (typeof obj === "string" && obj.includes("@") && isValidEmail(obj)) {
          results.add(obj.toLowerCase());
        }
        if (typeof obj === "object") {
          // Check common email fields
          for (const field of ["email", "contactEmail", "emailAddress"]) {
            if (obj[field] && typeof obj[field] === "string") {
              const e = obj[field].toLowerCase();
              if (isValidEmail(e)) results.add(e);
            }
          }
          Object.values(obj).forEach(v => traverseJson(v));
        }
      };
      traverseJson(json);
    } catch { }
  });

  // ✅ FIX: Method 5 — Inline scripts (email variables)
  $("script:not([src])").each((_, el) => {
    const scriptContent = $(el).html() || "";
    // Look for email strings in JS
    const emailInJsRegex = /["']([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10})["']/g;
    let m;
    while ((m = emailInJsRegex.exec(scriptContent)) !== null) {
      const email = m[1].toLowerCase();
      if (isValidEmail(email)) results.add(email);
    }
  });

  // ✅ FIX: Method 6 — Per-element text scan (contact, footer, address sections)
  const contactSelectors = [
    "footer", "address", "[class*='contact']", "[id*='contact']",
    "[class*='footer']", "[id*='footer']", "[class*='reach']",
    "[class*='touch']", "[class*='email']", "[id*='email']",
    "[class*='info']", "[id*='info']", "[class*='support']",
    "[itemtype*='PostalAddress']", "[itemtype*='Organization']",
    "[itemprop='email']",
  ];
  for (const selector of contactSelectors) {
    $(selector).each((_, el) => {
      const elText = normalizeWhitespace($(el).text());
      if (elText && elText.includes("@")) {
        extractEmails(elText).forEach(e => results.add(e));
      }
      // Also check itemprop content
      const content = $(el).attr("content") || "";
      if (content && content.includes("@")) {
        extractEmails(content).forEach(e => results.add(e));
      }
    });
  }

  return [...results].filter(isValidEmail);
}

/**
 * NEW: Extract phones from all possible HTML contexts
 */
function extractPhonesFromHtml($, currentUrl) {
  const found = new Map();

  const addPhone = (raw, priority = 0) => {
    const classified = classifyPhone(raw);
    if (!classified || !classified.formatted) return;
    const key = classified.number.replace(/\D/g, "").slice(-10);
    if (!found.has(key) || priority > (found.get(key)._priority || 0)) {
      found.set(key, { ...classified, _priority: priority });
    }
  };

  // ✅ FIX: Method 1 — tel: / callto: / wa.me / sms: links (highest priority)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const lhref = href.toLowerCase();
    if (lhref.startsWith("tel:") || lhref.startsWith("callto:") || lhref.startsWith("sms:")) {
      addPhone(href.replace(/^(?:tel|callto|sms):/i, ""), 10);
    }
    if (lhref.includes("wa.me/") || lhref.includes("api.whatsapp.com")) {
      const classified = extractPhoneFromContactHref(href);
      if (classified) addPhone(classified.number, 10);
    }
  });

  // ✅ FIX: Method 2 — data attributes
  $("[data-phone], [data-tel], [data-mobile], [data-number]").each((_, el) => {
    for (const attr of ["data-phone", "data-tel", "data-mobile", "data-number"]) {
      const val = $(el).attr(attr);
      if (val) addPhone(val, 9);
    }
  });

  // ✅ FIX: Method 3 — JSON-LD
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");
      const traverseForPhone = (obj) => {
        if (!obj) return;
        if (typeof obj === "object") {
          for (const field of ["telephone", "phone", "faxNumber", "contactPoint", "phoneNumber"]) {
            if (obj[field] && typeof obj[field] === "string") {
              addPhone(obj[field], 8);
            }
          }
          Object.values(obj).forEach(v => typeof v === "object" && traverseForPhone(v));
        }
      };
      traverseForPhone(json);
    } catch { }
  });

  // ✅ FIX: Method 4 — itemprop="telephone"
  $("[itemprop='telephone'], [itemprop='phone']").each((_, el) => {
    const content = $(el).attr("content") || $(el).text().trim();
    if (content) addPhone(content, 8);
  });

  // ✅ FIX: Method 5 — meta tags
  $("meta").each((_, el) => {
    const name = ($(el).attr("name") || $(el).attr("property") || "").toLowerCase();
    const content = $(el).attr("content") || "";
    if (name.includes("phone") || name.includes("tel") || name.includes("mobile")) {
      if (content) addPhone(content, 7);
    }
  });

  // ✅ FIX: Method 6 — Contact/footer text sections
  const contactSelectors = [
    "footer", "address", "[class*='contact']", "[id*='contact']",
    "[class*='footer']", "[id*='footer']", "[class*='phone']",
    "[class*='tel']", "[class*='mobile']", "[class*='reach']",
    "[class*='touch']", "[class*='call']", "[class*='support']",
    "[itemtype*='Organization']",
  ];
  for (const selector of contactSelectors) {
    $(selector).each((_, el) => {
      const elText = normalizeWhitespace($(el).text());
      if (elText) {
        extractPhones(elText).forEach(p => addPhone(p, 5));
      }
    });
  }

  return [...found.values()].map(p => p.formatted).filter(Boolean);
}

/**
 * NEW: Extract addresses from all possible HTML contexts
 */
function extractAddressesFromHtml($) {
  const results = new Set();

  // ✅ FIX: Method 1 — JSON-LD structured data
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");
      const processRecord = (record) => {
        if (!record || typeof record !== "object") return;
        // PostalAddress type
        if (record["@type"] === "PostalAddress" || record.address) {
          const addrObj = record["@type"] === "PostalAddress" ? record : record.address;
          if (addrObj && typeof addrObj === "object") {
            const fullAddr = [
              addrObj.streetAddress,
              addrObj.addressLocality,
              addrObj.addressRegion,
              addrObj.postalCode,
              addrObj.addressCountry,
            ].filter(Boolean).join(", ");
            if (fullAddr.length > 15) results.add(fullAddr);
          } else if (typeof record.address === "string" && record.address.length > 15) {
            results.add(record.address);
          }
        }
        // Recurse
        if (Array.isArray(record["@graph"])) record["@graph"].forEach(processRecord);
        Object.values(record).forEach(v => typeof v === "object" && !Array.isArray(v) && processRecord(v));
      };
      processRecord(json);
    } catch { }
  });

  // ✅ FIX: Method 2 — itemprop="address" / PostalAddress microdata
  $("[itemprop='address'], [itemtype*='PostalAddress']").each((_, el) => {
    const parts = {
      streetAddress: $(el).find("[itemprop='streetAddress']").text().trim() ||
        $(el).attr("content") || "",
      locality: $(el).find("[itemprop='addressLocality']").text().trim(),
      region: $(el).find("[itemprop='addressRegion']").text().trim(),
      postalCode: $(el).find("[itemprop='postalCode']").text().trim(),
      country: $(el).find("[itemprop='addressCountry']").text().trim(),
    };
    const fullAddr = [parts.streetAddress, parts.locality, parts.region, parts.postalCode, parts.country]
      .filter(Boolean).join(", ");
    if (fullAddr.length > 15) results.add(fullAddr);

    // Fallback — full text of the element
    const elText = normalizeWhitespace($(el).text());
    if (elText && elText.length > 15) {
      extractAddresses(elText).forEach(a => results.add(a));
    }
  });

  // ✅ FIX: Method 3 — <address> HTML tag
  $("address").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text && text.length > 10) {
      extractAddresses(text).forEach(a => results.add(a));
      // Also keep the raw text if it looks like an address
      if (text.length > 15 && text.length < 400) results.add(text);
    }
  });

  // ✅ FIX: Method 4 — Google Maps iframes / links
  $("iframe[src*='google.com/maps'], iframe[src*='maps.google']").each((_, el) => {
    const src = $(el).attr("src") || "";
    try {
      const qMatch = src.match(/[?&]q=([^&]+)/i);
      if (qMatch) {
        const decoded = decodeURIComponent(qMatch[1]).replace(/\+/g, " ");
        if (decoded.length > 10) results.add(decoded);
      }
    } catch { }
  });

  $("a[href*='google.com/maps']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&](?:query|q)=([^&]+)/i);
    if (m) {
      try {
        const decoded = decodeURIComponent(m[1]).replace(/\+/g, " ");
        if (decoded.length > 10) results.add(decoded);
      } catch { }
    }
  });

  // ✅ FIX: Method 5 — Meta address tags
  const metaSelectors = [
    'meta[property="place:location:address"]',
    'meta[name="address"]',
    'meta[property="business:contact_data:street_address"]',
    'meta[name="geo.placename"]',
    'meta[property="og:street-address"]',
  ];
  for (const sel of metaSelectors) {
    const content = $(sel).attr("content");
    if (content && content.length > 10) {
      extractAddresses(content).forEach(a => results.add(a));
    }
  }

  // ✅ FIX: Method 6 — Contact/footer/about section text
  const sectionSelectors = [
    "footer", "address",
    "[class*='contact']", "[id*='contact']",
    "[class*='footer']", "[id*='footer']",
    "[class*='location']", "[id*='location']",
    "[class*='address']", "[id*='address']",
    "[class*='office']", "[id*='office']",
    "[class*='reach']", "[class*='touch']",
    "[class*='branch']", "[class*='store']",
    "[class*='about']", "[id*='about']",
    "[class*='info']", "[id*='info']",
    "[itemtype*='Organization']",
    "[itemtype*='LocalBusiness']",
  ];
  for (const selector of sectionSelectors) {
    $(selector).each((_, el) => {
      const text = normalizeWhitespace($(el).text());
      if (text && text.length > 20 && text.length < 2000) {
        extractAddresses(text).forEach(a => results.add(a));
      }
    });
  }

  return [...results].filter(a => a && typeof a === "string" && a.length > 10);
}

function extractCopyrights(text) {
  const normalized = normalizeWhitespace(
    (text || "")
      .replace(/{"props"[\s\S]*?<\/script>/gi, " ")
      .replace(/{\s*"props"\s*:/g, " ")
      .replace(/__NEXT_DATA__[\s\S]*?<\/script>/gi, " ")
      .replace(/{["'][a-z]/gi, " ")
  );

  const patterns = [
    /©\s*(?:copyrights?|copyright)?\s*\d{0,4}[^{}<>|\n]{0,120}/gi,
    /copyrights?\s*©?\s*\d{0,4}[^{}<>|\n]{0,120}/gi,
    /all rights reserved[^{}<>|\n]{0,80}/gi,
  ];

  const found = new Set();
  patterns.forEach((pattern) => {
    const matches = normalized.match(pattern) || [];
    matches.forEach((m) => {
      let cleaned = m.replace(/\s+/g, " ").replace(/\s*[{"'][a-zA-Z].*$/, "").trim();
      if (cleaned.length > 6 && cleaned.length < 200) found.add(cleaned);
    });
  });
  return [...found].slice(0, 10);
}

function extractCompanyNames(text) {
  const normalized = normalizeWhitespace(text);
  const patterns = [
    /\b(?:[A-Z][a-zA-Z&.\-]+(?:\s+[A-Z][a-zA-Z&.\-]+){0,5})\s+(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|LLP|Ltd\.?|Limited|Technology|Technologies|Solutions|Systems|Corporation|Corp\.?|Inc\.?|Industries|Enterprises)\b/g,
  ];
  const blacklist = ["Privacy Policy", "Terms Conditions", "Refund Policy", "All Rights Reserved", "Government Taxes"];
  const found = new Set();
  patterns.forEach((pattern) => {
    const matches = normalized.match(pattern) || [];
    matches.forEach((m) => {
      const cleaned = m.replace(/\s+/g, " ").trim();
      if (cleaned.split(" ").length > 8 || cleaned.length > 70) return;
      if (cleaned.length > 2 && !blacklist.some(b => cleaned.includes(b))) found.add(cleaned);
    });
  });
  return [...found].slice(0, 10);
}

function extractJsonLdAddresses($) {
  const found = new Set();
  function processRecord(record) {
    if (!record || typeof record !== "object") return;
    if (record.address && typeof record.address === "object") {
      const fullAddress = [
        record.address.streetAddress, record.address.addressLocality,
        record.address.addressRegion, record.address.postalCode,
        record.address.addressCountry
      ].filter(Boolean).join(", ");
      if (fullAddress.length > 15) found.add(fullAddress);
    }
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(processRecord);
  }
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;
      const json = JSON.parse(content);
      processRecord(json);
    } catch { }
  });
  return [...found];
}

function extractGoogleMapAddresses($) {
  const addresses = [];
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.includes("google.com/maps") || src.includes("maps.google")) {
      try {
        const qMatch = src.match(/[?&]q=([^&]+)/i);
        if (qMatch) addresses.push(decodeURIComponent(qMatch[1]));
        const pbMatch = src.match(/!2s([^!]+)/i);
        if (pbMatch) addresses.push(decodeURIComponent(pbMatch[1]));
      } catch { }
    }
  });
  $("a[href*='google.com/maps']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const queryMatch = href.match(/[?&]query=([^&]+)/i) || href.match(/[?&]q=([^&]+)/i);
    if (queryMatch) {
      try {
        const decoded = decodeURIComponent(queryMatch[1]).replace(/\+/g, " ");
        if (decoded.length > 20) addresses.push(decoded);
      } catch { }
    }
  });
  return [...new Set(addresses)].filter(addr => {

    const lower = String(addr).toLowerCase();

    return !(
      lower.includes('"title"') ||
      lower.includes('"id"') ||
      lower.includes('"io"') ||
      lower.includes('"bb"') ||
      lower.includes('"a":[') ||
      lower.includes('},{"a"') ||
      lower.includes('googleusercontent')
    );

  });
}

function extractMetaTags($) {
  const metaTags = {};
  $("meta").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property");
    const content = $(el).attr("content");
    if (name && content) metaTags[name] = content;
  });
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) metaTags["canonical"] = canonical;
  return metaTags;
}

function stripCorporateIdentifiers(text) {
  if (!text) return "";
  return text
    .replace(/\b[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/gi, " ")
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d\b/gi, " ")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, " ")
    .replace(/\b[A-Z]{4}\d{5}[A-Z]\b/gi, " ");
}

// ============================================================================
// SECTION 6: SCREENSHOTS (STORED IN DB ONLY, NEVER ON DISK)
// ============================================================================

// ============================================================================
// SECTION 7: SECURITY HEADERS
// ============================================================================

function extractSecurityHeaders(headersMap) {
  return {
    csp: headersMap["content-security-policy"] || null,
    hsts: headersMap["strict-transport-security"] || null,
    xFrameOptions: headersMap["x-frame-options"] || null,
    xContentTypeOptions: headersMap["x-content-type-options"] || null,
    referrerPolicy: headersMap["referrer-policy"] || null,
    permissionsPolicy: headersMap["permissions-policy"] || headersMap["feature-policy"] || null,
  };
}

// ============================================================================
// SECTION 8: MAIN CRAWL ENGINE
// ============================================================================

async function crawlWebsite(seedUrl, options = {}, jobId) {
  const maxDepth = Math.min(Number(options.maxDepth) || 3, 5);
  const maxPages = Math.min(Number(options.maxPages) || 50, 100);
  const concurrency = Math.min(Number(options.concurrency) || 3, 5);
  const timeout = Math.min(Number(options.timeout) || 30000, 90000);
  const signal = options.signal || null;

  const normSeed = normalizeUrl(seedUrl);
  if (!normSeed.isValid || isPrivateHostname(normSeed.hostname)) {
    throw new Error(`Invalid or blocked seed URL: ${seedUrl}`);
  }

  const seedDomain = normSeed.host;

  const visited = new Set();
  const queued = new Set([normSeed.url]);
  const queue = [{ url: normSeed.url, depth: 0 }];
  let pagesSavedCount = 0;
  let maxDepthReached = 0;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--disable-background-networking", "--disable-default-apps",
        "--disable-extensions", "--disable-sync", "--disable-translate",
        "--mute-audio", "--no-first-run", "--safebrowsing-disable-auto-update",
      ],
    });
  } catch (err) {
    await writeLog(jobId, `Failed to launch browser: ${err.message}`, "error", "crawl");
    throw err;
  }

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });

  try {
    while (queue.length > 0 && pagesSavedCount < maxPages) {
      if (signal && signal.aborted) {
        await writeLog(jobId, "Crawl aborted via signal.", "warn", "crawl");
        break;
      }

      const batch = [];
      while (batch.length < concurrency && queue.length > 0) {
        const item = queue.shift();
        const cleanUrl = cleanQueryParams(item.url);
        if (!visited.has(cleanUrl)) {
          visited.add(cleanUrl);
          batch.push({ ...item, url: cleanUrl });
        }
      }

      if (batch.length === 0) continue;

      const batchPromises = batch.map(item => crawlSinglePage({
        item, context, jobId, seedDomain, queue, visited, queued, maxDepth, maxPages,
        timeout, signal,
        pagesSavedCount: () => pagesSavedCount,
        maxDepthTracked: () => maxDepthReached,
        onDepthUpdate: (d) => { if (d > maxDepthReached) maxDepthReached = d; },
        onSaved: () => { pagesSavedCount++; },
      }));

      await Promise.all(batchPromises);
    }
  } finally {
    await context.close().catch(() => { });
    await browser.close().catch(() => { });
  }

  await writeLog(jobId, `Crawl finished. Pages scanned: ${pagesSavedCount}. Max depth reached: ${maxDepthReached}`, "info", "crawl");

  return { totalPagesScanned: pagesSavedCount, depthReached: maxDepthReached };
}

// ============================================================================
// SECTION 9: SINGLE PAGE CRAWL — FIXED EXTRACTION INTEGRATION
// ============================================================================

async function crawlSinglePage({
  item, context, jobId, seedDomain, queue, visited, queued, maxDepth, maxPages,
  timeout, signal, pagesSavedCount, onDepthUpdate, onSaved,
}) {
  if (pagesSavedCount() >= maxPages) return;
  if (signal && signal.aborted) return;

  const currentUrl = item.url;
  const currentDepth = item.depth;
  let pageInstance;

  try {
    if (signal && signal.aborted) throw new Error("Crawl was cancelled by user.");
    pageInstance = await context.newPage();
    pageInstance.setDefaultTimeout(timeout);
    pageInstance.setDefaultNavigationTimeout(timeout);

    const networkData = { apiCalls: [], totalRequests: 0, failedRequests: 0, totalBytes: 0 };

    await pageInstance.route("**/*", async (route) => {
      const req = route.request();
      const reqUrl = normalizeUrl(req.url());
      if (reqUrl.isValid && isPrivateHostname(reqUrl.hostname)) {
        return route.abort("accessdenied");
      }
      return route.continue();
    });

    pageInstance.on("request", () => { networkData.totalRequests++; });
    pageInstance.on("requestfailed", () => { networkData.failedRequests++; });
    pageInstance.on("response", async (res) => {
      try {
        const req = res.request();
        const type = req.resourceType();
        try {
          const contentType = res.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const body = await res.text();
            const apiGstin = extractGstin(body);
            const apiCin = extractCin(body);
            const cleanBody = stripCorporateIdentifiers(body);
            const apiEmails = extractEmails(cleanBody);
            const apiAddresses = extractAddresses(cleanBody);
            networkData.contactData = networkData.contactData || { emails: [], phones: [], addresses: [], gstin: [], cin: [] };
            networkData.contactData.emails.push(...apiEmails);
            networkData.contactData.addresses.push(...apiAddresses);
            if (!networkData.contactData.gstin) networkData.contactData.gstin = [];
            if (!networkData.contactData.cin) networkData.contactData.cin = [];
            networkData.contactData.gstin.push(...apiGstin);
            networkData.contactData.cin.push(...apiCin);
          }
        } catch { }

        if (type === "fetch" || type === "xhr") {
          const url = req.url();
          const lowerUrl = url.toLowerCase();
          const urlPath = lowerUrl.split("?")[0];
          const looksLikeApi = req.method() !== "GET" ||
            lowerUrl.includes("/api/") || lowerUrl.includes("/v1/") ||
            lowerUrl.includes("/v2/") || lowerUrl.includes("/v3/") ||
            lowerUrl.includes("/graphql") || lowerUrl.includes("/rest/");
          if (!looksLikeApi) return;
          const isNoise = ["google-analytics", "googletagmanager", "hotjar", "_next/", "_rsc=", "webpack",
            "google.com/maps", "googleapis.com/maps", "fonts.googleapis", "fonts.gstatic",
            "chrome-extension://", "cdnjs.cloudflare.com", "unpkg.com", "jsdelivr.net"
          ].some(p => lowerUrl.includes(p));
          const isStaticFile = /\.(?:json|svg|png|jpe?g|gif|webp|woff2?|css|ico|pdf|js|txt|xml)$/i.test(urlPath);
          if (!isNoise && !isStaticFile) {
            const exists = networkData.apiCalls.some(call => call.url === url && call.method === req.method());
            if (!exists) networkData.apiCalls.push({ url, method: req.method(), status: res.status(), type });
          }
        }
        const cl = res.headers()["content-length"];
        if (cl) networkData.totalBytes += parseInt(cl, 10);
      } catch { }
    });

    const jsErrors = [];
    pageInstance.on("pageerror", err => jsErrors.push({ message: err.message, stack: err.stack || "" }));

    if (signal && signal.aborted) throw new Error("Crawl was cancelled by user.");

    const response = await pageInstance.goto(currentUrl, { waitUntil: "domcontentloaded", timeout }).catch(async () => {
      if (signal && signal.aborted) return null;
      return pageInstance.goto(currentUrl, { waitUntil: "load", timeout }).catch(() => null);
    });

    if (!response) throw new Error("Navigation failed - no response received");

    try {
      await pageInstance.waitForLoadState("networkidle", { timeout: 8000 });
    } catch { }

    try {
      await pageInstance.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 200;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight + 1000) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
        await new Promise(r => setTimeout(r, 300));
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 300));
        window.scrollTo(0, 0);
      });
    } catch { }

    await pageInstance.waitForTimeout(1000);
    await pageInstance.mouse.wheel(0, 3000);
    await pageInstance.waitForTimeout(500);

    if (signal && signal.aborted) throw new Error("Crawl was cancelled by user.");

    const statusCode = response.status();
    const headersMap = response.headers();
    const finalUrl = pageInstance.url();

    const redirectChain = [];
    let reqRef = response.request();
    while (reqRef.redirectedFrom()) {
      reqRef = reqRef.redirectedFrom();
      redirectChain.unshift(reqRef.url());
    }

    const rawHtml = await response.text().catch(() => "");
    const renderedHtml = await pageInstance.content().catch(() => "");

    const mailtoLinks = await pageInstance.$$eval(
      'a[href^="mailto:"]',
      links => links.map(x => x.href)
    );

    // ✅ FIX: Build mailtoEmails array from mailtoLinks
    const mailtoEmails = mailtoLinks
      .map(link =>
        link
          .replace(/^mailto:/i, "")
          .split("?")[0]
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    let directDomText = "";
    let directDomAttributes = "";

    try {
      directDomText = await pageInstance.evaluate(() => document.body ? document.body.innerText : "");
    } catch { }

    try {
      directDomAttributes = await pageInstance.evaluate(() => {
        const parts = [];
        const all = document.querySelectorAll("*");
        for (const el of all) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
          if (el.offsetParent === null && el.tagName !== "BODY" && el.tagName !== "HTML") continue;

          for (const attr of el.attributes || []) {
            if (attr.value && (
              attr.name.startsWith("data-") ||
              attr.name === "title" ||
              attr.name === "aria-label" ||
              attr.name === "alt" ||
              attr.name === "content"
            )) {
              parts.push(attr.value);
            }
          }
        }
        return parts.join(" ");
      });
    } catch { }

    const $clean = cheerio.load(renderedHtml);
    $clean(`script, style, noscript, iframe, svg, canvas, footer script,
      .toastify, .Toastify, [aria-hidden="true"], .hide-scrollbar,
      .sr-only, .visually-hidden`).remove();

    $clean("*").each((_, el) => {
      const style = ($clean(el).attr("style") || "").toLowerCase();
      const cls = ($clean(el).attr("class") || "").toLowerCase();
      if (
        style.includes("display:none") || style.includes("visibility:hidden") ||
        style.includes("opacity:0") || cls.includes("hidden") || cls.includes("toast")
      ) {
        $clean(el).remove();
      }
    });

    $clean("br, p, div, span, a, li, td, th, h1, h2, h3, h4, h5, h6").append(" ");

    const pageText = normalizeWhitespace($clean("body").text());
    const $full = cheerio.load(renderedHtml);

    const title = $full("title").text().trim();
    const metaDescription = $full('meta[name="description"]').attr("content") || "";
    const metaTags = extractMetaTags($full);

    let technologies;
    {
      const scripts = [];
      $full("script[src]").each((_, el) => {
        const src = $full(el).attr("src");
        if (src) scripts.push(normalizeUrl(src, currentUrl).url || src);
      });
      const stylesheets = [];
      $full('link[rel="stylesheet"]').each((_, el) => {
        const href = $full(el).attr("href");
        if (href) stylesheets.push(normalizeUrl(href, currentUrl).url || href);
      });
      technologies = detectTechnologies({
        html: renderedHtml, headers: headersMap, scripts, css: stylesheets, metaTags
      });
    }

    const headings = [];
    $full("h1, h2, h3, h4, h5, h6").each((_, el) => {
      headings.push({ tag: el.name.toLowerCase(), text: $full(el).text().trim() });
    });

    const h1Text = headings.filter(h => h.tag === "h1").map(h => h.text).join(" ");
    const normUrlObj = normalizeUrl(currentUrl);
    const pageType = detectPageType(normUrlObj.pathname, title, h1Text, pageText);
    const isLegalPage = ["privacy", "terms", "refund"].includes(pageType);

    $full("br, p, div, span, a, li, td, th, h1, h2, h3, h4, h5, h6").append(" ");

    const fullBodyText = normalizeWhitespace($full("body").text());
    const footerText = normalizeWhitespace($full("footer").text());
    const addressElText = normalizeWhitespace($full("address").text());
    const metaAddressText = normalizeWhitespace([
      $full('meta[property="place:location:address"]').attr("content"),
      $full('meta[name="address"]').attr("content"),
      $full('meta[property="business:contact_data:street_address"]').attr("content")
    ].filter(Boolean).join(" "));

    const jsonLdAddresses = extractJsonLdAddresses($full);
    const googleMapAddresses = extractGoogleMapAddresses($full);

    // =========================================================================
    // ✅ FIXED: EMAIL EXTRACTION — Multi-source with deduplication
    // =========================================================================

    const emailDedupeMap = new Map();

    const addEmail = (email) => {
      if (!email) return;
      const key = email.toLowerCase().trim().replace(/^mailto:/i, "");
      if (isValidEmail(key) && !emailDedupeMap.has(key)) {
        emailDedupeMap.set(key, key);
      }
    };

    // Source 1: mailto: links (highest confidence)
    $full("a[href^='mailto:'], a[href^='Mailto:'], a[href^='MAILTO:']").each((_, el) => {
      const href = $full(el).attr("href") || "";
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      addEmail(email);
    });

    // Source 2: HTML-based extraction (data attrs, JSON-LD, meta, sections)
    extractEmailsFromHtml($full, currentUrl).forEach(addEmail);

    // Source 3: Direct DOM text
    extractEmails(directDomText).forEach(addEmail);

    // Source 4: DOM attributes
    extractEmails(directDomAttributes).forEach(addEmail);

    // Source 5: Full body text
    extractEmails(fullBodyText).forEach(addEmail);

    // Source 6: Footer text
    extractEmails(footerText).forEach(addEmail);

    // Source 7: Per-element scan
    $full("p, div, span, a, li, td, address, h1, h2, h3, h4, h5, h6, section, article").each((_, el) => {
      const elText = normalizeWhitespace($full(el).text());
      if (elText && elText.includes("@") && elText.length < 2000) {
        extractEmails(elText).forEach(addEmail);
      }
    });

    // Source 8: API/network response emails
    if (networkData.contactData?.emails) {
      networkData.contactData.emails.forEach(addEmail);
    }

    let emails = [...emailDedupeMap.values()];

    emails = emails.filter(email => {
      const local = email.split("@")[0];
      return !emails.some(other => {
        if (other === email) return false;
        const otherLocal = other.split("@")[0];
        const otherDomain = other.split("@")[1];
        const domain = email.split("@")[1];
        return (
          domain === otherDomain &&
          otherLocal.startsWith(local) &&
          otherLocal.length === local.length + 1
        );
      });
    });

    // =========================================================================
    // ✅ FIXED: PHONE EXTRACTION — Multi-source with deduplication
    // =========================================================================

    const phoneCandidates = [];
    const phoneSourceMap = new Map();

    const addPhoneCandidate = (formatted, source) => {
      if (!formatted) return;
      phoneCandidates.push(formatted);
      if (!phoneSourceMap.has(formatted)) phoneSourceMap.set(formatted, source);
    };

    // Source 1: Visible href links (tel:, wa.me, etc.)
    let visibleHrefs = [];
    try {
      visibleHrefs = await pageInstance.evaluate(() => {
        const out = [];
        const anchors = document.querySelectorAll("a[href]");
        for (const a of anchors) {
          const style = window.getComputedStyle(a);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
          if (a.offsetParent === null) continue;
          const rect = a.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const href = a.getAttribute("href") || "";
          if (href) out.push(href);
        }
        return out;
      });
    } catch { }

    for (const href of visibleHrefs) {
      const classified = extractPhoneFromContactHref(href);
      if (classified && classified.formatted) {
        addPhoneCandidate(classified.formatted, `visible-href:${href.substring(0, 50)}`);
      }
    }

    // Source 2: HTML-based extraction (JSON-LD, data attrs, itemprop, sections)
    extractPhonesFromHtml($full, currentUrl).forEach(p => addPhoneCandidate(p, "html-structured"));

    // Source 3: Text-based extraction
    const cleanRawHtml = stripJsonBlobs(rawHtml);
    const cleanRenderedHtml = stripJsonBlobs(renderedHtml);
    const $textOnly = cheerio.load(cleanRenderedHtml);
    $textOnly(`[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"],
      [style*="visibility: hidden"], [aria-hidden="true"], .hidden, .sr-only, .visually-hidden`).remove();
    $textOnly("br, p, div, span, a, li, td, th, h1, h2, h3, h4, h5, h6").append(" ");

    const visibleBodyText = normalizeWhitespace($textOnly("body").text());
    const visibleFooterText = normalizeWhitespace($textOnly("footer").text());

    const safeDirectDom = stripCorporateIdentifiers(directDomText);
    const safeVisibleBody = stripCorporateIdentifiers(visibleBodyText);
    const safeVisibleFooter = stripCorporateIdentifiers(visibleFooterText);

    // ✅ FIX: Also scan all contact/info sections individually
    const contactSectionTexts = [];
    $full("[class*='contact'],[id*='contact'],[class*='reach'],[class*='touch'],[class*='phone'],[class*='tel'],[class*='mobile'],[class*='call'],[class*='support'],[class*='info'],[id*='info']").each((_, el) => {
      const t = normalizeWhitespace($full(el).text());
      if (t && t.length > 5 && t.length < 500) contactSectionTexts.push(t);
    });

    const textScanResults = {
      directDom: extractPhones(safeDirectDom),
      visibleBody: extractPhones(safeVisibleBody),
      visibleFooter: extractPhones(safeVisibleFooter),
      contactSections: contactSectionTexts.flatMap(t => extractPhones(stripCorporateIdentifiers(t))),
    };

    for (const p of textScanResults.directDom) addPhoneCandidate(p, "directDom-text");
    for (const p of textScanResults.visibleBody) addPhoneCandidate(p, "visible-body");
    for (const p of textScanResults.visibleFooter) addPhoneCandidate(p, "visible-footer");
    for (const p of textScanResults.contactSections) addPhoneCandidate(p, "contact-section");

    // ✅ FIX: Deduplicate phones by last-10 digits
    const phoneDedupeMap = new Map();
    for (const p of phoneCandidates) {
      let digits = p.replace(/\D/g, "");
      if (digits.startsWith("91") && digits.length >= 12) digits = digits.substring(2);
      if (digits.startsWith("0")) digits = digits.substring(1);

      let key;
      if (/^1[89]0[06]/.test(digits) || /^1800/.test(digits)) {
        key = digits;
      } else if (digits.length >= 10) {
        key = digits.slice(-10);
      } else if (digits.length >= 7) {
        key = digits;
      } else {
        continue;
      }
      if (!phoneDedupeMap.has(key)) phoneDedupeMap.set(key, p);
    }

    let phones = [...phoneDedupeMap.values()];

    // ✅ FIX: Final phone validation
    phones = phones.filter(p => {
      const digits = p.replace(/\D/g, "").replace(/^91/, "").replace(/^0/, "");
      const checkDigits = digits.length >= 10
        ? digits.slice(-10)
        : digits.padEnd(10, "0").substring(0, 10);
      if (isFakePhone(checkDigits)) return false;
      // For Indian mobiles, must start with 6-9
      if (checkDigits.length === 10 && /^\d{10}$/.test(checkDigits)) {
        if (!/^[6-9]/.test(checkDigits)) return false;
      }
      return true;
    });

    // =========================================================================
    // ✅ FIXED: ADDRESS EXTRACTION — Multi-source with deduplication
    // =========================================================================

    const addressDedupeMap = new Map();

    const addAddress = (addr, priority = 0) => {
      if (!addr || typeof addr !== "string") return;
      addr = normalizeWhitespace(addr);
      if (addr.length < 15 || addr.length > 400) return;

      // ✅ FIX: Use pincode as dedup key
      const pincodeMatch = addr.match(/(\d{6})/);
      const key = pincodeMatch
        ? pincodeMatch[1]
        : addr.toLowerCase().substring(0, 40);

      if (!addressDedupeMap.has(key)) {
        addressDedupeMap.set(key, { addr, priority });
      } else {
        const existing = addressDedupeMap.get(key);
        // Higher priority wins; if equal, shorter address wins (cleaner)
        if (priority > existing.priority ||
          (priority === existing.priority && addr.length >= 20 && addr.length < existing.addr.length)) {
          addressDedupeMap.set(key, { addr, priority });
        }
      }
    };

    // Source 1: Structured data (JSON-LD) — highest priority
    for (const addr of jsonLdAddresses) addAddress(addr, 10);
    for (const addr of googleMapAddresses) addAddress(addr, 9);

    // Source 2: HTML-structured extraction
    const htmlAddresses = extractAddressesFromHtml($full);
    htmlAddresses.forEach(a => addAddress(a, 8));

    // Source 3: Labeled address sections
    const labeledAddressSections = [];
    const ADDRESS_LABEL_REGEX = /\b(?:registered\s+address|business\s+headquarters|corporate\s+office|head\s+office|branch\s+office|registered\s+office|office\s+address|contact\s+(?:info|address)|company\s+(?:location|address)|our\s+(?:address|location)|office\s+location|visit\s+us|where\s+to\s+find\s+us|get\s+directions|physical\s+address|find\s+us|factory\s+address|plant\s+(?:address|location)|work\s+place|workplace)\b/i;

    $full("h1, h2, h3, h4, h5, h6, strong, b, label, p, span, div, th, td").each((_, el) => {
      const text = normalizeWhitespace($full(el).text());
      if (text.length > 80) return;
      if (!ADDRESS_LABEL_REGEX.test(text)) return;
      if (/email|phone|telephone|mobile|website|fax/i.test(text) && !/address|location/i.test(text)) return;

      // Capture parent text
      const parentText = normalizeWhitespace($full(el).parent().text());
      if (parentText && parentText.length < 600 && parentText.length > 20) {
        labeledAddressSections.push(parentText);
      }

      // Next sibling
      const nextEl = $full(el).next();
      if (nextEl.length) {
        const nextText = normalizeWhitespace(nextEl.text());
        if (nextText && nextText.length < 400 && nextText.length > 10) {
          labeledAddressSections.push(nextText);
        }
      }

      // Walk next siblings until pincode found
      let collected = "";
      $full(el).nextAll().slice(0, 8).each((__, sib) => {
        const sibText = normalizeWhitespace($full(sib).text());
        if (sibText && sibText.length < 400) {
          collected = (collected + " " + sibText).trim();
          if (/\b\d{6}\b/.test(sibText) || /\b\d{3}\s\d{3}\b/.test(sibText)) {
            if (collected.length > 20) labeledAddressSections.push(collected);
            return false;
          }
        }
      });
    });

    // Source 4: Universal pincode-block scanner
    $full("p, div, span, address, li, td, h3, h4, h5, h6, section").each((_, el) => {
      const txt = normalizeWhitespace($full(el).text());
      if (!txt || txt.length > 500 || txt.length < 20) return;
      if (!/\b\d{6}\b/.test(txt) && !/\b\d{3}\s\d{3}\b/.test(txt)) return;
      if (/@/.test(txt)) return;
      if (/©|copyright/i.test(txt)) return;
      if (/full\s+name|email\s+id|contact\s+number|project\s+details|enter\s+your|please\s+enter|subscribe|newsletter|terms\s+and\s+conditions|privacy\s+policy/i.test(txt)) return;

      // ✅ FIX: Expanded city/keyword check
      const hasAddressKeyword = new RegExp(
        `\\b(?:${ADDRESS_KEYWORDS}|${INDIAN_CITIES.split("|").slice(0, 30).join("|")})\\b`, "i"
      ).test(txt);
      if (!hasAddressKeyword) return;

      labeledAddressSections.push(txt);
    });

    // Extract from labeled sections
    const labeledExtracted = labeledAddressSections.flatMap(s => extractAddresses(s));
    labeledExtracted.forEach(a => addAddress(a, 7));

    // Source 5: Standard text sources
    const textAddressSources = [
      { text: addressElText, priority: 7 },
      { text: footerText, priority: 6 },
      { text: metaAddressText, priority: 8 },
      { text: fullBodyText, priority: 4 },
      { text: directDomText, priority: 5 },
    ];

    for (const { text, priority } of textAddressSources) {
      extractAddresses(text).forEach(a => addAddress(a, priority));
    }

    // Source 6: Legal page addresses
    if (isLegalPage) {
      extractAddresses(footerText).forEach(a => addAddress(a, 6));
      extractAddresses(addressElText).forEach(a => addAddress(a, 7));
    }

    // Source 7: Network/API response addresses
    if (networkData.contactData?.addresses) {
      networkData.contactData.addresses.forEach(a => addAddress(a, 3));
    }

    let addresses = [...new Set(
      [...addressDedupeMap.values()]
        .sort((a, b) => b.priority - a.priority)
        .map(({ addr }) =>
          addr
            .replace(/\s+/g, " ")
            .replace(/,\s*,/g, ",")
            .replace(/[-–]\s*(\d{3})\s*(\d{3})/, " - $1$2")
            .replace(/,\s*$/, "")
            .trim()
        ).filter(addr => addr.length >= 15)
    )];

    const copyrightSrc = [fullBodyText, footerText, directDomText].join("\n");
    const copyrights = extractCopyrights(copyrightSrc);
    const companyNames = extractCompanyNames(fullBodyText);

    // =========================================================================
    // ✅ GSTIN & CIN EXTRACTION
    // =========================================================================
    const gstinDedupeMap = new Set();
    const cinDedupeMap = new Set();

    [fullBodyText, footerText, directDomText, rawHtml, renderedHtml].forEach(txt => {
      extractGstin(txt).forEach(g => gstinDedupeMap.add(g));
      extractCin(txt).forEach(c => cinDedupeMap.add(c));
    });

    extractGstinFromHtml($full).forEach(g => gstinDedupeMap.add(g));
    extractCinFromHtml($full).forEach(c => cinDedupeMap.add(c));

    if (networkData.contactData?.gstin) {
      networkData.contactData.gstin.forEach(g => gstinDedupeMap.add(g));
    }
    if (networkData.contactData?.cin) {
      networkData.contactData.cin.forEach(c => cinDedupeMap.add(c));
    }

    const gstin = [...gstinDedupeMap];
    const cin = [...cinDedupeMap];

    // Links
    const links = [];
    $full("a").each((_, el) => {
      const href = $full(el).attr("href") || "";
      const linkText = $full(el).text().trim();
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const norm = normalizeUrl(href, currentUrl);
      if (!norm.isValid || isPrivateHostname(norm.hostname)) return;
      const isExternal = norm.host !== seedDomain;
      links.push({ url: norm.url, text: linkText, isExternal });
      if (!isExternal && currentDepth < maxDepth) {
        const qClean = cleanQueryParams(norm.url);
        if (!visited.has(qClean) && !queued.has(qClean)) {

          queued.add(qClean);

          const lowerUrl = qClean.toLowerCase();

          const isPriorityPage =
            lowerUrl.includes("contact") ||
            lowerUrl.includes("contact-us") ||
            lowerUrl.includes("reach-us") ||
            lowerUrl.includes("support") ||
            lowerUrl.includes("about") ||
            lowerUrl.includes("terms") ||
            lowerUrl.includes("privacy") ||
            lowerUrl.includes("legal") ||
            lowerUrl.includes("refund") ||
            lowerUrl.includes("policy");

          if (isPriorityPage) {
            queue.unshift({
              url: qClean,
              depth: currentDepth + 1
            });
          } else {
            queue.push({
              url: qClean,
              depth: currentDepth + 1
            });
          }
        }
      }
    });

    const scripts = [];
    $full("script[src]").each((_, el) => {
      const src = $full(el).attr("src");
      if (src) scripts.push(normalizeUrl(src, currentUrl).url || src);
    });

    const stylesheets = [];
    $full('link[rel="stylesheet"]').each((_, el) => {
      const href = $full(el).attr("href");
      if (href) stylesheets.push(normalizeUrl(href, currentUrl).url || href);
    });

    const images = [];
    $full("img").each((_, el) => {
      const src = $full(el).attr("src") || "";
      const norm = normalizeUrl(src, currentUrl);
      if (norm.isValid) images.push({ url: norm.url, alt: $full(el).attr("alt") || "" });
    });

    // =========================================================================
    // FORM VALIDATION TESTING (Live In-Browser Inspection & Constraint Checks)
    // =========================================================================
    let forms = [];
    try {
      forms = await detectAndTestPageForms(pageInstance, currentUrl, title);
    } catch { }

    // Fallback: static form extraction if browser-side inspection returned empty
    if (!forms || forms.length === 0) {
      $full("form").each((_, el) => {
        const action = $full(el).attr("action") || "";
        const method = ($full(el).attr("method") || "GET").toUpperCase();
        const inputs = [];
        $full(el).find("input, select, textarea").each((__, inp) => {
          inputs.push({
            name: $full(inp).attr("name") || $full(inp).attr("id") || "",
            type: $full(inp).attr("type") || inp.name.toLowerCase(),
          });
        });
        forms.push({
          pageUrl: currentUrl,
          pageTitle: title,
          formId: $full(el).attr("id") || "form-static",
          formName: $full(el).attr("name") || "form-static",
          formAction: action ? (normalizeUrl(action, currentUrl).url || action) : currentUrl,
          formMethod: method,
          formType: "general",
          overallStatus: "NOT_TESTED",
          totalFields: inputs.length,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          fields: inputs.map(inp => ({
            fieldName: inp.name,
            fieldType: inp.type,
            required: false,
            semanticType: "text",
            expectedValidation: "Standard text",
            validationStatus: "NOT_TESTED",
            overallFieldStatus: "NOT_TESTED",
            tests: [],
          })),
          action: action ? (normalizeUrl(action, currentUrl).url || action) : currentUrl,
          method,
          inputs,
        });
      });
    }

    let perfMetrics = { loadTime: 0, domContentLoaded: 0 };
    try {
      const timing = await pageInstance.evaluate(() => JSON.stringify(window.performance.timing));
      const pt = JSON.parse(timing);
      perfMetrics.loadTime = pt.loadEventEnd - pt.navigationStart;
      perfMetrics.domContentLoaded = pt.domContentLoadedEventEnd - pt.navigationStart;
    } catch { }

    const cookies = await context.cookies([currentUrl]).catch(() => []);
    const securityHeaders = extractSecurityHeaders(headersMap);

    if (signal && signal.aborted) throw new Error("Crawl was cancelled by user.");

    const screenshots = { desktop: null, mobile: null };

    const crawlPage = new CrawlPage({
      reportId: jobId, url: currentUrl, finalUrl, redirectChain, pageType,
      title, metaDescription, metaTags, depth: currentDepth, statusCode,
      emails, phones, addresses, copyrights, companyNames, gstin, cin, technologies,
      links, images, headings, forms, scripts, stylesheets,
      apiCalls: networkData.apiCalls,
      jsErrors: jsErrors.map(e => e.message + (e.stack ? ` | ${e.stack}` : "")),
      cookies,
      performanceMetrics: {
        loadTime: perfMetrics.loadTime,
        domContentLoaded: perfMetrics.domContentLoaded,
        totalRequests: networkData.totalRequests,
        failedRequests: networkData.failedRequests,
      },
      screenshots, securityHeaders, responseHeaders: headersMap,
      rawHtml, rawText: pageText,
    });

    await crawlPage.save();
    onSaved();
    onDepthUpdate(currentDepth);

    await writeLog(jobId,
      `✔ Saved [${pageType}] ${currentUrl} — Emails: ${emails.length}, Phones: ${phones.length}, Addresses: ${addresses.length}, Forms: ${forms.length} (Tested fields: ${forms.reduce((acc, f) => acc + (f.fields ? f.fields.length : 0), 0)}), GSTIN: ${gstin.length}, CIN: ${cin.length}`,
      "info", "crawl"
    );

  } catch (pageErr) {
    if (signal && signal.aborted) return;
    await writeLog(jobId, `✖ Failed: ${currentUrl} — ${pageErr.message}`, "error", "crawl");
    try {
      await new CrawlPage({
        reportId: jobId, url: currentUrl, depth: currentDepth, statusCode: 0,
        pageType: "error", securityIssues: [`Crawl error: ${pageErr.message}`],
      }).save();
    } catch { }
  } finally {
    if (pageInstance) await pageInstance.close().catch(() => { });
  }
}

module.exports = {
  crawlWebsite,
  normalizeUrl,
  extractGstin,
  extractCin,
  isPrivateHostname,
};