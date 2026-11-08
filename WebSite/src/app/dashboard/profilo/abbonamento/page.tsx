import type { Metadata } from "next";
import { PremiumBoard } from "@/components/dashboard/PremiumBoard";

export const metadata: Metadata = { title: "Abbonamento · Dashboard", robots: { index: false } };

export default function Page() {
  return <PremiumBoard view="abbonamento" />;
}
