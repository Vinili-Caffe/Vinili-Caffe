"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadListing } from "@/lib/boards";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";

/**
 * /vetrina/confronta/?ids=… → redirect alla scheda con tab Confronta (stile top.gg).
 * La pagina standalone non esiste più.
 */
export function CompareListings() {
  const sp = useSearchParams();
  const [href, setHref] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const ids = String(sp.get("ids") || "")
      .split(/[,+\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!ids.length) {
      setHref(page("/vetrina/"));
      return;
    }
    let alive = true;
    void loadListing(ids[0]).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message || "Scheda non trovata");
        setHref(page("/vetrina/"));
        return;
      }
      const slug = encodeURIComponent(r.data.listing.slug || r.data.listing.id);
      const peers = ids.slice(1).filter((id) => id !== r.data.listing.id);
      const withQ = peers.length ? `&with=${peers.map(encodeURIComponent).join(",")}` : "";
      const next = page(`/vetrina/scheda/?slug=${slug}&tab=confronta${withQ}`);
      setHref(next);
      try {
        location.replace(next);
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, [sp]);

  return (
    <section className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="font-display text-3xl text-crema/85">{err || "Apro il confronto…"}</p>
      {href ? (
        <SmartLink href={href} className="mt-6 inline-flex rounded-full bg-crema/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25">
          Continua
        </SmartLink>
      ) : null}
    </section>
  );
}
