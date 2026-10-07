/**
 * Analyzes SEO parameters of a single page and returns a detailed audit.
 * 
 * @param {object} page Crawled page object.
 * @returns {object} Page SEO audit.
 */
function analyzePageSEO(page) {
  const issues = [];
  let score = 100;

  const title = page.title || "";
  const description = page.metaDescription || "";
  const headings = page.headings || [];
  const images = page.images || [];
  const url = page.url || "";

  // 1. Audit Title Tag
  if (!title) {
    score -= 25;
    issues.push({
      item: "title_missing",
      severity: "HIGH",
      message: "The page is missing a <title> tag.",
      recommendation: "Add a descriptive <title> tag between 30 and 60 characters long.",
    });
  } else {
    if (title.length < 30) {
      score -= 5;
      issues.push({
        item: "title_short",
        severity: "LOW",
        message: `The title tag is too short (${title.length} chars).`,
        recommendation: "Extend the title length to be between 30 and 60 characters to optimize keywords.",
      });
    } else if (title.length > 60) {
      score -= 5;
      issues.push({
        item: "title_long",
        severity: "LOW",
        message: `The title tag is too long (${title.length} chars).`,
        recommendation: "Shorten the title length to under 60 characters to prevent truncation in search result snippets.",
      });
    }
  }

  // 2. Audit Meta Description
  if (!description) {
    score -= 20;
    issues.push({
      item: "description_missing",
      severity: "HIGH",
      message: "The page is missing a meta description.",
      recommendation: "Add a compelling meta description tag between 110 and 160 characters long to improve click-through rates.",
    });
  } else {
    if (description.length < 100) {
      score -= 5;
      issues.push({
        item: "description_short",
        severity: "LOW",
        message: `The meta description is too short (${description.length} chars).`,
        recommendation: "Expand the description to between 110 and 160 characters to provide complete details.",
      });
    } else if (description.length > 160) {
      score -= 5;
      issues.push({
        item: "description_long",
        severity: "LOW",
        message: `The meta description is too long (${description.length} chars).`,
        recommendation: "Shorten the description under 160 characters to keep it from cutting off in SERP widgets.",
      });
    }
  }

  // 3. Heading Hierarchy Audit (H1 tags)
  const h1Count = headings.filter(h => h.tag === "h1").length;
  if (h1Count === 0) {
    score -= 15;
    issues.push({
      item: "h1_missing",
      severity: "MEDIUM",
      message: "No H1 heading was found on this page.",
      recommendation: "Define exactly one primary H1 heading to serve as the core thematic title of your content.",
    });
  } else if (h1Count > 1) {
    score -= 10;
    issues.push({
      item: "h1_multiple",
      severity: "MEDIUM",
      message: `Multiple H1 headings found (${h1Count} total).`,
      recommendation: "Restructure headings to use a single H1, and represent sub-topics using hierarchically arranged H2 or H3 nodes.",
    });
  }

  // 4. Canonical Link Tag
  const getHeader = (headers, name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] || headers[name.toLowerCase()];
  };
  const linkHeader = getHeader(page.responseHeaders, "link") || "";
  const hasCanonical = linkHeader.includes('rel="canonical"') || 
    (page.metaTags && page.metaTags.canonical) ||
    (page.renderedHtml && page.renderedHtml.includes('rel="canonical"'));
  
  if (!hasCanonical) {
    score -= 10;
    issues.push({
      item: "canonical_missing",
      severity: "MEDIUM",
      message: "No canonical tag found.",
      recommendation: "Implement self-referencing canonical links to clarify duplicate URL parameters for indexing robots.",
    });
  }

  // 5. Image Alt Tags Audit
  const missingAlts = images.filter(img => !img.alt || img.alt.trim() === "");
  if (images.length > 0 && missingAlts.length > 0) {
    const percent = Math.round((missingAlts.length / images.length) * 100);
    // penalty scales with severity of missing tags, capped at 15
    const penalty = Math.min(15, Math.ceil(percent * 0.15));
    score -= penalty;

    issues.push({
      item: "images_missing_alt",
      severity: percent > 50 ? "MEDIUM" : "LOW",
      message: `${missingAlts.length} out of ${images.length} images are missing alternative text (alt tags).`,
      recommendation: "Ensure all images have a brief, descriptive alt attribute to support screen readers and image-based discovery.",
      images: missingAlts.slice(0, 10).map(img => img.url), // show up to 10 examples
    });
  }

  return {
    url,
    score: Math.max(0, score),
    issues,
    imagesAnalyzedCount: images.length,
    missingAltCount: missingAlts.length,
  };
}

/**
 * Aggregates individual page SEO audits to produce global report metrics.
 */
function aggregateReportSEO(pageAudits) {
  if (pageAudits.length === 0) return { score: 0, issues: [] };

  const totalScore = pageAudits.reduce((acc, curr) => acc + curr.score, 0);
  const averageScore = Math.round(totalScore / pageAudits.length);

  // Pool all distinct issues and link them to affected URLs
  const pooledIssues = {};

  pageAudits.forEach((audit) => {
    audit.issues.forEach((issue) => {
      const key = `${issue.item}:${issue.message}`;
      if (!pooledIssues[key]) {
        pooledIssues[key] = {
          category: "seo",
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
  analyzePageSEO,
  aggregateReportSEO,
};
