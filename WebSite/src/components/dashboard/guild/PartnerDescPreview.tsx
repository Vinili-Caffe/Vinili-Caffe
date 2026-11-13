"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Eye, RefreshCw, X } from "lucide-react";
import { communityApi } from "@/lib/dashboard-community";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { MessagePreview } from "./MessagePreview";
import { miniBtn } from "./bits";

type Named = { id: string; name: string };
type Result =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; found: boolean; channelName: string; text?: string; author?: { name: string; avatarUrl: string }; at?: string | null };

/** Tasto "Anteprima": apre una finestra con la descrizione che il bot prende adesso dal canale scelto. */
export function PartnerDescPreviewButton({
  token,
  guildId,
  channelId,
  roles = [],
  channels = [],
}: {
  token: string;
  guildId: string;
  channelId: string;
  roles?: Named[];
  channels?: Named[];
}) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result>({ state: "loading" });
  useBodyScrollLock(open);

  const load = async () => {
    setRes({ state: "loading" });
    const r = await communityApi.partnerDescription(token, guildId, channelId);
    setRes(r.ok ? { state: "ok", ...r.data } : { state: "error", message: r.message });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const channelName = channels.find((c) => c.id === channelId)?.name;

  return (
    <>
      <button
        type="button"
        className={miniBtn}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <Eye className="size-3.5" aria-hidden /> Anteprima
      </button>
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  key="desc-preview"
                  className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                >
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Anteprima della descrizione"
                    className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-espresso ring-1 ring-sand/15 shadow-2xl sm:rounded-3xl"
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 24, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3 border-b border-sand/10 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-crema">Descrizione che manda il bot</p>
                        <p className="truncate text-xs text-crema/55">
                          Presa da {channelName || (res.state === "ok" && res.channelName) ? `#${channelName || (res.state === "ok" ? res.channelName : "")}` : "il canale scelto"}
                        </p>
                      </div>
                      <button type="button" className={miniBtn} disabled={res.state === "loading"} onClick={() => void load()} aria-label="Ricarica">
                        <RefreshCw className={res.state === "loading" ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                      </button>
                      <button type="button" className={miniBtn} onClick={() => setOpen(false)} aria-label="Chiudi">
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                      {res.state === "loading" ? (
                        <div className="space-y-2" aria-busy="true">
                          <div className="h-4 w-1/3 animate-pulse rounded bg-crema/10" />
                          <div className="h-24 animate-pulse rounded-xl bg-crema/[0.06]" />
                        </div>
                      ) : res.state === "error" ? (
                        <p className="text-sm text-red-300">{res.message}</p>
                      ) : !res.found ? (
                        <p className="text-sm text-crema/65">Nel canale non c&apos;è nessun messaggio con del testo: il bot manderebbe la partnership senza descrizione.</p>
                      ) : (
                        <>
                          {res.author?.name ? (
                            <p className="mb-1 flex items-center gap-2 text-xs text-crema/55">
                              {res.author.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- avatar Discord piccolo
                                <img src={res.author.avatarUrl} alt="" className="size-5 rounded-full" />
                              ) : null}
                              Messaggio di {res.author.name}
                              {res.at ? ` · ${new Date(res.at).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                            </p>
                          ) : null}
                          <MessagePreview text={res.text} roles={roles} channels={channels} />
                        </>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
