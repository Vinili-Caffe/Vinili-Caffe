import type { NextConfig } from "next";

// Niente banner telemetry nei log di build (locale + Vercel).
process.env.NEXT_TELEMETRY_DISABLED = "1";

// Export statico: nginx serve out/ così com'è (beta.viniliecaffe.it), niente server Node sulla VPS.
// cacheComponents/partialPrefetching richiedono il runtime Node → non usabili con output: "export".
// `rewrites` vale solo in `next dev` (l'export statico le ignora); serve-out.mjs fa da proxy in anteprima.
const nextConfig: NextConfig = {
  output: "export",
  /* ora della build: le pagine statiche disegnano gli sconti a orario come erano in quel momento (niente HTML diverso al primo disegno) */
  env: { NEXT_PUBLIC_BUILD_AT: String(Date.now()) },
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    // Solo `next dev`: in prod i webhook esterni devono battere api (www Vercel + trailingSlash li rompeva).
    const origin = "https://api.viniliecaffe.it";
    return [
      /* lingua nell'indirizzo (/en/faq/): stessa pagina, come su Vercel */
      { source: "/:lang(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)", destination: "/" },
      { source: "/:lang(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)/:path*", destination: "/:path*" },
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
