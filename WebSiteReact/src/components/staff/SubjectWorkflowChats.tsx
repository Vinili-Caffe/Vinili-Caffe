"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { WorkflowChatPanel } from "@/components/staff/WorkflowChatPanel";
import { loadSubjectInvitedChats, type SubjectInvitedChat } from "@/lib/staffWorkflowChat";
import { cn } from "@/lib/cn";

function readChatQuery(): string {
  try {
    return String(new URLSearchParams(location.search).get("chat") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Lato richiedente: apre le discussioni a cui è stato invitato
 * (candidature / appelli, anche da ?chat=dedupeKey).
 */
export function SubjectWorkflowChats({
  token,
  queue,
}: {
  token: string;
  queue: "candidature" | "appelli";
}) {
  const [items, setItems] = useState<SubjectInvitedChat[] | null>(null);
  const [err, setErr] = useState("");
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    const fromUrl = readChatQuery();
    if (fromUrl) setOpenKey(fromUrl);
  }, []);

  useEffect(() => {
    let alive = true;
    loadSubjectInvitedChats(token, { queue, includeClosed: true }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setItems([]);
        return;
      }
      const list = Array.isArray(r.data.items) ? r.data.items : [];
      setItems(list);
      setErr("");
      setOpenKey((cur) => {
        if (cur) return cur;
        const active = list.find((x) => x.chatActive && x.dedupeKey);
        return String(active?.dedupeKey || list[0]?.dedupeKey || "").trim();
      });
    });
    return () => {
      alive = false;
    };
  }, [token, queue]);

  const openItem = useMemo(
    () => (items || []).find((x) => String(x.dedupeKey || "") === openKey) || null,
    [items, openKey],
  );

  /* Nessuna chat invitata e nessun deep-link → niente UI. */
  if (items && !items.length && !openKey) return null;
  if (!items && !openKey) return null;

  return (
    <section className="rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/12 sm:p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-caramel/15 text-ember ring-1 ring-caramel/30">
          <MessageSquareText className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold">Discussione con lo staff</h3>
          <p className="mt-0.5 text-sm text-crema/55">
            Lo staff ti ha aggiunto a una chat sulla tua richiesta. Puoi rispondere qui.
          </p>
        </div>
      </div>

      {err ? <p className="mb-2 text-sm text-ember">{err}</p> : null}

      {(items || []).length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(items || []).map((it) => {
            const key = String(it.dedupeKey || "");
            if (!key) return null;
            const on = key === openKey;
            const label =
              it.statusLabel ||
              it.title ||
              it.kind ||
              it.type ||
              (it.chatActive ? "Chat attiva" : "Chat") ||
              key.slice(0, 18);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpenKey(key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  on ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15 hover:text-crema",
                )}
              >
                {label}
                {it.chatActive ? "" : " · chiusa"}
              </button>
            );
          })}
        </div>
      ) : null}

      {openKey ? (
        <>
          {openItem?.statusLabel || openItem?.chatActive === false ? (
            <p className="mb-2 text-xs text-crema/45">
              {openItem?.statusLabel || "Pratica"}
              {openItem?.chatActive === false ? " · non sei più in chat o pratica conclusa" : ""}
            </p>
          ) : null}
          <WorkflowChatPanel token={token} dedupeKey={openKey} />
        </>
      ) : items === null ? (
        <div className="h-28 animate-pulse rounded-2xl bg-crema/6" />
      ) : null}
    </section>
  );
}
