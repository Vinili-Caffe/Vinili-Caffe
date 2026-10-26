import type { Metadata } from "next";

// sul sito vecchio l'inbox staff era la scheda Staff delle notifiche
export const metadata: Metadata = { title: "Notifiche staff", robots: { index: false } };

export default function Page() {
  return <meta httpEquiv="refresh" content="0; url=/notifications/?view=staff" />;
}
