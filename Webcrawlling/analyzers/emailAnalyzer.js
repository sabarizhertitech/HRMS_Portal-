"use strict";

const dns = require("dns").promises;

// =====================================================
// Email Categories
// =====================================================

const EMAIL_CATEGORIES = {
    support: [
        "support",
        "help",
        "service",
        "customer",
        "care",
        "contact"
    ],

    sales: [
        "sales",
        "marketing",
        "business",
        "enquiry",
        "inquiry"
    ],

    hr: [
        "hr",
        "career",
        "careers",
        "jobs",
        "recruitment",
        "recruit"
    ],

    billing: [
        "billing",
        "accounts",
        "finance",
        "payments",
        "invoice"
    ],

    technical: [
        "tech",
        "technical",
        "admin",
        "it",
        "security",
        "webmaster"
    ],

    media: [
        "media",
        "press",
        "news",
        "pr"
    ]
};

// =====================================================
// Generic Email Providers
// =====================================================

const GENERIC_PROVIDERS = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "ymail.com",
    "rocketmail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "aol.com",
    "protonmail.com",
    "proton.me",
    "zoho.com",
    "gmx.com",
    "mail.com",
    "yandex.com"
]);

// =====================================================
// Email Category
// =====================================================

function classifyEmail(email = "") {

    const localPart =
        email
            .split("@")[0]
            .toLowerCase();

    for (const [category, keywords] of Object.entries(EMAIL_CATEGORIES)) {

        if (
            keywords.some(keyword =>
                localPart.includes(keyword)
            )
        ) {
            return category;
        }

    }

    return "general";
}

// =====================================================
// Business vs Generic
// =====================================================

function detectEmailType(email = "") {

    const domain =
        email
            .split("@")[1]
            ?.toLowerCase()
            ?.trim();

    if (!domain) {
        return "unknown";
    }

    return GENERIC_PROVIDERS.has(domain)
        ? "generic"
        : "business";
}

// =====================================================
// MX Validation
// =====================================================

async function validateMX(email = "") {

    try {

        const domain =
            email
                .split("@")[1]
                ?.toLowerCase()
                ?.trim();

        if (!domain) {
            return false;
        }

        const records =
            await dns.resolveMx(domain);

        return (
            Array.isArray(records) &&
            records.length > 0
        );

    } catch {

        return false;
    }

}

// =====================================================
// Domain Match
// =====================================================

function domainMatchesWebsite(
    email = "",
    websiteDomain = ""
) {

    try {

        const emailDomain =
            email
                .split("@")[1]
                ?.toLowerCase()
                ?.trim();

        const siteDomain =
            websiteDomain
                .toLowerCase()
                .replace(/^www\./, "")
                .trim();

        return emailDomain === siteDomain;

    } catch {

        return false;

    }

}

// =====================================================
// Confidence Score
// =====================================================

function calculateConfidence({
    email,
    mxValid,
    domainMatch
}) {

    let score = 40;

    if (email && email.includes("@")) {
        score += 20;
    }

    if (mxValid) {
        score += 20;
    }

    if (domainMatch) {
        score += 15;
    }

    if (
        detectEmailType(email) ===
        "business"
    ) {
        score += 5;
    }

    return Math.min(
        Math.max(score, 0),
        100
    );

}

// =====================================================
// Full Analyzer
// =====================================================

async function analyzeEmail(
    email,
    websiteDomain
) {

    const mxValid =
        await validateMX(email);

    const domainMatch =
        domainMatchesWebsite(
            email,
            websiteDomain
        );

    return {
        email,
        category:
            classifyEmail(email),

        type:
            detectEmailType(email),

        mxValid,

        domainMatch,

        confidence:
            calculateConfidence({
                email,
                mxValid,
                domainMatch
            })
    };

}

// =====================================================
// Bulk Analyzer
// =====================================================

async function analyzeEmails(
    emails = [],
    websiteDomain = ""
) {

    const uniqueEmails =
        [...new Set(emails)];

    return Promise.all(
        uniqueEmails.map(email =>
            analyzeEmail(
                email,
                websiteDomain
            )
        )
    );

}

module.exports = {
    classifyEmail,
    detectEmailType,
    validateMX,
    domainMatchesWebsite,
    calculateConfidence,
    analyzeEmail,
    analyzeEmails
};