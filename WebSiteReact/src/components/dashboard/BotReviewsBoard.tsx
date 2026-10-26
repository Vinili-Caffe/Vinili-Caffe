"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Stars } from "@/components/reviews/Stars";
import { DiscordContent } from "@/components/discord/DiscordContent";

type Row = {
  id: string;
  rating: number;
  content: string;
  authorName: string;
  createdAt?: string;
};

/** Recensioni kind=bot (API site-reviews), lista sola lettura + link al flusso pubblico se serve. */
export function BotReviewsBoard() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/webhooks/site-reviews?kind=bot", {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.ok) {
          setErr(j?.message || "Non riesco a caricare le recensioni.");
          setRows([]);
          return;
        }
        const list = Array.isArray(j.reviews) ? j.reviews : Array.isArray(j.items) ? j.items : [];
        setRows(
          list.map((x: Record<string, unknown>) => ({
            id: String(x.id || ""),
            rating: Number(x.rating) || 0,
            content: String(x.content || ""),
            authorName: String(x.authorName || "Utente"),
            createdAt: x.createdAt ? String(x.createdAt) : undefined,
          })),
        );
      })
      .catch(() => {
        if (alive) {
          setErr("Rete non disponibile.");
          setRows([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (err) return <p className="text-sm text-ember">{err}</p>;
  if (!rows) return <div className="h-32 animate-pulse rounded-2xl bg-crema/6" />;

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} id={`vc-review-${r.id}`} className="scroll-mt-28 rounded-2xl bg-roast/60 p-4 ring-1 ring-sand/12">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{r.authorName}</p>
            <Stars value={r.rating} />
          </div>
          <DiscordContent text={r.content} className="mt-2 text-sm text-crema/75" />
        </li>
      ))}
      {!rows.length && <p className="text-crema/50">Nessuna recensione sul bot ancora.</p>}
    </ul>
  );
}
