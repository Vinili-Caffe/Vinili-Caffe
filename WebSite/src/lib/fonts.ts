import localFont from "next/font/local";

/** Font del sito: file in `src/fonts/` (niente fonts.googleapis / fonts.gstatic a runtime). */
export const inter = localFont({
  src: [
    { path: "../fonts/inter-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/inter-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/inter-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/cormorant-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/cormorant-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/cormorant-latin-600-italic.woff2", weight: "600", style: "italic" },
    { path: "../fonts/cormorant-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const greatVibes = localFont({
  src: [{ path: "../fonts/great-vibes-latin.woff2", weight: "400", style: "normal" }],
  variable: "--font-great-vibes",
  display: "swap",
});
