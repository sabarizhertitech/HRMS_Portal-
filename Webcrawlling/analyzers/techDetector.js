"use strict";

/**
 * @module techDetector
 */

// ============================================================================
// SECTION 1: FINGERPRINTS
// ============================================================================

const FINGERPRINTS = [

  // ==========================================================================
  // 🔥 CORE WEB TECHNOLOGIES — always present on any HTML page
  // ==========================================================================

  {
    name: "HTML5",
    category: "language",
    html: [
      { pattern: /<!DOCTYPE\s+html>/i, confidence: 100 },
      { pattern: /<html[^>]*>/i, confidence: 80 },
    ],
  },

  {
    name: "CSS3",
    category: "language",
    html: [
      { pattern: /<link[^>]+rel=["']stylesheet["']/i, confidence: 90 },
      { pattern: /<style[^>]*>[\s\S]*?<\/style>/i, confidence: 80 },
    ],
    css: [
      { pattern: /\.css(\?|$)/i, confidence: 95 },
    ],
  },

  {
    name: "JavaScript",
    category: "language",
    html: [
      { pattern: /<script\b/i, confidence: 95 },
    ],
    script: [
      { pattern: /\.js(\?|$)/i, confidence: 90 },
      { pattern: /\.mjs(\?|$)/i, confidence: 95 },
    ],
  },

  {
    name: "TypeScript",
    category: "language",
    html: [
      { pattern: /\.ts\.map/i, confidence: 100 },
      { pattern: /sourceMappingURL=[^"'\s]+\.ts/i, confidence: 100 },
      { pattern: /\/\/# sourceURL=.+\.tsx?/i, confidence: 95 },
    ],
    script: [
      { pattern: /\.tsx?(\?|$)/i, confidence: 95 },
    ],
  },

  // ==========================================================================
  // BACKEND LANGUAGES (need STRONG evidence — at least header or unique HTML)
  // ==========================================================================

  {
    name: "Python",
    category: "language",
    header: {
      "x-powered-by": /python|django|flask|fastapi|tornado|starlette/i,
      "server": /python|gunicorn|uvicorn|waitress|mod_wsgi/i,
    },
    html: [
      { pattern: /csrfmiddlewaretoken/i, confidence: 95 },
      { pattern: /Traceback \(most recent call last\)/i, confidence: 100 },
    ],
  },

  {
    name: "PHP",
    category: "language",
    header: {
      "x-powered-by": /php\//i,
      "server": /php/i,
    },
    html: [
      { pattern: /\.php(?:\?|["']|$)/i, confidence: 85 },
      { pattern: /PHPSESSID/i, confidence: 95 },
      { pattern: /Fatal error:.*on line \d+/i, confidence: 100 },
    ],
    version: {
      pattern: /PHP\/([0-9]+\.[0-9]+)/i,
      source: "header:x-powered-by",
    },
  },

  {
    name: "Ruby",
    category: "language",
    header: {
      "x-powered-by": /phusion|rails|ruby/i,
      "x-runtime": /^\d+\.\d+$/,
      "server": /passenger|puma|thin|unicorn|webrick/i,
    },
    html: [
      { pattern: /rails-ujs/i, confidence: 95 },
      { pattern: /action_cable/i, confidence: 90 },
    ],
  },

  {
    name: "Java",
    category: "language",
    header: {
      "x-powered-by": /servlet|jsp|java|spring|tomcat|jboss|wildfly/i,
      "server": /apache-coyote|tomcat|jboss|jetty|undertow|weblogic|websphere/i,
    },
    html: [
      { pattern: /\.jsp(?:\?|["']|$)/i, confidence: 95 },
      { pattern: /jsessionid/i, confidence: 100 },
      { pattern: /\/WEB-INF\//i, confidence: 95 },
    ],
    version: {
      pattern: /Apache Tomcat\/([0-9]+\.[0-9]+)/i,
      source: "header:server",
    },
  },

  {
    name: "Go",
    category: "language",
    header: {
      "server": /go-http-server|gin|echo|fiber|beego|gorilla/i,
    },
  },

  {
    name: ".NET / C#",
    category: "language",
    header: {
      "x-powered-by": /asp\.net/i,
      "x-aspnet-version": /.*/i,
      "x-aspnetmvc-version": /.*/i,
      "server": /microsoft-iis/i,
    },
    html: [
      { pattern: /__VIEWSTATE/i, confidence: 100 },
      { pattern: /__EVENTVALIDATION/i, confidence: 100 },
      { pattern: /\.aspx(?:\?|["']|$)/i, confidence: 95 },
      { pattern: /ASP\.NET_SessionId/i, confidence: 95 },
    ],
    version: {
      pattern: /ASP\.NET ([0-9]+\.[0-9]+)/i,
      source: "header:x-powered-by",
    },
  },

  {
    name: "Node.js",
    category: "language",
    header: {
      "x-powered-by": /express|node\.js|nodejs/i,
      "server": /node(?:\.js)?/i,
    },
  },

  // ==========================================================================
  // FRONTEND FRAMEWORKS
  // ==========================================================================

  {
    name: "Next.js",
    category: "frontend-framework",
    implies: ["React", "Node.js", "JavaScript"],
    header: {
      "x-nextjs-cache": /.*/i,
      "x-powered-by": /next\.js/i,
    },
    html: [
      { pattern: /id=["']__NEXT_DATA__["']/i, confidence: 100 },
      { pattern: /__NEXT_DATA__\s*=/, confidence: 100 },
      { pattern: /id=["']___next["']/i, confidence: 95 },
      { pattern: /\/_next\/static\//, confidence: 95 },
      { pattern: /\/_next\/image\?/, confidence: 90 },
    ],
    script: [
      { pattern: /\/_next\/static\/chunks\//, confidence: 95 },
    ],
  },

  {
    name: "React",
    category: "frontend-framework",
    implies: ["JavaScript"],
    html: [
      { pattern: /data-reactroot(=["']["'])?/i, confidence: 95 },
      { pattern: /data-reactid=/i, confidence: 90 },
      { pattern: /react-dom\.production\.min\.js/i, confidence: 95 },
      { pattern: /__reactFiber\$/i, confidence: 95 },
      { pattern: /__reactProps\$/i, confidence: 95 },
      { pattern: /__REACT_DEVTOOLS_GLOBAL_HOOK__/i, confidence: 95 },
      { pattern: /id=["']root["']/i, confidence: 85 },
    ],
    script: [
      { pattern: /\/react-dom(?:\.production)?(?:\.min)?\.js/i, confidence: 90 },
      { pattern: /\/react(?:\.production)?(?:\.min)?\.js/i, confidence: 90 },
      { pattern: /\/react-dom@/, confidence: 90 },
      { pattern: /\/react@/, confidence: 90 },
      { pattern: /\.jsx(\?|$)/i, confidence: 95 },
    ],
    version: {
      pattern: /react(?:-dom)?[@\/]([0-9]+\.[0-9]+\.[0-9]+)/i,
      source: "script",
    },
  },

  {
    name: "Vue.js",
    category: "frontend-framework",
    implies: ["JavaScript"],
    html: [
      { pattern: /\bdata-v-[a-f0-9]{8}\b/i, confidence: 95 },
      { pattern: /__vue__/i, confidence: 95 },
      { pattern: /__VUE__/, confidence: 95 },
      { pattern: /__VUE_DEVTOOLS_GLOBAL_HOOK__/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/vue(?:\.runtime)?(?:\.min)?\.js/i, confidence: 90 },
      { pattern: /\/vue@[0-9]/, confidence: 95 },
    ],
  },

  {
    name: "Nuxt.js",
    category: "frontend-framework",
    implies: ["Vue.js", "Node.js", "JavaScript"],
    html: [
      { pattern: /id=["']__nuxt["']/i, confidence: 100 },
      { pattern: /__NUXT__\s*=/, confidence: 100 },
      { pattern: /\/_nuxt\//, confidence: 95 },
    ],
    script: [
      { pattern: /\/_nuxt\/[a-z0-9._-]+\.js/i, confidence: 95 },
    ],
  },

  {
    name: "Angular",
    category: "frontend-framework",
    implies: ["TypeScript", "JavaScript"],
    html: [
      { pattern: /ng-version=["'][0-9]/i, confidence: 100 },
      { pattern: /<app-root\b/i, confidence: 90 },
      { pattern: /\bplatformBrowserDynamic\b/, confidence: 90 },
      { pattern: /_ngcontent-/i, confidence: 90 },
    ],
    script: [
      { pattern: /\/@angular\//, confidence: 95 },
    ],
    version: {
      pattern: /ng-version=["']([^"']+)["']/i,
      source: "html",
    },
  },

  {
    name: "Gatsby",
    category: "frontend-framework",
    implies: ["React", "JavaScript"],
    meta: /Gatsby/i,
    html: [
      { pattern: /id=["']___gatsby["']/i, confidence: 100 },
      { pattern: /\/gatsby-chunk-mapping/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/gatsby-browser\.js/i, confidence: 95 },
    ],
  },

  {
    name: "Svelte",
    category: "frontend-framework",
    implies: ["JavaScript"],
    html: [
      { pattern: /class=["'][^"']*\bsvelte-[a-z0-9]{6,}\b/i, confidence: 95 },
      { pattern: /\bsvelte\/internal\b/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/svelte(?:\/|@|\.)/i, confidence: 90 },
    ],
  },

  {
    name: "SvelteKit",
    category: "frontend-framework",
    implies: ["Svelte", "JavaScript"],
    html: [
      { pattern: /__sveltekit/i, confidence: 100 },
      { pattern: /data-sveltekit/i, confidence: 95 },
      { pattern: /\/_app\/immutable\//i, confidence: 95 },
    ],
    script: [
      { pattern: /\/_app\/immutable\//i, confidence: 95 },
    ],
  },

  {
    name: "Remix",
    category: "frontend-framework",
    implies: ["React", "JavaScript"],
    html: [
      { pattern: /window\.__remixContext\s*=/, confidence: 100 },
      { pattern: /__remixContext/, confidence: 100 },
    ],
    script: [
      { pattern: /@remix-run\//i, confidence: 95 },
    ],
  },

  {
    name: "Astro",
    category: "frontend-framework",
    html: [
      { pattern: /astro-island/i, confidence: 100 },
      { pattern: /astro:page-load/i, confidence: 100 },
      { pattern: /data-astro-cid/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/_astro\//i, confidence: 95 },
    ],
    meta: /Astro/i,
  },

  {
    name: "Solid.js",
    category: "frontend-framework",
    implies: ["JavaScript"],
    script: [
      { pattern: /\/solid-js\//i, confidence: 95 },
      { pattern: /solid-start/i, confidence: 95 },
    ],
  },

  // ==========================================================================
  // BACKEND FRAMEWORKS
  // ==========================================================================

  {
    name: "Express.js",
    category: "backend-framework",
    implies: ["Node.js", "JavaScript"],
    header: {
      "x-powered-by": /express/i,
    },
  },

  {
    name: "Django",
    category: "backend-framework",
    implies: ["Python"],
    html: [
      { pattern: /csrfmiddlewaretoken/i, confidence: 95 },
      { pattern: /django\.contrib\.staticfiles/i, confidence: 100 },
    ],
    header: {
      "x-powered-by": /django/i,
    },
  },

  {
    name: "Flask",
    category: "backend-framework",
    implies: ["Python"],
    header: {
      "server": /werkzeug/i,
      "x-powered-by": /flask/i,
    },
  },

  {
    name: "FastAPI",
    category: "backend-framework",
    implies: ["Python"],
    header: {
      "x-powered-by": /fastapi/i,
    },
    html: [
      { pattern: /\/openapi\.json/i, confidence: 90 },
    ],
  },

  {
    name: "Laravel",
    category: "backend-framework",
    implies: ["PHP"],
    header: {
      "x-powered-by": /laravel/i,
    },
    html: [
      { pattern: /laravel_session/i, confidence: 100 },
    ],
  },

  {
    name: "Spring Boot",
    category: "backend-framework",
    implies: ["Java"],
    header: {
      "x-powered-by": /spring/i,
    },
    html: [
      { pattern: /Whitelabel Error Page/i, confidence: 100 },
    ],
  },

  {
    name: "Ruby on Rails",
    category: "backend-framework",
    implies: ["Ruby"],
    header: {
      "x-powered-by": /phusion|rails/i,
      "x-runtime": /^\d+\.\d+$/,
    },
    html: [
      { pattern: /rails-ujs/i, confidence: 95 },
    ],
  },

  // ==========================================================================
  // CMS / SITE BUILDERS
  // ==========================================================================

  {
    name: "WordPress",
    category: "cms",
    implies: ["PHP"],
    meta: /WordPress/i,
    html: [
      { pattern: /\/wp-content\//i, confidence: 100 },
      { pattern: /\/wp-includes\//i, confidence: 100 },
      { pattern: /wpSettings\s*=/, confidence: 95 },
    ],
    script: [
      { pattern: /\/wp-content\/themes\//i, confidence: 100 },
      { pattern: /\/wp-content\/plugins\//i, confidence: 100 },
    ],
    version: {
      pattern: /content=["']WordPress ([0-9.]+)/i,
      source: "html",
    },
  },

  {
    name: "Shopify",
    category: "e-commerce",
    header: {
      "x-shopid": /.*/i,
      "x-shopify-stage": /.*/i,
    },
    html: [
      { pattern: /cdn\.shopify\.com\//i, confidence: 100 },
      { pattern: /Shopify\.theme\b/, confidence: 95 },
    ],
  },

  {
    name: "Wix",
    category: "site-builder",
    html: [
      { pattern: /static\.wixstatic\.com\//i, confidence: 100 },
      { pattern: /wix-warmup-data/i, confidence: 100 },
    ],
    header: {
      "x-wix-request-id": /.*/i,
    },
  },

  {
    name: "Webflow",
    category: "site-builder",
    meta: /Webflow/i,
    html: [
      { pattern: /assets\.website-files\.com\//i, confidence: 100 },
      { pattern: /data-wf-/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/webflow\.js/i, confidence: 100 },
    ],
  },

  {
    name: "Squarespace",
    category: "site-builder",
    html: [
      { pattern: /static\.squarespace\.com\//i, confidence: 100 },
      { pattern: /\bSquarespace\.require\b/, confidence: 100 },
    ],
  },

  {
    name: "Drupal",
    category: "cms",
    implies: ["PHP"],
    meta: /Drupal/i,
    header: {
      "x-drupal-cache": /.*/i,
      "x-drupal-dynamic-cache": /.*/i,
    },
    html: [
      { pattern: /drupalSettings\s*=/i, confidence: 100 },
    ],
  },

  {
    name: "Joomla",
    category: "cms",
    implies: ["PHP"],
    meta: /Joomla/i,
    html: [
      { pattern: /\/media\/jui\//i, confidence: 100 },
    ],
  },

  {
    name: "Ghost",
    category: "cms",
    meta: /Ghost/i,
    html: [
      { pattern: /ghost-version/i, confidence: 100 },
    ],
  },

  {
    name: "Magento",
    category: "e-commerce",
    implies: ["PHP"],
    meta: /Magento/i,
    html: [
      { pattern: /Mage\.Cookies/i, confidence: 100 },
      { pattern: /\/skin\/frontend\//i, confidence: 95 },
    ],
  },

  // ==========================================================================
  // WEB SERVERS / INFRASTRUCTURE
  // ==========================================================================

  {
    name: "Nginx",
    category: "web-server",
    header: { "server": /nginx/i },
    version: {
      pattern: /nginx\/([0-9]+\.[0-9]+\.[0-9]+)/i,
      source: "header:server",
    },
  },

  {
    name: "Apache",
    category: "web-server",
    header: { "server": /apache/i },
    version: {
      pattern: /Apache\/([0-9]+\.[0-9]+\.[0-9]+)/i,
      source: "header:server",
    },
  },

  {
    name: "LiteSpeed",
    category: "web-server",
    header: {
      "server": /litespeed/i,
      "x-litespeed-cache": /.*/i,
    },
  },

  {
    name: "IIS",
    category: "web-server",
    header: { "server": /iis/i },
  },

  // ==========================================================================
  // CDN / HOSTING
  // ==========================================================================

  {
    name: "Cloudflare",
    category: "cdn",
    header: {
      "cf-ray": /.*/i,
      "cf-cache-status": /.*/i,
      "server": /cloudflare/i,
    },
  },

  {
    name: "Vercel",
    category: "hosting",
    header: {
      "x-vercel-id": /.*/i,
      "x-vercel-cache": /.*/i,
      "server": /vercel/i,
    },
  },

  {
    name: "Netlify",
    category: "hosting",
    header: {
      "x-nf-request-id": /.*/i,
      "server": /netlify/i,
    },
  },

  {
    name: "AWS",
    category: "hosting",
    header: {
      "server": /AmazonS3|AmazonEC2|awselb/i,
      "via": /CloudFront/i,
      "x-amz-cf-id": /.*/i,
      "x-amz-request-id": /.*/i,
    },
    html: [
      { pattern: /s3\.amazonaws\.com\//i, confidence: 90 },
      { pattern: /cloudfront\.net\//i, confidence: 90 },
    ],
  },

  {
    name: "Google Cloud",
    category: "hosting",
    header: {
      "server": /Google Frontend/i,
      "via": /Google/i,
    },
  },

  // ==========================================================================
  // 🔥 CSS FRAMEWORKS — expanded
  // ==========================================================================

  {
    name: "Bootstrap",
    category: "css-framework",
    implies: ["CSS3"],
    html: [
      { pattern: /bootstrap(?:\.bundle)?(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /bootstrap(?:\.min)?\.css/i, confidence: 95 },
      { pattern: /class=["'][^"']*\b(?:container(?:-fluid)?|row|col-(?:xs|sm|md|lg|xl|xxl)-\d+|navbar-(?:expand|brand|nav)|btn btn-(?:primary|secondary|success|danger|warning|info|light|dark))\b/i, confidence: 80 },
    ],
    css: [
      { pattern: /bootstrap(?:\.min)?\.css/i, confidence: 95 },
      { pattern: /bootstrapcdn\.com\//i, confidence: 100 },
      { pattern: /cdn\.jsdelivr\.net\/npm\/bootstrap/i, confidence: 100 },
    ],
    script: [
      { pattern: /bootstrap(?:\.bundle)?(?:\.min)?\.js/i, confidence: 90 },
      { pattern: /bootstrapcdn\.com\//i, confidence: 100 },
    ],
    version: {
      pattern: /bootstrap[\/@]([0-9]+\.[0-9]+\.[0-9]+)/i,
      source: "script",
    },
  },

  {
    name: "TailwindCSS",
    category: "css-framework",
    implies: ["CSS3"],
    css: [
      { pattern: /tailwindcss/i, confidence: 95 },
      { pattern: /cdn\.tailwindcss\.com/i, confidence: 100 },
    ],
    script: [
      { pattern: /cdn\.tailwindcss\.com/i, confidence: 100 },
    ],
    html: [
      { pattern: /class=["'][^"']*\b(?:flex|grid|hidden|block|inline-block|absolute|relative|w-(?:full|screen|\d+)|h-(?:full|screen|\d+)|p[xytrbl]?-\d+|m[xytrbl]?-\d+|text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)|bg-(?:white|black|gray|red|blue|green|yellow|purple|pink|indigo)-\d{2,3})\b/i, confidence: 75 },
    ],
  },

  {
    name: "Material UI",
    category: "css-framework",
    implies: ["React", "CSS3"],
    html: [
      { pattern: /MuiBox-root/i, confidence: 100 },
      { pattern: /MuiButton-/i, confidence: 100 },
      { pattern: /MuiPaper-/i, confidence: 100 },
      { pattern: /MuiTypography-/i, confidence: 100 },
    ],
    script: [
      { pattern: /@mui\/material/i, confidence: 95 },
      { pattern: /@material-ui\//i, confidence: 95 },
    ],
  },

  {
    name: "Ant Design",
    category: "css-framework",
    implies: ["React", "CSS3"],
    html: [
      { pattern: /class=["'][^"']*\bant-(?:btn|input|form|table|card|menu|layout)/i, confidence: 95 },
    ],
    script: [
      { pattern: /\/antd(?:\.min)?\.js/i, confidence: 95 },
    ],
  },

  {
    name: "Bulma",
    category: "css-framework",
    implies: ["CSS3"],
    css: [
      { pattern: /bulma(?:\.min)?\.css/i, confidence: 100 },
    ],
    html: [
      { pattern: /class=["'][^"']*\b(?:hero|navbar|columns|column is-\d|button is-primary)\b/i, confidence: 70 },
    ],
  },

  {
    name: "Foundation",
    category: "css-framework",
    implies: ["CSS3"],
    css: [
      { pattern: /foundation(?:\.min)?\.css/i, confidence: 100 },
    ],
    script: [
      { pattern: /foundation(?:\.min)?\.js/i, confidence: 95 },
    ],
  },

  {
    name: "Chakra UI",
    category: "css-framework",
    implies: ["React", "CSS3"],
    html: [
      { pattern: /class=["'][^"']*\bchakra-/i, confidence: 95 },
    ],
    script: [
      { pattern: /@chakra-ui\//i, confidence: 95 },
    ],
  },

  {
    name: "Styled Components",
    category: "css-framework",
    implies: ["React", "CSS3"],
    html: [
      { pattern: /class=["']sc-[a-zA-Z0-9]+/i, confidence: 95 },
      { pattern: /data-styled-version/i, confidence: 100 },
    ],
  },

  {
    name: "Emotion",
    category: "css-framework",
    implies: ["CSS3"],
    html: [
      { pattern: /class=["']css-[a-z0-9]{6,}/i, confidence: 80 },
      { pattern: /data-emotion=/i, confidence: 100 },
    ],
  },

  // ==========================================================================
  // 🔥 JAVASCRIPT LIBRARIES — expanded
  // ==========================================================================

  {
    name: "jQuery",
    category: "javascript-library",
    implies: ["JavaScript"],
    html: [
      { pattern: /jquery(?:-[\d.]+)?(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\bjQuery v[0-9]/i, confidence: 100 },
    ],
    script: [
      { pattern: /jquery(?:-[0-9.]+)?(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /code\.jquery\.com\//i, confidence: 100 },
    ],
    version: {
      pattern: /jquery[-\/@]([0-9]+\.[0-9]+\.[0-9]+)/i,
      source: "script",
    },
  },

  {
    name: "Lodash",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /lodash(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/lodash@/i, confidence: 95 },
    ],
  },

  {
    name: "Axios",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /axios(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/axios@/i, confidence: 95 },
    ],
  },

  {
    name: "Moment.js",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /moment(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/moment@/i, confidence: 95 },
    ],
  },

  {
    name: "GSAP",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /gsap(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/gsap@/i, confidence: 95 },
      { pattern: /TweenMax|TweenLite|TimelineMax/i, confidence: 95 },
    ],
  },

  {
    name: "Swiper",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /swiper(?:-bundle)?(?:\.min)?\.js/i, confidence: 95 },
    ],
    css: [
      { pattern: /swiper(?:-bundle)?(?:\.min)?\.css/i, confidence: 95 },
    ],
    html: [
      { pattern: /class=["'][^"']*\bswiper-(?:container|slide|wrapper)\b/i, confidence: 95 },
    ],
  },

  {
    name: "AOS (Animate On Scroll)",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /\baos(?:\.min)?\.js/i, confidence: 95 },
    ],
    html: [
      { pattern: /data-aos=["']/i, confidence: 100 },
    ],
  },

  {
    name: "Chart.js",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /chart(?:\.min)?\.js/i, confidence: 90 },
      { pattern: /\/chart\.js@/i, confidence: 95 },
    ],
  },

  {
    name: "D3.js",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /\/d3(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/d3@/i, confidence: 95 },
    ],
  },

  {
    name: "Three.js",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /three(?:\.min)?\.js/i, confidence: 95 },
      { pattern: /\/three@/i, confidence: 95 },
    ],
  },

  {
    name: "Alpine.js",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /alpinejs/i, confidence: 95 },
      { pattern: /\/alpinejs@/i, confidence: 95 },
    ],
    html: [
      { pattern: /\sx-data=/i, confidence: 90 },
      { pattern: /\sx-show=/i, confidence: 85 },
    ],
  },

  {
    name: "htmx",
    category: "javascript-library",
    implies: ["JavaScript"],
    script: [
      { pattern: /htmx(?:\.min)?\.js/i, confidence: 95 },
    ],
    html: [
      { pattern: /\shx-get=|\shx-post=|\shx-trigger=/i, confidence: 100 },
    ],
  },

  {
    name: "GraphQL",
    category: "api",
    html: [
      { pattern: /__APOLLO_STATE__/i, confidence: 100 },
      { pattern: /apollo-client/i, confidence: 95 },
    ],
    script: [
      { pattern: /apollo(?:-client|-server)?\/|@apollo\//i, confidence: 95 },
    ],
  },

  // ==========================================================================
  // ANALYTICS / TAG MANAGEMENT
  // ==========================================================================

  {
    name: "Google Analytics",
    category: "analytics",
    html: [
      { pattern: /google-analytics\.com\/analytics\.js/i, confidence: 100 },
      { pattern: /googletagmanager\.com\/gtag\/js/i, confidence: 100 },
      { pattern: /UA-\d{6,}-\d+/i, confidence: 95 },
      { pattern: /G-[A-Z0-9]{6,}/i, confidence: 95 },
    ],
    script: [
      { pattern: /googletagmanager\.com\/gtag\/js/i, confidence: 100 },
    ],
  },

  {
    name: "Google Tag Manager",
    category: "tag-management",
    html: [
      { pattern: /googletagmanager\.com\/gtm\.js/i, confidence: 100 },
      { pattern: /GTM-[A-Z0-9]{5,}/i, confidence: 100 },
    ],
    script: [
      { pattern: /googletagmanager\.com\/gtm\.js/i, confidence: 100 },
    ],
  },

  {
    name: "Hotjar",
    category: "analytics",
    html: [
      { pattern: /static\.hotjar\.com\//i, confidence: 100 },
      { pattern: /hjSiteSettings/i, confidence: 100 },
    ],
  },

  {
    name: "Facebook Pixel",
    category: "analytics",
    html: [
      { pattern: /connect\.facebook\.net\/.+\/fbevents\.js/i, confidence: 100 },
      { pattern: /fbq\(['"]init['"]/i, confidence: 100 },
    ],
  },

  // ==========================================================================
  // FINANCE / PAYMENT SDKs
  // ==========================================================================

  {
    name: "Razorpay",
    category: "finance-payment",
    html: [
      { pattern: /checkout\.razorpay\.com\//i, confidence: 100 },
      { pattern: /rzp_live_|rzp_test_/i, confidence: 100 },
    ],
  },

  {
    name: "Cashfree",
    category: "finance-payment",
    html: [
      { pattern: /sdk\.cashfree\.com\//i, confidence: 100 },
    ],
  },

  {
    name: "PayU",
    category: "finance-payment",
    html: [
      { pattern: /payu(?:biz)?\.in\//i, confidence: 100 },
    ],
  },

  {
    name: "PhonePe",
    category: "finance-payment",
    html: [
      { pattern: /phonepe\.com\/apis\//i, confidence: 100 },
    ],
  },

  {
    name: "Paytm",
    category: "finance-payment",
    html: [
      { pattern: /securegw(?:staging)?\.paytm\.in\//i, confidence: 100 },
    ],
  },

  {
    name: "Stripe",
    category: "finance-payment",
    html: [
      { pattern: /js\.stripe\.com\/v[0-9]/i, confidence: 100 },
      { pattern: /pk_live_[a-zA-Z0-9]+/i, confidence: 100 },
    ],
  },

  // ==========================================================================
  // BACKEND-AS-A-SERVICE
  // ==========================================================================

  {
    name: "Firebase",
    category: "backend-as-a-service",
    html: [
      { pattern: /firebase\.initializeApp\s*\(/i, confidence: 100 },
      { pattern: /firebasestorage\.googleapis\.com\//i, confidence: 95 },
    ],
    script: [
      { pattern: /gstatic\.com\/firebasejs\//i, confidence: 100 },
    ],
  },

  {
    name: "Supabase",
    category: "backend-as-a-service",
    html: [
      { pattern: /supabase\.co\//i, confidence: 100 },
    ],
    script: [
      { pattern: /@supabase\//i, confidence: 100 },
    ],
  },

  // ==========================================================================
  // CUSTOMER SUPPORT / MONITORING
  // ==========================================================================

  {
    name: "Intercom",
    category: "customer-support",
    html: [
      { pattern: /widget\.intercom\.io\//i, confidence: 100 },
      { pattern: /intercomSettings/i, confidence: 100 },
    ],
  },

  {
    name: "Zendesk",
    category: "customer-support",
    html: [
      { pattern: /static\.zdassets\.com\//i, confidence: 100 },
    ],
  },

  {
    name: "Sentry",
    category: "error-monitoring",
    html: [
      { pattern: /browser\.sentry-cdn\.com\//i, confidence: 100 },
      { pattern: /Sentry\.init\s*\(/i, confidence: 100 },
    ],
  },

  {
    name: "Google reCAPTCHA",
    category: "security",
    html: [
      { pattern: /www\.google\.com\/recaptcha\//i, confidence: 100 },
    ],
    script: [
      { pattern: /www\.google\.com\/recaptcha\/api\.js/i, confidence: 100 },
    ],
  },

  {
    name: "Cloudflare Turnstile",
    category: "security",
    html: [
      { pattern: /challenges\.cloudflare\.com\/turnstile/i, confidence: 100 },
    ],
  },
];

// ============================================================================
// SECTION 2: HEADER NORMALISER
// ============================================================================

function normaliseHeaders(rawHeaders) {
  const out = {};
  if (!rawHeaders) return out;
  const entries =
    typeof rawHeaders.entries === "function"
      ? rawHeaders.entries()
      : Object.entries(rawHeaders);
  for (const [k, v] of entries) {
    if (k) out[String(k).toLowerCase()] = String(v == null ? "" : v);
  }
  return out;
}

// ============================================================================
// SECTION 3: SIGNAL EXTRACTORS
// ============================================================================

function extractScriptSrcs(html) {
  const srcs = [];
  const re = /<script[^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

function extractLinkHrefs(html) {
  const hrefs = [];
  const re = /<link[^>]+\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) hrefs.push(m[1]);
  return hrefs;
}

function extractGeneratorMeta(html) {
  const re = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["'][^>]*>/i;
  const m = re.exec(html);
  if (m) return m[1];
  const re2 = /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["'][^>]*>/i;
  const m2 = re2.exec(html);
  return m2 ? m2[1] : "";
}

// ============================================================================
// SECTION 4: VERSION EXTRACTOR
// ============================================================================

function extractVersion(versionDef, html, scripts, headers) {
  if (!versionDef || !versionDef.pattern) return null;
  const { pattern, source } = versionDef;
  if (source === "html") {
    const m = pattern.exec(html);
    return m ? m[1] : null;
  }
  if (source === "script") {
    for (const src of scripts) {
      const m = pattern.exec(src);
      if (m) return m[1];
    }
    return null;
  }
  if (source && source.startsWith("header:")) {
    const headerName = source.replace("header:", "");
    const headerVal = headers[headerName] || "";
    const m = pattern.exec(headerVal);
    return m ? m[1] : null;
  }
  return null;
}

// ============================================================================
// SECTION 5: CORE FINGERPRINTING ENGINE
// ============================================================================

function runFingerprint(fingerprint, signals) {
  const { html, scripts, cssLinks, headers, generator } = signals;

  let totalConfidence = 0;
  const evidence = [];
  let dominated = false;

  // Layer 1: Response Headers
  if (fingerprint.header) {
    for (const [headerName, pattern] of Object.entries(fingerprint.header)) {
      const val = headers[headerName];
      if (val !== undefined && pattern.test(val)) {
        const headerConf = headerName.startsWith("x-") ? 90 : 75;
        totalConfidence += headerConf;
        evidence.push(`header:${headerName}=${val.slice(0, 64)}`);
        if (headerConf >= 90) dominated = true;
      }
    }
  }

  // Layer 2: Generator Meta Tag
  if (fingerprint.meta && generator && fingerprint.meta.test(generator)) {
    totalConfidence += 95;
    evidence.push(`meta-generator:${generator}`);
    dominated = true;
  }

  // Layer 3: HTML Pattern Matching
  if (fingerprint.html) {
    for (const { pattern, confidence } of fingerprint.html) {
      if (pattern.test(html)) {
        totalConfidence += confidence;
        evidence.push(`html:${pattern.toString().slice(0, 60)}`);
        if (confidence >= 95) dominated = true;
      }
    }
  }

  // Layer 4: Script Src Matching
  if (fingerprint.script && scripts.length > 0) {
    for (const { pattern, confidence } of fingerprint.script) {
      for (const src of scripts) {
        if (pattern.test(src)) {
          totalConfidence += confidence;
          evidence.push(`script:${src.slice(0, 100)}`);
          if (confidence >= 90) dominated = true;
          break;
        }
      }
    }
  }

  // Layer 5: CSS / Asset Link Matching
  if (fingerprint.css && cssLinks.length > 0) {
    for (const { pattern, confidence } of fingerprint.css) {
      for (const href of cssLinks) {
        if (pattern.test(href)) {
          totalConfidence += confidence;
          evidence.push(`css:${href.slice(0, 100)}`);
          if (confidence >= 90) dominated = true;
          break;
        }
      }
    }
  }

  if (evidence.length === 0) return null;
  if (!dominated && totalConfidence < 80) return null;

  return {
    name: fingerprint.name,
    confidence: Math.min(100, totalConfidence),
    version: null,
    category: fingerprint.category || "other",
    evidence,
  };
}


/**
 * @param {object} params
 * @param {string}          params.html      - Rendered page HTML
 * @param {object}          params.headers   - Response headers map
 * @param {Array<string>}   params.scripts   - Script src URLs
 * @param {Array<string>}   params.css       - CSS stylesheet links
 * @param {object}          params.metaTags  - Extracted meta tags
 * @returns {Array<string>} Tech names sorted by confidence descending
 */
function detectTechnologies({ html, headers, scripts, css, metaTags }) {
  const normalisedHeaders = normaliseHeaders(headers);
  const cssLinks = Array.isArray(css) ? css : [];
  const scriptList = Array.isArray(scripts) ? scripts : [];
  const generator = (metaTags && metaTags.generator) || extractGeneratorMeta(html || "");

  const signals = {
    html: html || "",
    scripts: scriptList,
    cssLinks,
    headers: normalisedHeaders,
    generator,
  };

  const resultMap = new Map();

  for (const fingerprint of FINGERPRINTS) {
    const detection = runFingerprint(fingerprint, signals);
    if (!detection) continue;

    detection.version = extractVersion(
      fingerprint.version,
      html || "",
      scriptList,
      normalisedHeaders
    );

    const existing = resultMap.get(detection.name);
    if (!existing || detection.confidence > existing.confidence) {
      resultMap.set(detection.name, detection);
    }
  }

  // Resolve implies chains
  for (const fingerprint of FINGERPRINTS) {
    if (fingerprint.implies && resultMap.has(fingerprint.name)) {
      for (const impliedName of fingerprint.implies) {
        if (!resultMap.has(impliedName)) {
          resultMap.set(impliedName, {
            name: impliedName,
            confidence: 80,
            version: null,
            category: (FINGERPRINTS.find(f => f.name === impliedName) || {}).category || "other",
            evidence: [`implied-by:${fingerprint.name}`],
          });
        }
      }
    }
  }

  return Array.from(resultMap.entries())
    .sort(([, a], [, b]) => b.confidence - a.confidence)
    .map(([name]) => name);
}


function detectPageTechnologies(pageData) {
  if (!pageData) return [];
  const html = pageData.rawHtml || pageData.rawText || "";
  const headers = normaliseHeaders(pageData.responseHeaders);
  const scripts = extractScriptSrcs(html);
  const cssLinks = extractLinkHrefs(html);
  const generator = extractGeneratorMeta(html);
  const signals = { html, scripts, cssLinks, headers, generator };

  const resultMap = new Map();

  for (const fingerprint of FINGERPRINTS) {
    const detection = runFingerprint(fingerprint, signals);
    if (!detection) continue;
    detection.version = extractVersion(fingerprint.version, html, scripts, headers);
    const existing = resultMap.get(detection.name);
    if (!existing || detection.confidence > existing.confidence) {
      resultMap.set(detection.name, detection);
    }
  }

  for (const fingerprint of FINGERPRINTS) {
    if (fingerprint.implies && resultMap.has(fingerprint.name)) {
      for (const impliedName of fingerprint.implies) {
        if (!resultMap.has(impliedName)) {
          resultMap.set(impliedName, {
            name: impliedName,
            confidence: 80,
            version: null,
            category: (FINGERPRINTS.find(f => f.name === impliedName) || {}).category || "other",
            evidence: [`implied-by:${fingerprint.name}`],
          });
        }
      }
    }
  }

  return Array.from(resultMap.values()).sort((a, b) => b.confidence - a.confidence);
}

function aggregateReportTechnologies(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const globalMap = new Map();

  for (const page of pages) {
    for (const detection of detectPageTechnologies(page)) {
      const existing = globalMap.get(detection.name);
      if (!existing) {
        globalMap.set(detection.name, { ...detection, evidence: [...detection.evidence] });
      } else {
        if (detection.confidence > existing.confidence) existing.confidence = detection.confidence;
        if (!existing.version && detection.version) existing.version = detection.version;
        for (const e of detection.evidence) {
          if (!existing.evidence.includes(e) && existing.evidence.length < 10) {
            existing.evidence.push(e);
          }
        }
      }
    }
  }

  return Array.from(globalMap.entries())
    .sort(([, a], [, b]) => b.confidence - a.confidence)
    .map(([name]) => name);
}


const CATEGORY_MAP = {
  "language": "languages",
  "frontend-framework": "frontendFrameworks",
  "backend-framework": "backendFrameworks",
  "backend": "backendFrameworks",
  "cms": "cms",
  "e-commerce": "cms",
  "site-builder": "cms",
  "analytics": "analytics",
  "tag-management": "analytics",
  "finance-payment": "finance",
  "finance": "finance",
  "payment": "finance",
  "backend-as-a-service": "libraries",
  "customer-support": "libraries",
  "error-monitoring": "libraries",
  "security": "libraries",
  "api": "libraries",
  "javascript-library": "libraries",
  "hosting": "hosting",
  "cdn": "hosting",
  "css-framework": "cssFrameworks",
  "web-server": "webServers",
};

function buildTechnologySummary(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return {
      languages: [],
      frontendFrameworks: [],
      backendFrameworks: [],
      cms: [],
      analytics: [],
      finance: [],
      hosting: [],
      cssFrameworks: [],
      libraries: [],
      webServers: [],
      all: [],
    };
  }

  const globalMap = new Map();
  for (const page of pages) {
    for (const d of detectPageTechnologies(page)) {
      const existing = globalMap.get(d.name);
      if (!existing) {
        globalMap.set(d.name, { ...d });
      } else {
        if (d.confidence > existing.confidence) existing.confidence = d.confidence;
        if (!existing.version && d.version) existing.version = d.version;
      }
    }
  }

  const summary = {
    languages: [],
    frontendFrameworks: [],
    backendFrameworks: [],
    cms: [],
    analytics: [],
    finance: [],
    hosting: [],
    cssFrameworks: [],
    libraries: [],
    webServers: [],
    all: [],
  };

  for (const tech of Array.from(globalMap.values()).sort((a, b) => b.confidence - a.confidence)) {
    summary.all.push(tech.name);
    const field = CATEGORY_MAP[tech.category];
    if (field && Array.isArray(summary[field]) && !summary[field].includes(tech.name)) {
      summary[field].push(tech.name);
    }
  }

  return summary;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  detectTechnologies,
  buildTechnologySummary,
  aggregateReportTechnologies,
};