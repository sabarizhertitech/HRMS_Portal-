const mongoose = require("mongoose");
const { Schema } = mongoose;
const { crawlerDB } = require("../utils/dbConnections");


const CrawlReportSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "crawling", "analyzing", "completed", "failed", "cancelled"],
      default: "pending",
    },

    error: {
      type: String,
      default: null,
    },

    depthReached: {
      type: Number,
      default: 0,
    },

    totalPagesScanned: {
      type: Number,
      default: 0,
    },

    crawlTimeMs: {
      type: Number,
      default: 0,
    },


    scores: {
      risk: { type: Number, default: 0 },
      seo: { type: Number, default: 0 },
      security: { type: Number, default: 0 },
      compliance: { type: Number, default: 0 },
      infrastructure: { type: Number, default: 0 },
      operational: { type: Number, default: 0 },
    },

    riskSeverity: {
      type: String,
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
      default: "LOW",
    },


    executiveSummary: { type: String, default: "" },
    securitySummary: { type: String, default: "" },
    infrastructureSummary: { type: String, default: "" },

    technologySummary: { type: Schema.Types.Mixed, default: {} },
    operationalSummary: { type: Schema.Types.Mixed, default: {} },
    complianceSummary: { type: Schema.Types.Mixed, default: {} },


    infrastructure: {
      hostingProvider: { type: String, default: "" },
      deploymentPlatform: { type: String, default: "" },
      cdnProvider: { type: String, default: "" },
      ipAddress: { type: String, default: "" },
    },


    ssl: {
      isValid: { type: Boolean, default: false },
      issuer: { type: String, default: "" },
      validFrom: { type: Date, default: null },
      validTo: { type: Date, default: null },
      daysRemaining: { type: Number, default: 0 },
      error: { type: String, default: null },
    },


    technologies: [{ type: String }],


    issues: [
      {
        issueId: { type: String },
        category: {
          type: String,
          enum: [
            "security", "seo", "compliance", "ssl",
            "infrastructure", "operational", "technology",
            "risk", "broken_link", "form_validation",
          ],
        },
        severity: {
          type: String,
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
        },
        confidence: { type: Number, default: 0 },
        title: { type: String },
        description: { type: String },
        recommendation: { type: String },
        evidence: [{ type: String }],
        affectedUrls: [{ type: String }],
        sourceAnalyzer: { type: String },
      },
    ],

    formValidationSummary: {
      totalForms: { type: Number, default: 0 },
      totalFieldsTested: { type: Number, default: 0 },
      totalTestsRun: { type: Number, default: 0 },
      passedCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      formsPassed: { type: Number, default: 0 },
      formsFailed: { type: Number, default: 0 },
      formsPartial: { type: Number, default: 0 },
      formsNotTested: { type: Number, default: 0 },
      overallStatus: {
        type: String,
        enum: ["PASS", "FAIL", "PARTIAL", "NOT_TESTED"],
        default: "NOT_TESTED",
      },
      forms: { type: Schema.Types.Mixed, default: [] },
      reportRows: { type: Schema.Types.Mixed, default: [] },
      fieldSummaries: { type: Schema.Types.Mixed, default: [] },
    },
  },
  {
    timestamps: true,
    collection: "crawl_reports",
  }
);

CrawlReportSchema.index({ url: 1 });
CrawlReportSchema.index({ createdAt: -1 });
CrawlReportSchema.index({ status: 1 });



const CrawlPageSchema = new Schema(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "CrawlReport",
      required: true,
    },


    url: { type: String, required: true },
    finalUrl: { type: String, default: "" },
    pageType: { type: String, default: "general" },
    title: { type: String, default: "" },
    metaDescription: { type: String, default: "" },


    metaTags: {
      type: Schema.Types.Mixed,
      default: {},
    },

    depth: { type: Number, default: 0 },
    statusCode: { type: Number, default: 200 },

    redirectChain: [{ type: String }],


    rawHtml: { type: String, default: "" },
    rawText: { type: String, default: "" },


    emails: [{ type: String }],
    phones: [{ type: String }],
    addresses: [{ type: String }],
    companyNames: [{ type: String }],
    copyrights: [{ type: String }],
    gstin: [{ type: String }],
    cin: [{ type: String }],


    links: [
      {
        url: { type: String },
        text: { type: String, default: "" },
        isExternal: { type: Boolean, default: false },
      },
    ],


    images: [
      {
        url: { type: String },
        alt: { type: String, default: "" },
      },
    ],


    screenshots: {
      desktop: { type: String, default: null },
      mobile: { type: String, default: null },
    },


    headings: [
      {
        tag: { type: String },
        text: { type: String },
      },
    ],


    forms: [
      {
        type: Schema.Types.Mixed,
      },
    ],


    scripts: [{ type: String }],
    stylesheets: [{ type: String }],
    technologies: [{ type: String }],


    apiCalls: [
      {
        url: { type: String },
        method: { type: String },
        status: { type: Number },
        type: { type: String },
      },
    ],


    performanceMetrics: {
      loadTime: { type: Number, default: 0 },
      domContentLoaded: { type: Number, default: 0 },
      totalRequests: { type: Number, default: 0 },
      failedRequests: { type: Number, default: 0 },
    },


    jsErrors: [{ type: String }],


    cookies: [
      {
        name: { type: String },
        secure: { type: Boolean },
        httpOnly: { type: Boolean },
        sameSite: { type: String },
      },
    ],

    securityHeaders: {
      csp: { type: String, default: null },
      hsts: { type: String, default: null },
      xFrameOptions: { type: String, default: null },
      xContentTypeOptions: { type: String, default: null },
      referrerPolicy: { type: String, default: null },
      permissionsPolicy: { type: String, default: null },
    },

    responseHeaders: {
      type: Map,
      of: String,
    },


    seoScore: { type: Number, default: 0 },
    securityIssues: [{ type: String }],
  },
  {
    timestamps: true,
    collection: "crawl_pages",
  }
);

CrawlPageSchema.index({ reportId: 1 });
CrawlPageSchema.index({ url: 1 });
CrawlPageSchema.index({ pageType: 1 });
CrawlPageSchema.index({ statusCode: 1 });

const CrawlReport = crawlerDB.model("CrawlReport", CrawlReportSchema);
const CrawlPage   = crawlerDB.model("CrawlPage",   CrawlPageSchema);

module.exports = { CrawlReport, CrawlPage };