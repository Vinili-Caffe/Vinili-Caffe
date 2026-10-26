import type { Metadata } from "next";
import { GuildPanel } from "@/components/dashboard/GuildPanel";

export const metadata: Metadata = { title: "Pannello server · Dashboard", robots: { index: false } };

export default function Page() {
  return <GuildPanel />;
}
