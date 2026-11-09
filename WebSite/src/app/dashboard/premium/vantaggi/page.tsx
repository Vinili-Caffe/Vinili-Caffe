import type { Metadata } from "next";
import { PremiumPerks } from "@/components/dashboard/PremiumPerks";

export const metadata: Metadata = { title: "Vantaggi Premium · Dashboard", robots: { index: false } };

export default function Page() {
  return <PremiumPerks />;
}
