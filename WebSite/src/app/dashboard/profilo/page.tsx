import type { Metadata } from "next";
import { ProfileBoard } from "@/components/dashboard/ProfileBoard";

export const metadata: Metadata = { title: "Profilo · Dashboard", robots: { index: false } };

export default function Page() {
  return <ProfileBoard />;
}
