import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from "@/lib/auth";
import { I18nFromAuth } from "@/lib/i18n";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/lib/theme";
import { SwRegister } from "@/components/SwRegister";
import { SPONSOR_AD_BOOT } from "@/lib/sponsor-ad";
import { SOURCE_GUARD_BOOT } from "@/lib/source-guard-boot";
import { BOOT_GATE_BOOT } from "@/lib/boot-gate-boot";
import { PWA_RESUME_BOOT } from "@/lib/pwa-resume-boot";
import { PWA_NOTIF_NAV_BOOT } from "@/lib/pwa-notif-nav-boot";
import { STORAGE_GC_BOOT } from "@/lib/storage-gc-boot";
import { PWA_HEALTH_BOOT } from "@/lib/pwa-health-boot";
import { EXT_CONSOLE_BOOT } from "@/lib/ext-console-boot";
import { API_FETCH_BOOT } from "@/lib/api";
import { API_CACHE_BOOT } from "@/lib/api-cache-boot";
import { SSR_TEXT_SNAPSHOT_BOOT } from "@/lib/hydration-diff";
import { SITE_TITLE_BRAND, SITE_TITLE_TEMPLATE } from "@/lib/page-title";
import { SITE_EMBED_COLOR, SITE_THEME_COLOR, siteLogoOgImage } from "@/lib/og";
import { cormorant, greatVibes, inter } from "@/lib/fonts";
import "./globals.css";

// Indexing: HTML indexable for www. La beta resta noindex via header nginx X-Robots-Tag.
// Title/OG: `Vinili & Caffè • Italia • Social • Gaming ǀ Pagina` (wordmark UI ≠ title)
export const metadata: Metadata = {
  title: {
    default: SITE_TITLE_BRAND,
    template: SITE_TITLE_TEMPLATE,
  },
  description:
    "Vinili & Caffè: Community Discord Italiana chill dove parlare di tutto. Ruoli, eventi, giveaway, bot esclusivi.",
  metadataBase: new URL("https://www.viniliecaffe.it"),
  // default home; le sottopagine override via pageSocialMeta.alternates.canonical
  alternates: { canonical: "/" },
  openGraph: {
    // niente title qui: eredita il <title> risolto (template brand ǀ pagina), come il sito vecchio
    description: "Community Discord Italiana chill dove parlare di tutto. Ruoli, eventi, giveaway, bot esclusivi.",
    url: "https://www.viniliecaffe.it/",
    siteName: "Vinili & Caffè",
    locale: "it_IT",
    type: "website",
    images: [siteLogoOgImage()],
  },
  twitter: {
    card: "summary",
    description: "Community Discord Italiana chill: ruoli, eventi, giveaway, bot esclusivi.",
    images: [siteLogoOgImage().url],
  },
  other: {
    // Unfurl Discord classico: accent caffè (PWA chrome = viewport.themeColor).
    "theme-color": SITE_EMBED_COLOR,
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { color: SITE_THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: "#efe6dc" },
    { media: "(prefers-color-scheme: dark)", color: SITE_THEME_COLOR },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${inter.variable} ${cormorant.variable} ${greatVibes.variable} antialiased vc-boot-hold`}
    >
      <head>
        {/* prima di tutto: spegne rumore estensioni / lastError in console */}
        <script dangerouslySetInnerHTML={{ __html: EXT_CONSOLE_BOOT }} />
        {API_FETCH_BOOT ? <script dangerouslySetInnerHTML={{ __html: API_FETCH_BOOT }} /> : null}
        {/* letture API: richieste uguali condivise e memoria breve (svuotata a ogni salvataggio) */}
        <script dangerouslySetInnerHTML={{ __html: API_CACHE_BOOT }} />
        {/* avatar, emoji e media di Discord arrivano da qui: collegamento aperto in anticipo */}
        <link rel="preconnect" href="https://cdn.discordapp.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://media.discordapp.net" />
        {/* immagini dell'intestazione, foto dei contest e cursori: senza crossOrigin, come le <img> */}
        <link rel="preconnect" href="https://cdn.viniliecaffe.it" />
        {API_FETCH_BOOT ? <link rel="preconnect" href="https://api.viniliecaffe.it" crossOrigin="" /> : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPONSOR_AD_BOOT }} />
        {/* PWA riaperta dopo tanto: se il CSS del deploy vecchio non c'è più, ricarica */}
        <script dangerouslySetInnerHTML={{ __html: PWA_HEALTH_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: STORAGE_GC_BOOT }} />
        {/* notif pending PRIMA del resume: iOS apre start_url al tap push */}
        <script dangerouslySetInnerHTML={{ __html: PWA_NOTIF_NAV_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: PWA_RESUME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_GATE_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: SOURCE_GUARD_BOOT }} />
      </head>
      <body className="min-h-dvh bg-espresso font-sans text-crema selection:bg-caramel/40">
        <AuthProvider>
          <I18nFromAuth>
            <ThemeProvider>
              <SwRegister />
              {children}
              <Analytics />
              <SpeedInsights />
            </ThemeProvider>
          </I18nFromAuth>
        </AuthProvider>
        {/* testo della pagina arrivata dal server, prima che React la prenda: ErrorReporter lo confronta se c'è un errore #418 */}
        <script dangerouslySetInnerHTML={{ __html: SSR_TEXT_SNAPSHOT_BOOT }} />
      </body>
    </html>
  );
}
