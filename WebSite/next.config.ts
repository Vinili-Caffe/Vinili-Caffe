import type { NextConfig } from "next";

// Niente banner telemetry nei log di build (locale + Vercel).
process.env.NEXT_TELEMETRY_DISABLED = "1";

// Export statico: nginx serve out/ così com'è (beta.viniliecaffe.it), niente server Node sulla VPS.
// cacheComponents/partialPrefetching richiedono il runtime Node → non usabili con output: "export".
// `rewrites` vale solo in `next dev` (l'export statico le ignora); serve-out.mjs fa da proxy in anteprima.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    // Solo `next dev`: in prod i webhook esterni devono battere api (www Vercel + trailingSlash li rompeva).
    const origin = "https://api.viniliecaffe.it";
    return [
      { source: "/webhooks/:path*", destination: `${origin}/webhooks/:path*` },
      { source: "/ticket-transcript/:path*", destination: `${origin}/ticket-transcript/:path*` },
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
