"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Loader2, Search } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { cn } from "@/lib/cn";
import {
  childrenOf,
  loadGuideIndex,
  loadGuideSection,
  topLevelSections,
  type GuideSection,
  type GuideSectionMeta,
} from "@/lib/staffGuide";
import { useStaff } from "./StaffShell";
import { Select } from "@/components/ui/Select";

const INTRO_ID = "__intro__";

type TocNode = GuideSectionMeta & { kids: GuideSectionMeta[] };

/**
 * Manuale staff: un solo pannello (indice + lettura), ricerca, niente tab/quick link.
 */
export function GuideBrowser() {
  const { token } = useStaff();
  const [allSections, setAllSections] = useState<GuideSectionMeta[]>([]);
  const [intro, setIntro] = useState("");
  const [introTitle, setIntroTitle] = useState("Introduzione");
  const [openId, setOpenId] = useState("");
  const [content, setContent] = useState<GuideSection | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const tree: TocNode[] = useMemo(() => {
    const tops = topLevelSections(allSections);
    return tops.map((t) => ({ ...t, kids: childrenOf(allSections, t.id) }));
  }, [allSections]);

  const flatForSearch = useMemo(() => {
    const out: { id: string; label: string; parent?: string }[] = [];
    if (intro) out.push({ id: INTRO_ID, label: introTitle });
    for (const t of tree) {
      if (t.kids.length) {
        for (const k of t.kids) out.push({ id: k.id, label: k.label, parent: t.label });
      } else {
        out.push({ id: t.id, label: t.label });
      }
    }
    return out;
  }, [tree, intro, introTitle]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return null;
    return flatForSearch.filter((x) => x.label.toLowerCase().includes(n) || (x.parent || "").toLowerCase().includes(n));
  }, [q, flatForSearch]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    loadGuideIndex(token).then((r) => {
      if (!alive) return;
      setBusy(false);
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      const secs = r.data.sections || [];
      setAllSections(secs);
      const introMd = r.data.intro?.markdown || "";
      setIntro(introMd);
      setIntroTitle(r.data.intro?.title || "Introduzione");
      const tops = topLevelSections(secs);
      const firstTop = tops[0];
      if (firstTop) setExpanded({ [firstTop.id]: true });
      if (introMd) setOpenId(INTRO_ID);
      else {
        const kids = firstTop ? childrenOf(secs, firstTop.id) : [];
        setOpenId(kids[0]?.id || firstTop?.id || "");
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!openId || openId === INTRO_ID) {
      setContent(null);
      setLoadingSection(false);
      setErr("");
      return;
    }
    let alive = true;
    setLoadingSection(true);
    setErr("");
    loadGuideSection(token, openId).then((r) => {
      if (!alive) return;
      setLoadingSection(false);
      if (!r.ok) {
        setErr(r.message || "Non hai i permessi per leggere questa sezione della guida.");
        setContent(null);
        return;
      }
      setContent(r.data.section);
      setErr("");
    });
    return () => {
      alive = false;
    };
  }, [token, openId]);

  function openChapter(id: string, parentId?: string) {
    setOpenId(id);
    setQ("");
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  }

  if (busy) return <div className="h-64 animate-pulse rounded-3xl bg-crema/6" />;

  return (
    <div className="overflow-hidden rounded-[1.75rem] bg-roast/75 ring-1 ring-sand/12 lg:grid lg:grid-cols-[minmax(14rem,17.5rem)_minmax(0,1fr)]">
      <aside className="border-b border-sand/10 bg-espresso/40 p-4 lg:border-b-0 lg:border-r lg:border-sand/10">
        <div className="flex items-center gap-2 text-caramel">
          <BookOpen className="size-4" />
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em]">Indice</p>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl bg-crema/[0.06] px-2.5 ring-1 ring-sand/15 focus-within:ring-caramel/35">
          <Search className="size-3.5 shrink-0 text-crema/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca capitolo…"
            className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-crema/35"
          />
        </label>

        <div className="mt-3 block lg:hidden">
          <span className="sr-only">Capitolo</span>
          <Select
            aria-label="Capitolo"
            value={openId}
            onChange={openChapter}
            className="w-full rounded-xl bg-crema/[0.06] px-3 py-2.5"
            options={(filtered ?? flatForSearch).map((x) => ({
              value: x.id,
              label: x.parent ? `${x.parent} · ${x.label}` : x.label,
            }))}
          />
        </div>

        <nav aria-label="Capitoli guida" className="mt-3 hidden max-h-[min(32rem,70dvh)] space-y-1 overflow-y-auto lg:block">
          {filtered ? (
            filtered.length ? (
              filtered.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => openChapter(x.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition",
                    openId === x.id ? "bg-caramel/20 text-ember ring-1 ring-caramel/30" : "text-crema/75 hover:bg-crema/6",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{x.label}</span>
                    {x.parent ? <span className="block text-[0.65rem] text-crema/40">{x.parent}</span> : null}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-sm text-crema/45">Nessun risultato.</p>
            )
          ) : (
            <>
              {intro ? (
                <button
                  type="button"
                  onClick={() => openChapter(INTRO_ID)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition",
                    openId === INTRO_ID ? "bg-caramel/20 text-ember ring-1 ring-caramel/30" : "text-crema/80 hover:bg-crema/6",
                  )}
                >
                  <span className="size-3.5" />
                  {introTitle}
                </button>
              ) : null}
              {tree.map((t) => {
                const hasKids = t.kids.length > 0;
                const isOpen = Boolean(expanded[t.id]) || t.kids.some((k) => k.id === openId);
                return (
                  <div key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasKids) {
                          const next = !isOpen;
                          setExpanded((e) => ({ ...e, [t.id]: next }));
                          if (next && t.kids[0] && !t.kids.some((k) => k.id === openId)) openChapter(t.kids[0].id, t.id);
                        } else openChapter(t.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition",
                        openId === t.id && !hasKids ? "bg-caramel/20 text-ember ring-1 ring-caramel/30" : "text-crema/80 hover:bg-crema/6",
                      )}
                    >
                      {hasKids ? (
                        <ChevronRight className={cn("size-3.5 shrink-0 text-crema/40 transition", isOpen && "rotate-90")} />
                      ) : (
                        <span className="size-3.5" />
                      )}
                      <span className="leading-snug">{t.label}</span>
                    </button>
                    {hasKids && isOpen ? (
                      <ul className="mb-1 ml-3 space-y-0.5 border-l border-sand/15 pl-2">
                        {t.kids.map((k) => (
                          <li key={k.id}>
                            <button
                              type="button"
                              onClick={() => openChapter(k.id, t.id)}
                              className={cn(
                                "w-full rounded-lg px-2 py-1.5 text-left text-sm transition",
                                openId === k.id ? "bg-caramel/20 font-semibold text-ember" : "text-crema/65 hover:bg-crema/6 hover:text-crema",
                              )}
                            >
                              {k.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              {!tree.length && !intro ? <p className="px-2 py-3 text-sm text-crema/45">Nessuna sezione disponibile.</p> : null}
            </>
          )}
        </nav>
      </aside>

      <article className="min-h-[18rem] p-5 sm:p-7">
        {err ? (
          <p className="rounded-2xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30">
            {/permess/i.test(err) ? "Non hai i permessi per leggere questa sezione della guida." : err}
          </p>
        ) : null}

        {openId === INTRO_ID && intro ? (
          <>
            <header className="border-b border-sand/10 pb-4">
              <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{introTitle}</h2>
            </header>
            <div className="mt-5">
              <DiscordContent text={intro} className="text-[0.98rem] leading-relaxed text-crema/85" />
            </div>
          </>
        ) : null}

        {loadingSection ? (
          <p className="flex items-center gap-2 text-sm text-crema/45">
            <Loader2 className="size-4 animate-spin" /> Caricamento…
          </p>
        ) : content ? (
          <>
            <header className="border-b border-sand/10 pb-4">
              <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{content.label}</h2>
              {content.description ? <p className="mt-2 text-sm text-crema/50">{content.description}</p> : null}
            </header>
            <div className="mt-5">
              <DiscordContent text={content.markdown || ""} className="text-[0.98rem] leading-relaxed text-crema/85" />
            </div>
          </>
        ) : !err && !loadingSection && openId !== INTRO_ID ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center text-center">
            <BookOpen className="size-8 text-caramel/50" />
            <p className="mt-3 text-sm text-crema/50">Scegli un capitolo dall’indice.</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
