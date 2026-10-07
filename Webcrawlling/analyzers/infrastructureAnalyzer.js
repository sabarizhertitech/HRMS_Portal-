"use strict";

/**
 * =============================================================================
 * infrastructureAnalyzer.js — Enterprise Infrastructure Intelligence Engine
 * =============================================================================
 *
 * Detects:
 *   - Hosting provider (AWS, GCP, Azure, DigitalOcean, OVH, Hetzner...)
 *   - Deployment platform (Vercel, Netlify, Firebase Hosting, GitHub Pages...)
 *   - CDN provider (Cloudflare, AWS CloudFront, Fastly, Akamai, BunnyCDN...)
 *   - DNS provider (Cloudflare DNS, Route53, Google Cloud DNS...)
 *   - Cloud provider inferred from ASN/WHOIS
 *   - Country/region from WHOIS
 *
 * Detection methods:
 *   - Response headers analysis (primary)
 *   - WHOIS lookup on resolved IP
 *   - DNS NS record lookup
 *   - DNS reverse lookup
 *
 * Fault-tolerant: any individual lookup failure returns "Unknown" gracefully.
 */

const axios = require("axios");
const dns   = require("dns").promises;
const { URL } = require("url");

// Conditionally use whois-json (may not be installed on all systems)
let whoisLookup;
try {
  whoisLookup = require("whois-json");
} catch {
  whoisLookup = null;
}

// ============================================================================
// SECTION 1: HEADER-BASED DETECTION RULES
// ============================================================================

const DEPLOYMENT_RULES = [
  { platform: "Vercel",        headers: ["x-vercel-id", "x-vercel-cache"] },
  { platform: "Netlify",       headers: ["x-nf-request-id", "netlify-vary"] },
  { platform: "Firebase Hosting", pattern: (h) => /firebase/i.test(h.server || "") },
  { platform: "GitHub Pages",  pattern: (h) => /github/i.test(h.server || "") || /fastly/i.test(h.via || "") && /github/i.test(h["x-served-by"] || "") },
  { platform: "Render",        headers: ["x-render-origin-server"] },
  { platform: "Railway",       pattern: (h) => /railway/i.test(h.server || "") },
  { platform: "Fly.io",        headers: ["fly-request-id"] },
  { platform: "Heroku",        headers: ["x-request-id", "via"], pattern: (h) => /heroku/i.test(h.via || "") || /heroku/i.test(h["x-powered-by"] || "") },
  { platform: "AWS Amplify",   pattern: (h) => /amplify/i.test(h.server || "") || /amplify/i.test(h.via || "") },
  { platform: "Azure Static",  pattern: (h) => /azure/i.test(h.server || "") || (h["x-azure-ref"] !== undefined) },
];

const CDN_RULES = [
  { cdn: "Cloudflare",    headers: ["cf-ray", "cf-cache-status"],               pattern: (h) => /cloudflare/i.test(h.server || "") },
  { cdn: "AWS CloudFront", headers: ["x-amz-cf-id"],                            pattern: (h) => /cloudfront/i.test(h.via || "") },
  { cdn: "Fastly",        headers: ["x-fastly-request-id", "x-served-by"],      pattern: (h) => /fastly/i.test(h.server || "") },
  { cdn: "Akamai",        headers: ["x-akamai-transformed", "x-check-cacheable"],pattern: (h) => /akamai/i.test(h.server || "") },
  { cdn: "BunnyCDN",      headers: ["server"], pattern: (h) => /bunny/i.test(h.server || "") },
  { cdn: "KeyCDN",        headers: ["server"], pattern: (h) => /keycdn/i.test(h.server || "") },
  { cdn: "Sucuri",        headers: ["x-sucuri-id", "x-sucuri-cache"] },
  { cdn: "Imperva",       headers: ["x-iinfo"] },
];

const HOSTING_WHOIS_RULES = [
  { provider: "AWS",          keywords: ["amazon", "amazonaws"] },
  { provider: "Google Cloud", keywords: ["google"] },
  { provider: "Azure",        keywords: ["microsoft", "azure"] },
  { provider: "DigitalOcean", keywords: ["digitalocean"] },
  { provider: "Cloudflare",   keywords: ["cloudflare"] },
  { provider: "OVH",          keywords: ["ovh"] },
  { provider: "Hetzner",      keywords: ["hetzner"] },
  { provider: "GoDaddy",      keywords: ["godaddy"] },
  { provider: "Hostinger",    keywords: ["hostinger"] },
  { provider: "Linode / Akamai", keywords: ["linode", "akamai"] },
  { provider: "Vultr",        keywords: ["vultr"] },
  { provider: "Alibaba Cloud", keywords: ["alibaba", "aliyun"] },
  { provider: "Tencent Cloud", keywords: ["tencent"] },
  { provider: "Jio Cloud",    keywords: ["reliance", "jio"] },
  { provider: "BSNL",         keywords: ["bsnl"] },
  { provider: "Airtel",       keywords: ["airtel", "bharti"] },
];

const DNS_PROVIDER_RULES = [
  { provider: "Cloudflare DNS", keywords: ["cloudflare.com"] },
  { provider: "AWS Route53",    keywords: ["awsdns", "amazonaws"] },
  { provider: "Google Cloud DNS", keywords: ["googledomains", "google.com"] },
  { provider: "GoDaddy DNS",    keywords: ["domaincontrol", "godaddy"] },
  { provider: "Namecheap DNS",  keywords: ["registrar-servers.com", "namecheap"] },
  { provider: "Vercel DNS",     keywords: ["vercel-dns", "vercel.com"] },
  { provider: "Netlify DNS",    keywords: ["nsone.net", "netlify"] },
  { provider: "Hostinger DNS",  keywords: ["hostinger.com"] },
  { provider: "BigRock DNS",    keywords: ["bigrock.com"] },
  { provider: "Bluehost DNS",   keywords: ["bluehost.com"] },
];

// ============================================================================
// SECTION 2: HEADER-BASED DETECTION HELPERS
// ============================================================================

function detectFromHeaders(rules, headers) {
  for (const rule of rules) {
    if (rule.headers) {
      for (const hdr of rule.headers) {
        if (headers[hdr] !== undefined) {
          return rule.platform || rule.cdn || rule.provider;
        }
      }
    }
    if (rule.pattern && rule.pattern(headers)) {
      return rule.platform || rule.cdn || rule.provider;
    }
  }
  return null;
}

// ============================================================================
// SECTION 3: WHOIS-BASED HOSTING DETECTION
// ============================================================================

async function queryWhoisData(ipAddress) {
  if (!whoisLookup || !ipAddress) return { hostingProvider: "Unknown", country: "" };
  try {
    const data = await whoisLookup(ipAddress);
    const text = JSON.stringify(data).toLowerCase();
    const country = data.country || data.Country || "";
    
    let hostingProvider = "Unknown";
    for (const rule of HOSTING_WHOIS_RULES) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        hostingProvider = rule.provider;
        break;
      }
    }
    return { hostingProvider, country };
  } catch {
    return { hostingProvider: "Unknown", country: "" };
  }
}

// ============================================================================
// SECTION 4: DNS NS RECORD DETECTION
// ============================================================================

async function detectDnsProvider(hostname) {
  try {
    const nsRecords = await dns.resolveNs(hostname).catch(() => []);
    const joined    = nsRecords.join(" ").toLowerCase();
    for (const rule of DNS_PROVIDER_RULES) {
      if (rule.keywords.some(kw => joined.includes(kw))) {
        return rule.provider;
      }
    }
    if (nsRecords.length > 0) return `Custom (${nsRecords[0]})`;
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

// ============================================================================
// SECTION 5: MAIN ANALYZER
// ============================================================================

/**
 * Analyzes the infrastructure of a target URL.
 *
 * @param {string} targetUrl - The root URL of the website being analyzed.
 * @returns {Promise<object>} Infrastructure intelligence object.
 */
async function analyzeInfrastructure(targetUrl) {
  const result = {
    hostname:           "",
    ipAddress:          "",
    hostingProvider:    "Unknown",
    deploymentPlatform: "Unknown",
    cdnProvider:        "Unknown",
    dnsProvider:        "Unknown",
    cloudProvider:      "Unknown",
    country:            "",
  };

  let parsedHostname;
  try {
    parsedHostname = new URL(targetUrl).hostname;
    result.hostname = parsedHostname;
  } catch {
    return { ...result, error: "Invalid URL" };
  }

  // --- Resolve IP ---
  try {
    const dnsResult  = await dns.lookup(parsedHostname);
    result.ipAddress = dnsResult.address;
  } catch {
    result.ipAddress = "";
  }

  // --- Fetch headers ---
  let headers = {};
  try {
    const response = await axios.get(targetUrl, {
      timeout:        8000,
      maxRedirects:   5,
      validateStatus: () => true,
      headers:        { "User-Agent": "WebAudit-InfraScanner/3.0" },
    });
    headers = response.headers || {};
  } catch {}

  // --- Header-based detection (fast, no DNS) ---
  result.deploymentPlatform = detectFromHeaders(DEPLOYMENT_RULES, headers) || "Unknown";
  result.cdnProvider        = detectFromHeaders(CDN_RULES, headers) || "Unknown";

  // Infer cloud provider from CDN/deployment hints
  if (result.cdnProvider === "AWS CloudFront" || result.deploymentPlatform.includes("AWS")) {
    result.cloudProvider = "AWS";
  } else if (result.cdnProvider === "Cloudflare") {
    result.cloudProvider = "Cloudflare";
  } else if (result.deploymentPlatform === "Vercel") {
    result.cloudProvider = "Vercel / AWS";
  } else if (result.deploymentPlatform === "Firebase Hosting") {
    result.cloudProvider = "Google Cloud";
  } else if (result.deploymentPlatform === "Azure Static") {
    result.cloudProvider = "Azure";
  }

  // --- Parallel async lookups (WHOIS + DNS) ---
  const [whoisData, dnsProvider] = await Promise.all([
    result.ipAddress ? queryWhoisData(result.ipAddress) : Promise.resolve({ hostingProvider: "Unknown", country: "" }),
    detectDnsProvider(parsedHostname),
  ]);

  result.hostingProvider = whoisData.hostingProvider;
  result.dnsProvider     = dnsProvider;
  result.country         = whoisData.country;

  // If cloudProvider still unknown and hosting is detected:
  if (result.cloudProvider === "Unknown") {
    if (["AWS", "Google Cloud", "Azure", "DigitalOcean", "Vultr", "Linode / Akamai"].includes(result.hostingProvider)) {
      result.cloudProvider = result.hostingProvider;
    }
  }

  return result;
}

module.exports = {
  analyzeInfrastructure,
};
