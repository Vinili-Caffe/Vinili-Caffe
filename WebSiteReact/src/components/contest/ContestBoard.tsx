"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, SkipForward, Upload, Loader2, Ghost } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  contestImageUrl,
  fetchContestFeed,
  fetchContestStatus,
  formatRomeRange,
  submitContestImage,
  swipeContest,
  type ContestStatus,
  type ContestSubmission,
} from "@/lib/contest";
import { DiscordButton } from "@/components/DiscordButton";
import { cn } from "@/lib/cn";

type Tab = "submit" | "vote";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function ContestBoard({ eventKey }: { eventKey: string }) {
  const { ready, token } = useAuth();
  const [status, setStatus] = useState<ContestStatus | null>(null);
  const [tab, setTab] = useState<Tab>("vote");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [deck, setDeck] = useState<ContestSubmission[]>([]);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const reload = useCallback(async () => {
    const s = await fetchContestStatus(eventKey, token);
    setStatus(s);
    if (s?.canSubmit && !(s.mySubmissions?.length)) setTab("submit");
  }, [eventKey, token]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    const f = await fetchContestFeed(eventKey, token);
    if (f?.ok) setDeck(f.items || []);
  }, [eventKey, token]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  useEffect(() => {
    if (!ready || !token || tab !== "vote") return;
    void loadFeed();
  }, [ready, token, tab, loadFeed]);

  const top = deck[0] || null;
  const phaseLabel = useMemo(() => {
    if (!status) return "…";
    if (status.phase === "before") return "Non ancora aperto";
    if (status.phase === "after") return "Chiuso";
    if (status.phase === "hidden") return "Non disponibile";
    if (status.staffPreview) return "Aperto (preview staff)";
    return "In corso";
  }, [status]);

  async function onPickFile(file: File | null) {
    if (!file || !token) return;
    setBusy(true);
    setMsg("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const out = await submitContestImage(eventKey, token, dataUrl);
      setMsg(out.message || (out.ok ? "Inviato." : "Errore."));
      if (out.ok) {
        await reload();
        setTab("vote");
      }
    } catch {
      setMsg("Upload non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  async function onSwipe(action: "like" | "pass") {
    if (!token || !top || busy) return;
    setBusy(true);
    try {
      await swipeContest(eventKey, token, top.id, action);
      setDeck((d) => d.slice(1));
      setDragX(0);
      if (deck.length <= 2) void loadFeed();
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!top) return;
    startX.current = e.clientX;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 110) void onSwipe("like");
    else if (dragX < -110) void onSwipe("pass");
    else setDragX(0);
  }

  if (!ready) {
    return (
      <div className="mx-auto flex max-w-lg justify-center px-6 py-16 text-crema/60">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <Ghost className="mx-auto size-10 text-caramel" />
        <p className="mt-4 font-display text-2xl font-semibold">Accedi per partecipare</p>
        <p className="mt-2 text-sm text-crema/65">Serve il login Discord del server.</p>
        <div className="mt-6 flex justify-center">
          <DiscordButton label="Accedi con Discord" />
        </div>
      </div>
    );
  }

  if (!status?.ok && status?.phase === "hidden") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-crema/70">
        Contest non disponibile.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-20">
      <div className="rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-crema/10">
        <p className="text-xs uppercase tracking-[0.2em] text-sand/80">{phaseLabel}</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">{status?.title || "Contest"}</h2>
        <p className="mt-2 text-sm text-crema/70">{status?.blurb}</p>
        {status?.startAt && status?.endAt ? (
          <p className="mt-2 text-xs text-crema/45">{formatRomeRange(status.startAt, status.endAt)}</p>
        ) : null}
        <p className="mt-1 text-xs text-crema/40">
          {status?.submissionCount ?? 0} partecipanti · tuoi voti {status?.myVoteCount ?? 0}
        </p>
      </div>

      {status?.phase === "before" && !status.staffPreview ? (
        <p className="mt-8 text-center text-crema/65">Torna all’orario di apertura.</p>
      ) : null}

      {(status?.phase === "open" || status?.staffPreview) && (
        <>
          <div className="mt-6 flex gap-2 rounded-full bg-espresso p-1 ring-1 ring-crema/10">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-medium",
                tab === "submit" ? "bg-caramel text-ink" : "text-crema/70 hover:text-crema",
              )}
              onClick={() => setTab("submit")}
            >
              Invia
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-medium",
                tab === "vote" ? "bg-caramel text-ink" : "text-crema/70 hover:text-crema",
              )}
              onClick={() => setTab("vote")}
            >
              Vota
            </button>
          </div>

          {tab === "submit" ? (
            <div className="mt-8 space-y-4">
              {status.mySubmissions?.length ? (
                <div>
                  <p className="text-sm text-crema/70">Hai già inviato:</p>
                  <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-crema/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contestImageUrl(status.mySubmissions[0].imageUrl)}
                      alt=""
                      className="aspect-[3/4] w-full object-cover"
                    />
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-crema/25 bg-crema/[0.03] px-6 py-12 text-center hover:border-caramel/50">
                  <Upload className="size-8 text-caramel" />
                  <span className="font-medium">Carica la tua foto</span>
                  <span className="text-xs text-crema/50">PNG / JPG / WEBP · max 4 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy || !status.canSubmit}
                    onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
              {msg ? <p className="text-center text-sm text-sand">{msg}</p> : null}
              {busy ? <Loader2 className="mx-auto size-5 animate-spin text-crema/50" /> : null}
            </div>
          ) : (
            <div className="mt-8">
              {!top ? (
                <p className="py-16 text-center text-crema/60">
                  {status.canVote ? "Hai visto tutto per ora. Torna più tardi!" : "Voto non disponibile."}
                </p>
              ) : (
                <>
                  <div
                    className="relative mx-auto aspect-[3/4] w-full max-w-sm touch-none select-none overflow-hidden rounded-3xl bg-roast shadow-2xl ring-1 ring-crema/15"
                    style={{
                      transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)`,
                      transition: dragging ? "none" : "transform 180ms ease",
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={contestImageUrl(top.imageUrl)} alt="" className="size-full object-cover" draggable={false} />
                    <div
                      className={cn(
                        "pointer-events-none absolute left-4 top-4 rounded-lg border-2 border-emerald-400 px-3 py-1 text-sm font-bold uppercase tracking-widest text-emerald-300",
                        dragX > 40 ? "opacity-100" : "opacity-0",
                      )}
                    >
                      Like
                    </div>
                    <div
                      className={cn(
                        "pointer-events-none absolute right-4 top-4 rounded-lg border-2 border-red-400 px-3 py-1 text-sm font-bold uppercase tracking-widest text-red-300",
                        dragX < -40 ? "opacity-100" : "opacity-0",
                      )}
                    >
                      Pass
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-center gap-6">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("pass")}
                      className="flex size-14 items-center justify-center rounded-full bg-crema/10 text-crema ring-1 ring-crema/20 hover:bg-crema/15"
                      aria-label="Passa"
                    >
                      <SkipForward className="size-6" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSwipe("like")}
                      className="flex size-16 items-center justify-center rounded-full bg-caramel text-ink shadow-lg shadow-caramel/30 hover:brightness-110"
                      aria-label="Mi piace"
                    >
                      <Heart className="size-7 fill-current" />
                    </button>
                  </div>
                  <p className="mt-4 text-center text-xs text-crema/40">Swipe destra = like · sinistra = passa</p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {status?.phase === "after" ? (
        <p className="mt-10 text-center text-sm text-crema/60">Contest terminato. Classifica in arrivo.</p>
      ) : null}
    </div>
  );
}
