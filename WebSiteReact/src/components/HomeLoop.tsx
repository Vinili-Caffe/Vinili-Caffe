"use client";

import { useI18n } from "@/lib/i18n";
import { CurvedLoop } from "./ui/curved-loop";

/** Fascia tra le sezioni della home: scritta che scorre su una curva, come il bordo di un disco (Curved Loop). */
export function HomeLoop() {
  const { t } = useI18n();
  return <CurvedLoop text={t("home.loop")} className="-my-4 text-caramel/35 sm:-my-8" />;
}
