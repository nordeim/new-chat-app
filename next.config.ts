import type { NextConfig } from "next";

// CSP baseline. 'unsafe-inline' is required for scripts because the App Router
// ships inline flight-data bootstrap scripts that carry no nonce in prerendered
// HTML; a per-deployment nonce-based script policy (breaking static prerender)
// remains the documented deploy-time hardening step. Dev adds 'unsafe-eval' for
// React refresh/HMR only.
//
// Cloudflare Web Analytics: zones with it enabled inject a beacon script from
// static.cloudflareinsights.com that reports to cloudflareinsights.com
// (sendBeacon is governed by connect-src). The app targets deployment behind
// Cloudflare (documented ingress convention), so those two origins are part of
// the baseline; operators not using Web Analytics can disable it in the
// Cloudflare dashboard and drop these entries.
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${
    isDev ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Do not advertise the framework version in production responses.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
