"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, LogIn, Sparkles, Trash2, TreePine, UserRound, VenetianMask, X } from "lucide-react";
import { AlberoBauble } from "@/components/albero/AlberoBauble";
import { AlberoScene } from "@/components/albero/AlberoScene";
import { avatarUrl, useAuth } from "@/lib/auth";
import {
  ALBERO_COLORS,
  TREE_DEFAULT,
  alberoMediaToCssPercent,
  baubleSizeForCount,
  clientToAlberoMedia,
  deleteAlberoOrnament,
  loadAlbero,
  pointOnTree,
  saveAlberoOrnament,
  snapToTree,
  type AlberoColor,
  type AlberoOrnament,
} from "@/lib/albero";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { isAlberoSeason } from "@/lib/site-effects";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { loadStaffAccess } from "@/lib/staff";

type Draft = {
  message: string;
  color: AlberoColor;
  x: number;
  y: number;
  anonymous: boolean;
};

/** il riquadro arrotondato della pagina (come /wrapped): staccato dalla navbar, centrato in altezza */
function AlberoFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className="flex min-h-[100dvh] items-center px-3 pb-8 pt-20 sm:px-5 sm:pt-[5.5rem]">
      <div
        className={cn(
          "relative isolate mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] bg-[#0a0604] text-[#f4e9d8] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] ring-1 ring-[#f4e9d8]/10 sm:rounded-[2.75rem]",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

function AlberoTitle({ count }: { count?: number }) {
  return (
    <>
      <p className="inline-flex items-center gap-2 rounded-full border border-[#f4e9d8]/25 bg-black/20 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
        <TreePine className="size-3.5 text-[#f0b46e]" aria-hidden />
        Natale · Vinili & Caffè
      </p>
      <h1 className="mt-4 font-display text-[clamp(2.4rem,5.5vw,4.6rem)] font-semibold leading-[0.9] tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        L&apos;albero
        <br />
        <span className="italic text-[#f0b46e]">della community</span>
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-snug text-[#f4e9d8]/80 drop-shadow">
        Scrivi un desiderio, appendi la tua palla e spostala sull&apos;albero.
        {count ? <span className="mt-1 block font-semibold text-[#f0b46e]">{count === 1 ? "1 palla appesa" : `${count} palle appese`}</span> : null}
      </p>
    </>
  );
}

function AlberoShell({ children, title, text }: { children: ReactNode; title?: string; text?: string }) {
  return (
    <AlberoFrame className="grid min-h-[min(40rem,calc(100dvh-8.5rem))] place-items-center">
      <div className="px-6 py-16 text-center">
        <TreePine className="mx-auto size-10 text-[#f0b46e]" aria-hidden />
        {title ? <p className="mt-4 font-display text-3xl">{title}</p> : null}
        {text ? <p className="mt-2 text-sm text-[#f4e9d8]/65">{text}</p> : null}
        {children}
      </div>
    </AlberoFrame>
  );
}

export function AlberoBoard() {
  const { ready, token, login, user } = useAuth();
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const mineBtnRef = useRef<HTMLButtonElement>(null);
  const composerOpenRef = useRef(false);
  const draggingRef = useRef(false);
  const stageSizeRef = useRef({ w: 1, h: 1 });
  const dragRef = useRef<{
    pointerId: number;
    moved: boolean;
    x: number;
    y: number;
    message: string;
    color: AlberoColor;
    anonymous: boolean;
    raf: number | null;
  } | null>(null);

  const [ornaments, setOrnaments] = useState<AlberoOrnament[]>([]);
  const [mine, setMine] = useState<AlberoOrnament | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    message: "",
    color: "gold",
    x: TREE_DEFAULT.x,
    y: TREE_DEFAULT.y,
    anonymous: false,
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [peek, setPeek] = useState<AlberoOrnament | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState("");
  const [compact, setCompact] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    composerOpenRef.current = composerOpen;
  }, [composerOpen]);

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      stageSizeRef.current = next;
      setStageSize(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, disabled]);

  const baubleSize = baubleSizeForCount(ornaments.length || 1, compact);
  const showNicks = ornaments.length < 12;

  const cssPos = useCallback(
    (x: number, y: number) => alberoMediaToCssPercent(x, y, stageSize.w, stageSize.h),
    [stageSize.w, stageSize.h],
  );

  const applyPayload = useCallback(
    (data: { ornaments: AlberoOrnament[]; mine: AlberoOrnament | null }, opts?: { soft?: boolean }) => {
      setOrnaments(
        data.ornaments.map((o) => {
          const snapped = snapToTree(o.x, o.y);
          return snapped.x === o.x && snapped.y === o.y ? o : { ...o, ...snapped };
        }),
      );
      if (opts?.soft && (draggingRef.current || composerOpenRef.current)) {
        if (!data.mine) setMine(null);
        return;
      }
      if (data.mine) {
        const snapped = snapToTree(data.mine.x, data.mine.y);
        setMine(
          snapped.x !== data.mine.x || snapped.y !== data.mine.y
            ? { ...data.mine, ...snapped }
            : data.mine,
        );
        setDraft({
          message: data.mine.message,
          color: data.mine.color,
          x: snapped.x,
          y: snapped.y,
          anonymous: Boolean(data.mine.anonymous),
        });
      } else {
        setMine(null);
      }
    },
    [],
  );

  const refresh = useCallback(async (tok?: string | null) => {
    const res = await loadAlbero(tok);
    if (res.status === "disabled") return { kind: "disabled" as const };
    if (res.status === "auth") return { kind: "auth" as const };
    if (res.status === "forbidden") return { kind: "forbidden" as const };
    if (res.status === "error") return { kind: "error" as const, message: res.message };
    return { kind: "ok" as const, data: res.data };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const kickHome = () => {
      if (!alive) return;
      setDisabled(true);
      setLoading(false);
      router.replace(page("/"));
    };

    const run = async () => {
      /* Fuori stagione: solo high staff. Override test: localStorage vc_albero_force=1 */
      if (!isAlberoSeason()) {
        if (!token) {
          kickHome();
          return;
        }
        setLoading(true);
        const staff = await loadStaffAccess(token);
        if (!alive) return;
        if (!staff.ok || !staff.data.isHighStaff) {
          kickHome();
          return;
        }
      }

      setDisabled(false);
      setLoading(true);
      setError(null);
      const res = await refresh(token);
      if (!alive) return;
      setLoading(false);
      if (res.kind === "disabled") {
        kickHome();
        return;
      }
      if (res.kind === "ok") {
        applyPayload(res.data);
        return;
      }
      const open = await refresh(null);
      if (!alive) return;
      if (open.kind === "ok") {
        setOrnaments(open.data.ornaments);
        setMine(null);
        return;
      }
      if (open.kind === "disabled") {
        kickHome();
        return;
      }
      setError(open.kind === "error" ? open.message || "Errore." : "Accedi per continuare.");
    };

    void run();
    return () => {
      alive = false;
    };
  }, [ready, token, router, refresh, applyPayload]);

  useEffect(() => {
    if (!ready || disabled || loading) return;
    return subscribeSiteRealtime((ping) => {
      if (ping.type !== "albero_changed") return;
      void (async () => {
        const res = await refresh(token);
        if (res.kind !== "ok") return;
        applyPayload(res.data, { soft: true });
      })();
    });
  }, [ready, disabled, loading, token, refresh, applyPayload]);

  const others = useMemo(() => ornaments.filter((o) => !o.mine), [ornaments]);

  const clientPos = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { ...TREE_DEFAULT };
    return clientToAlberoMedia(clientX, clientY, el.getBoundingClientRect());
  };

  const paintMine = (x: number, y: number) => {
    const btn = mineBtnRef.current;
    if (!btn) return;
    const { w, h } = stageSizeRef.current;
    const p = alberoMediaToCssPercent(x, y, w, h);
    btn.style.left = `${p.left}%`;
    btn.style.top = `${p.top}%`;
    btn.style.transform = "translate(-50%, -50%)";
  };

  const persistPosition = async (
    x: number,
    y: number,
    message: string,
    color: AlberoColor,
    anonymous: boolean,
  ) => {
    if (!token) return;
    setSaving(true);
    const out = await saveAlberoOrnament(token, { message, color, x, y, anonymous });
    setSaving(false);
    if (!out.ok) {
      setHint(out.message);
      return;
    }
    setMine(out.ornament);
    setDraft({
      message: out.ornament.message,
      color: out.ornament.color,
      x: out.ornament.x,
      y: out.ornament.y,
      anonymous: Boolean(out.ornament.anonymous),
    });
    setOrnaments((list) => {
      const rest = list.filter((o) => !(o.mine || (o.userId && o.userId === out.ornament.userId)));
      return [...rest, out.ornament];
    });
  };

  const onMinePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!mine || !token) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = snapToTree(draft.x, draft.y);
    dragRef.current = {
      pointerId: e.pointerId,
      moved: false,
      x: p.x,
      y: p.y,
      message: draft.message || mine.message,
      color: draft.color,
      anonymous: draft.anonymous,
      raf: null,
    };
    setDragging(true);
    setPeek(null);
  };

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      e.preventDefault();
      const raw = clientPos(e.clientX, e.clientY);
      const snapped = snapToTree(raw.x, raw.y);
      d.moved = true;
      d.x = snapped.x;
      d.y = snapped.y;
      if (d.raf != null) return;
      d.raf = window.requestAnimationFrame(() => {
        const cur = dragRef.current;
        if (!cur) return;
        cur.raf = null;
        paintMine(cur.x, cur.y);
      });
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (d.raf != null) {
        window.cancelAnimationFrame(d.raf);
        d.raf = null;
      }
      const moved = d.moved;
      const x = d.x;
      const y = d.y;
      const message = d.message;
      const color = d.color;
      const anonymous = d.anonymous;
      dragRef.current = null;
      setDragging(false);
      paintMine(x, y);
      setDraft((prev) => ({ ...prev, x, y }));
      setMine((m) => (m ? { ...m, x, y } : m));

      if (!moved) {
        setComposerOpen(true);
        return;
      }
      void persistPosition(x, y, message, color, anonymous);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, token]);

  const placeNew = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (peek) {
      setPeek(null);
      return;
    }
    if (mine || !token || composerOpen || dragging) return;
    const p = clientPos(e.clientX, e.clientY);
    if (!pointOnTree(p.x, p.y)) return;
    const snapped = snapToTree(p.x, p.y);
    setDraft((d) => ({ ...d, x: snapped.x, y: snapped.y }));
    setComposerOpen(true);
  };

  const commitDraft = async () => {
    if (!token) return;
    const message = draft.message.trim();
    if (message.length < 2) {
      setHint("Scrivi almeno due caratteri");
      return;
    }
    setSaving(true);
    const out = await saveAlberoOrnament(token, {
      message,
      color: draft.color,
      x: draft.x,
      y: draft.y,
      anonymous: draft.anonymous,
    });
    setSaving(false);
    if (!out.ok) {
      setHint(out.message);
      return;
    }
    setMine(out.ornament);
    setDraft({
      message: out.ornament.message,
      color: out.ornament.color,
      x: out.ornament.x,
      y: out.ornament.y,
      anonymous: Boolean(out.ornament.anonymous),
    });
    setOrnaments((list) => {
      const rest = list.filter((o) => !(o.mine || (o.userId && o.userId === out.ornament.userId)));
      return [...rest, out.ornament];
    });
    setComposerOpen(false);
  };

  const removeMine = async () => {
    if (!token || !mine) return;
    setRemoving(true);
    const out = await deleteAlberoOrnament(token);
    setRemoving(false);
    if (!out.ok) {
      setHint(out.message);
      return;
    }
    setMine(null);
    setOrnaments((list) => list.filter((o) => !o.mine));
    setDraft({
      message: "",
      color: "gold",
      x: TREE_DEFAULT.x,
      y: TREE_DEFAULT.y,
      anonymous: false,
    });
    setComposerOpen(false);
    setPeek(null);
  };

  if (!ready || loading) {
    return (
      <AlberoShell text="Accendiamo le luci…">
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-caramel" />
        </div>
      </AlberoShell>
    );
  }

  if (disabled) return null;

  if (error && !ornaments.length) {
    return (
      <AlberoShell title="Non disponibile" text={error}>
        <div className="rounded-[1.75rem] bg-ink/40 px-6 py-8 text-center ring-1 ring-crema/10">
          <p className="text-sm text-crema/55">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-caramel/90 px-6 text-sm font-semibold text-espresso"
          >
            Riprova
          </button>
        </div>
      </AlberoShell>
    );
  }

  const mineCss = !dragging ? cssPos(draft.x, draft.y) : null;

  return (
    <>
      {/*
        Un riquadro arrotondato (come /wrapped), staccato dalla navbar e centrato in altezza.
        Telefono: titolo e tasto sopra, poi la scena 16:9. Computer: la scena riempie il riquadro,
        titolo e tasto in alto a sinistra sopra la foto.
      */}
      <AlberoFrame>
        <div data-albero-stage className="relative">
          {/* telefono: titolo e tasto sopra la scena */}
          <div className="px-5 pb-4 pt-6 sm:hidden">
            <AlberoTitle count={ornaments.length} />
            <div className="mt-4">
                {!token ? (
                  <button
                    type="button"
                    onClick={login}
                    className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-[#5865f2] px-6 text-sm font-bold text-white shadow-[0_12px_36px_-10px_rgba(0,0,0,0.65)] transition "
                  >
                    <LogIn className="size-4" /> Accedi con Discord
                  </button>
                ) : !mine ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, x: TREE_DEFAULT.x, y: TREE_DEFAULT.y }));
                      setComposerOpen(true);
                    }}
                    className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-[#f0b46e] px-6 text-sm font-bold text-[#140d09] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.55)] transition "
                  >
                    <Sparkles className="size-4" /> Scrivi una lettera per Babbo Natale
                  </button>
                ) : null}
            </div>
          </div>

          <div
            ref={stageRef}
            className="relative aspect-[16/9] w-full touch-none select-none overflow-hidden sm:aspect-auto sm:h-[min(56rem,calc(100dvh-8.5rem))]"
            onPointerDown={placeNew}
          >
            <AlberoScene />

            {/* computer: titolo e tasto in alto a sinistra, con un'ombra per leggerli sulla foto.
                Spariscono mentre leggi un desiderio (si proietta sul camino, proprio lì) o sposti la tua palla. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-[42%] bg-gradient-to-r from-black/70 via-black/35 to-transparent transition-opacity duration-300 sm:block",
                (peek || dragging) && "opacity-0",
              )}
            />
            <div
              aria-hidden={Boolean(peek || dragging)}
              className={cn(
                "pointer-events-none absolute left-0 top-0 z-30 hidden max-w-md p-10 transition-[opacity,transform] duration-300 sm:block lg:p-12",
                (peek || dragging) && "-translate-y-2 opacity-0 [&_button]:pointer-events-none",
              )}
            >
              <AlberoTitle count={ornaments.length} />
              <div className="mt-6">
                {!token ? (
                  <button
                    type="button"
                    onClick={login}
                    className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-[#5865f2] px-6 text-sm font-bold text-white shadow-[0_12px_36px_-10px_rgba(0,0,0,0.65)] transition "
                  >
                    <LogIn className="size-4" /> Accedi con Discord
                  </button>
                ) : !mine ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, x: TREE_DEFAULT.x, y: TREE_DEFAULT.y }));
                      setComposerOpen(true);
                    }}
                    className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-[#f0b46e] px-6 text-sm font-bold text-[#140d09] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.55)] transition "
                  >
                    <Sparkles className="size-4" /> Scrivi una lettera per Babbo Natale
                  </button>
                ) : null}
              </div>
            </div>

            {hint && composerOpen ? (
              <p className="pointer-events-none absolute inset-x-0 top-20 z-40 text-center text-sm font-medium text-caramel drop-shadow">
                {hint}
              </p>
            ) : null}

            {others.map((o) => {
              const p = cssPos(o.x, o.y);
              const key = o.id || o.userId;
              return (
                <AlberoBauble
                  key={key}
                  ornament={o}
                  size={baubleSize}
                  showNick={showNicks}
                  dimmed={Boolean(peek && peek.id !== o.id)}
                  selected={peek?.id === o.id}
                  onClick={() => setPeek((cur) => (cur?.id === o.id ? null : o))}
                  style={{
                    left: `${p.left}%`,
                    top: `${p.top}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              );
            })}

            {mine ? (
              <AlberoBauble
                ref={mineBtnRef}
                ornament={{
                  ...mine,
                  color: draft.color,
                  message: draft.message || mine.message,
                  anonymous: draft.anonymous,
                  displayName: draft.anonymous ? "Anonimo" : mine.displayName,
                  avatarUrl: draft.anonymous ? null : mine.avatarUrl,
                }}
                size={baubleSize + 2}
                showNick
                dragging={dragging}
                selected={Boolean(peek && peek.id === mine.id)}
                onPointerDown={onMinePointerDown}
                style={
                  dragging
                    ? {
                        left: `${alberoMediaToCssPercent(dragRef.current?.x ?? draft.x, dragRef.current?.y ?? draft.y, stageSize.w, stageSize.h).left}%`,
                        top: `${alberoMediaToCssPercent(dragRef.current?.x ?? draft.x, dragRef.current?.y ?? draft.y, stageSize.w, stageSize.h).top}%`,
                        transform: "translate(-50%, -50%)",
                      }
                    : {
                        left: `${mineCss!.left}%`,
                        top: `${mineCss!.top}%`,
                        transform: "translate(-50%, -50%)",
                      }
                }
              />
            ) : null}

            {/* Desiderio come proiezione sul caminetto (sinistra scena) */}
            <AnimatePresence>
              {peek ? (
                <motion.div
                  key={peek.id || peek.userId}
                  role="dialog"
                  aria-label={`Desiderio di ${peek.anonymous ? "Anonimo" : peek.displayName}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute z-40 w-[min(56%,14rem)] max-w-[58%] sm:w-[min(42%,18rem)] sm:max-w-[42%]"
                  style={{
                    left: `${cssPos(compact ? 0.22 : 0.2, compact ? 0.38 : 0.4).left}%`,
                    top: `${cssPos(compact ? 0.22 : 0.2, compact ? 0.38 : 0.4).top}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <div className="albero-wish-proj relative px-1.5 py-1 sm:px-2">
                    <span className="albero-wish-proj__glow" aria-hidden />
                    <p className="albero-wish-proj__name">{peek.displayName}</p>
                    <p className="albero-wish-proj__msg">{peek.message}</p>
                    {peek.mine ? (
                      <div className="pointer-events-auto mt-3 flex justify-center gap-4">
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#ffd7a0]/85 underline-offset-2 hover:underline"
                          onClick={() => {
                            setComposerOpen(true);
                            setPeek(null);
                          }}
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-300/80 underline-offset-2 hover:underline"
                          disabled={removing}
                          onClick={() => void removeMine()}
                        >
                          Rimuovi
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Chiudi"
                      onClick={() => setPeek(null)}
                      className="pointer-events-auto absolute -right-1 -top-1 inline-flex size-7 items-center justify-center rounded-full bg-black/35 text-[#ffe7c2]/70 ring-1 ring-[#ffd7a0]/20"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </AlberoFrame>

      <AnimatePresence>
        {composerOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Chiudi" onClick={() => setComposerOpen(false)} />
            <motion.div
              role="dialog"
              aria-modal
              aria-label="Scrivi sulla palla"
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="relative z-10 w-full max-w-md rounded-t-[1.75rem] bg-roast px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl ring-1 ring-caramel/25 sm:rounded-[1.75rem]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-crema">La tua palla</h2>
                  <p className="mt-1 text-sm text-crema/55">
                    {draft.anonymous
                      ? "Anonima: niente nome né avatar · il desiderio al tap."
                      : "Avatar e nome sulla palla · il desiderio al tap."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-crema/5 text-crema"
                  aria-label="Chiudi"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5 flex justify-center py-3">
                <AlberoBauble
                  ornament={{
                    id: "draft",
                    userId: user?.id || "me",
                    displayName: draft.anonymous
                      ? "Anonimo"
                      : mine?.displayName || user?.global_name || user?.username || "Tu",
                    avatarUrl: draft.anonymous ? null : mine?.avatarUrl || (user ? avatarUrl(user, 128) : null),
                    message: draft.message || "…",
                    color: draft.color,
                    x: 0.5,
                    y: 0.5,
                    anonymous: draft.anonymous,
                    mine: true,
                    updatedAt: null,
                  }}
                  size={72}
                  showNick
                  className="!relative !left-auto !top-auto"
                  style={{ position: "relative", transform: "none" }}
                />
              </div>

              {/* come firmare la palla: due schede, quella scelta si accende */}
              <div role="radiogroup" aria-label="Come appendere la palla" className="mt-4 grid grid-cols-2 gap-2">
                {(
                  [
                    { anon: false, title: "Col mio nome", text: "Avatar e nome sulla palla" },
                    { anon: true, title: "In anonimo", text: "Nessun nome né avatar" },
                  ] as const
                ).map((o) => {
                  const on = draft.anonymous === o.anon;
                  const myAvatar = mine?.avatarUrl || (user ? avatarUrl(user, 64) : null);
                  return (
                    <button
                      key={o.title}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setDraft((d) => ({ ...d, anonymous: o.anon }))}
                      className={cn(
                        "relative flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98]",
                        on
                          ? "bg-caramel/12 ring-caramel/55 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.55)]"
                          : "bg-espresso/70 ring-crema/10 hover:bg-crema/[0.05] hover:ring-crema/20",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 transition",
                          on ? "ring-caramel/70" : "ring-crema/10",
                          o.anon ? "bg-crema/[0.06] text-crema/70" : "bg-crema/10",
                        )}
                      >
                        {o.anon ? (
                          <VenetianMask className="size-5" aria-hidden />
                        ) : myAvatar ? (
                           
                          <img src={myAvatar} alt="" className="size-full object-cover" />
                        ) : (
                          <UserRound className="size-5 text-crema/60" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-semibold", on ? "text-crema" : "text-crema/80")}>{o.title}</span>
                        <span className="block text-[0.7rem] leading-snug text-crema/50">{o.text}</span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full transition",
                          on ? "bg-caramel text-espresso" : "ring-1 ring-crema/20",
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block">
                <span className="sr-only">Messaggio</span>
                <textarea
                  value={draft.message}
                  onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value.slice(0, 90) }))}
                  rows={3}
                  maxLength={90}
                  placeholder="Il tuo desiderio…"
                  className="w-full resize-none rounded-2xl bg-espresso px-4 py-3 text-crema outline-none ring-1 ring-crema/12 placeholder:text-crema/30 focus:ring-caramel/45"
                />
                <span className="mt-1 block text-right text-[0.65rem] text-crema/40">{draft.message.length}/90</span>
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                {ALBERO_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.label}
                    onClick={() => setDraft((d) => ({ ...d, color: c.id }))}
                    className={cn(
                      "size-8 rounded-full ring-2 transition",
                      draft.color === c.id ? "ring-crema" : "ring-transparent opacity-80 hover:opacity-100",
                    )}
                    style={{ background: `radial-gradient(circle at 30% 25%, #fff8, transparent 40%), ${c.hex}` }}
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void commitDraft()}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-caramel text-sm font-semibold text-espresso disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {mine ? "Aggiorna palla" : "Appendi sull'albero"}
              </button>

              {mine ? (
                <button
                  type="button"
                  disabled={removing || saving}
                  onClick={() => void removeMine()}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-crema/5 text-sm font-semibold text-red-300/90 ring-1 ring-red-300/20 disabled:opacity-60"
                >
                  {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Rimuovi dall&apos;albero
                </button>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
