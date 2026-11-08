import type { Metadata } from "next";
import { PremiumBoard } from "@/components/dashboard/PremiumBoard";

export const metadata: Metadata = { title: "Premium · Dashboard", robots: { index: false } };

export default function Page() {
  return <PremiumBoard view="premium" />;
}
