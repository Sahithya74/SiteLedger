import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Map tiles are the only images loaded from another site.
const tileHost = (() => {
  try {
    return new URL((process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace(/\{[a-z]\}/g, "a")).origin;
  } catch {
    return "https://tile.openstreetmap.org";
  }
})();

/**
 * Content Security Policy: only this site's own scripts, styles and data.
 * Next.js needs inline scripts for page data, so 'unsafe-inline' stays for scripts.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${tileHost}`,
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Extra hosts allowed to post forms when the app sits behind a proxy or tunnel,
      // e.g. SERVER_ACTION_ORIGINS="*.trycloudflare.com". Same-host requests always work.
      allowedOrigins: (process.env.SERVER_ACTION_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      // Photos are uploaded through /api/files, so forms stay small.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      // Attachments set their own, stricter policy in the route.
      { source: "/((?!api/files/).*)", headers: securityHeaders },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
