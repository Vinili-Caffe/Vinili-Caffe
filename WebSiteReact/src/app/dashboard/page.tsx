import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";

const ServerPicker = dynamic(
  () => import("@/components/dashboard/ServerPicker").then((m) => m.ServerPicker),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/dashboard/", title: "Dashboard", description: "Dashboard bot Vinili & Caffè: scegli il server e gestisci configurazione e moduli." }),
  robots: { index: false },
};

export default function DashboardPage() {
  return <ServerPicker />;
}
