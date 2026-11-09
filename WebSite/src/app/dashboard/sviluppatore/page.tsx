import type { Metadata } from "next";
import { DevBoard } from "@/components/dashboard/DevBoard";

export const metadata: Metadata = { title: "Sviluppatore · Dashboard", robots: { index: false } };

export default function Page() {
  return <DevBoard />;
}
