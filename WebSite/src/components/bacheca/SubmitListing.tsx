"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Bot, Check, CircleAlert, Handshake, LogIn, Plus, Send, Server, ShieldCheck, Sparkles, X } from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import {
  SOCIAL_LABELS,
  createListing,
  labelOf,
  loadBoardsConfig,
  loadClaimableServers,
  type BoardKind,
  type BoardListing,
  type BoardsConfig,
  type SocialKey,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "../SmartLink";
import { ListingCard } from "@/components/vetrina/ListingCard";

type Guild = { id: string; name: string; iconUrl?: string; alreadyListed?: boolean; botPresent?: boolean; hasDraft?: boolean };

type Form = {
  discordId: string;
  name: string;
  tagline: string;
  description: string;
  categories: string[];
  locales: string[];
  tags: string[];
  inviteUrl: string;
  siteUrl: string;
  socials: Partial<Record<SocialKey, string>>;
  acceptsPartnerships: boolean;
  requireVerification: boolean;
  nsfw: boolean;
  accent: string;
  visitorNotes: string;
};
type Bundle = { kind: BoardKind; form: Form };

const DRAFT_KEY = "vc_bacheca_draft_v1";
const ACCENTS = ["#d99a5b", "#f0b46e", "#c0503c", "#a855f7", "#5865f2", "#38bdf8", "#3fae7a", "#e879a6"];
const SOCIAL_KEYS: SocialKey[] = ["instagram", "tiktok", "youtube", "twitch", "x", "github"];

const emptyForm = (): Form => ({
  discordId: "",
  name: "",
  tagline: "",
  description: "",
  categories: [],
  locales: ["it"],
  tags: [],
  inviteUrl: "",
  siteUrl: "",
  socials: {},
  acceptsPartnerships: false,
  requireVerification: false,
  nsfw: false,
  accent: ACCENTS[0],
  visitorNotes: "",
});

/* le bozze salvate prima di questo modulo hanno solo una parte dei campi */
const normalize = (b: Partial<Bundle> | null | undefined): Bundle => ({
  kind: b?.kind === "bot" ? "bot" : "server",
  form: { ...emptyForm(), ...(b?.form || {}) },
});

/** Modulo per mettere in vetrina un server o un bot, con anteprima dal vivo. */
export function SubmitListing() {
  const { ready, token, login } = useAuth();
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [bundle, setBundleRaw] = useState<Bundle>(() => normalize(null));
  const setBundle = (v: Bundle | ((b: Bundle) => Bundle)) => setBundleRaw((prev) => normalize(typeof v === "function" ? v(prev) : v));
  const { kind, form } = bundle;
  const set = (patch: Partial<Form>) => setBundle((b) => ({ ...b, form: { ...b.form, ...patch } }));
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");

  const draft = useFormDraft("bacheca", bundle, (v) => setBundle(v), {
    storageKey: DRAFT_KEY,
    watch: true,
    debounceMs: 320,
    isEmpty: (d) => !d.form.discordId.trim() && !d.form.name.trim() && !d.form.tagline.trim() && !d.form.description.trim(),
  });

  useEffect(() => {
    if (!ready) return;
    void loadBoardsConfig("", token).then((c) => c && setCfg(c));
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !token || kind !== "server") return;
    void loadClaimableServers(token).then((r) => setGuilds(r.ok ? ((r.data.guilds as Guild[]) || []) : []));
  }, [ready, token, kind]);

  const minTag = cfg?.minTaglineChars ?? 20;
  const minDesc = cfg?.minDescriptionChars ?? 80;
  const maxCats = cfg?.maxCategories ?? 3;
  const maxLocales = cfg?.maxLocales ?? 3;
  const maxTags = cfg?.maxTags ?? 10;
  const guild = guilds?.find((g) => g.id === form.discordId);

  const checks = [
    { ok: Boolean(form.discordId.trim()), label: kind === "server" ? "Server scelto" : "Client ID del bot" },
    { ok: form.tagline.trim().length >= minTag, label: `Frase breve (${minTag}+ caratteri)` },
    { ok: form.description.trim().length >= minDesc, label: `Descrizione (${minDesc}+ caratteri)` },
    { ok: form.categories.length > 0, label: "Almeno una categoria" },
    { ok: form.tags.length >= 3, label: "Almeno 3 tag", optional: true },
    { ok: Boolean(form.inviteUrl.trim()), label: kind === "bot" ? "Link per aggiungerlo" : "Link d’invito", optional: true },
  ];
  const required = checks.filter((c) => !c.optional);
  const done = checks.filter((c) => c.ok).length;
  const canSend = required.every((c) => c.ok);

  const preview = useMemo<BoardListing>(
    () => ({
      id: "anteprima",
      kind,
      discordId: form.discordId,
      slug: "",
      status: "draft",
      ownerUserId: "",
      authorName: "",
      authorAvatarUrl: "",
      name: form.name.trim() || guild?.name || (kind === "bot" ? "Il tuo bot" : "Il tuo server"),
      tagline: form.tagline.trim(),
      description: form.description,
      tags: form.tags,
      categories: form.categories,
      locales: form.locales,
      locale: form.locales[0] || "",
      visitorNotes: form.visitorNotes,
      siteUrl: form.siteUrl,
      inviteUrl: form.inviteUrl,
      botInviteUrl: form.inviteUrl,
      bannerUrl: "",
      iconUrl: guild?.iconUrl || "",
      nsfw: form.nsfw,
      features: [],
      score: 0,
      votes30d: 0,
      votesMonth: 0,
      bumps7d: 0,
      bumpedAt: null,
      ratingAvg: 0,
      reviewsCount: 0,
      accent: form.accent,
      createdAt: null,
      updatedAt: null,
    }),
    [kind, form, guild],
  );

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-xl px-6 pb-28 text-center">
        <Sparkles className="mx-auto size-12 text-ember" />
        <p className="mt-4 font-display text-4xl">Prima, fatti riconoscere</p>
        <p className="mt-2 text-crema/60">Per mettere in vetrina un server o un bot accedi con Discord: così sappiamo che è davvero tuo.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </section>
    );
  }

  function toggle(list: string[], v: string, max: number) {
    if (list.includes(v)) return list.filter((x) => x !== v);
    return list.length >= max ? list : [...list, v];
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32);
    if (!t || form.tags.includes(t) || form.tags.length >= maxTags) return;
    set({ tags: [...form.tags, t] });
    setTagDraft("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return login();
    setErr("");
    const missing = required.find((c) => !c.ok);
    if (missing) {
      setErr(`Manca ancora: ${missing.label.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    const socials = Object.fromEntries(Object.entries(form.socials).filter(([, v]) => v && v.trim())) as Partial<Record<SocialKey, string>>;
    const r = await createListing(token, {
      kind,
      discordId: form.discordId.trim(),
      name: form.name.trim() || undefined,
      tagline: form.tagline.trim(),
      description: form.description.trim(),
      categories: form.categories,
      locales: form.locales,
      tags: form.tags,
      ...(kind === "bot" ? { botInviteUrl: form.inviteUrl.trim() || undefined } : { inviteUrl: form.inviteUrl.trim() || undefined }),
      siteUrl: form.siteUrl.trim() || undefined,
      socials,
      features: { acceptsPartnerships: form.acceptsPartnerships, requireVerification: form.requireVerification },
      nsfw: form.nsfw,
      accent: form.accent,
      visitorNotes: form.visitorNotes.trim() || undefined,
      submit: true,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setSent(r.data.message || (r.data.resumed ? "Bozza ripresa e inviata in revisione." : "Scheda inviata in revisione!"));
    draft.clear();
    const slug = r.data.listing?.slug;
    window.setTimeout(() => {
      window.location.href = page(slug ? `/vetrina/scheda/?slug=${encodeURIComponent(slug)}` : "/vetrina/le-mie/");
    }, 1400);
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
      <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* 1 · tipo */}
          <Step n={1} title="Cosa metti in vetrina?">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["server", "bot"] as BoardKind[]).map((k) => {
                const active = kind === k;
                const Icon = k === "bot" ? Bot : Server;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBundle((b) => ({ kind: k, form: { ...b.form, discordId: "", inviteUrl: "" } }))}
                    className={cn(
                      "relative flex items-start gap-4 rounded-2xl p-5 text-left ring-1 transition",
                      active ? "bg-gradient-to-br from-caramel/25 to-caramel/5 ring-caramel/50" : "bg-espresso/50 ring-sand/12 hover:ring-sand/30",
                    )}
                  >
                    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", active ? "bg-ember text-ink" : "bg-crema/8 text-crema/60")}>
                      <Icon className="size-6" />
                    </span>
                    <span>
                      <span className="block font-display text-2xl font-semibold">{k === "bot" ? "Un bot" : "Un server"}</span>
                      <span className="text-sm text-crema/55">{k === "bot" ? "Musica, moderazione, giochi, utilità…" : "La tua community Discord."}</span>
                    </span>
                    {active && <Check className="absolute right-4 top-4 size-5 text-ember" />}
                  </button>
                );
              })}
            </div>
          </Step>

          {/* 2 · identità */}
          <Step n={2} title={kind === "server" ? "Quale server?" : "Quale bot?"}>
            {kind === "server" ? (
              guilds === null ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-espresso/50" />
                  ))}
                </div>
              ) : guilds.length === 0 ? (
                <p className="rounded-2xl bg-espresso/50 p-4 text-sm text-crema/60 ring-1 ring-sand/12">
                  Non trovo server che gestisci. Servono i permessi di gestione del server: se li hai, rifai l’accesso con Discord e autorizza l’elenco dei server.
                </p>
              ) : (
                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {guilds.map((g) => {
                    const locked = Boolean(g.alreadyListed && !g.hasDraft);
                    const active = form.discordId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={locked}
                        onClick={() => set({ discordId: g.id, name: form.name || g.name })}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-45",
                          active ? "bg-caramel/15 ring-caramel/50" : "bg-espresso/50 ring-sand/12 hover:ring-sand/30",
                        )}
                      >
                        {g.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.iconUrl} alt="" className="size-10 rounded-xl object-cover" />
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-xl bg-mocha font-display text-lg text-crema/70">{g.name.slice(0, 1)}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-crema">{g.name}</span>
                          <span className="text-xs text-crema/45">
                            {locked ? "Già in vetrina" : g.hasDraft ? "Hai una bozza: riprendila" : g.botPresent === false ? "Il bot non è nel server" : "Disponibile"}
                          </span>
                        </span>
                        {active && <Check className="size-5 shrink-0 text-ember" />}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client ID del bot" hint="Lo trovi nel Developer Portal di Discord.">
                  <input value={form.discordId} onChange={(e) => set({ discordId: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="123456789012345678" className={INPUT} />
                </Field>
                <Field label="Nome del bot">
                  <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Come si chiama?" className={INPUT} />
                </Field>
              </div>
            )}
          </Step>

          {/* 3 · presentazione */}
          <Step n={3} title="Presentati">
            <div className="space-y-4">
              <Field label="Frase breve" hint="La prima cosa che si legge sulla card." counter={<Counter n={form.tagline.trim().length} min={minTag} />}>
                <input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={140} placeholder={kind === "bot" ? "Musica in alta qualità e radio 24/7 per il tuo server." : "Una community accogliente per chi ama musica e videogiochi."} className={INPUT} />
              </Field>
              <Field label="Descrizione" hint="Supporta il formato di Discord: **grassetto**, elenchi, link." counter={<Counter n={form.description.trim().length} min={minDesc} />}>
                <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={9} maxLength={cfg?.maxMarkdownChars || 4000} placeholder="Racconta cosa si fa, che atmosfera c’è, gli eventi, le funzioni principali…" className={cn(INPUT, "resize-y leading-relaxed")} />
              </Field>
              <Field label="Note per chi entra" hint="Facoltativo: cosa fare appena arrivati.">
                <input value={form.visitorNotes} onChange={(e) => set({ visitorNotes: e.target.value })} maxLength={300} placeholder="Leggi le regole in #benvenuto e presentati!" className={INPUT} />
              </Field>
            </div>
          </Step>

          {/* 4 · scaffale */}
          <Step n={4} title="Su quale scaffale?">
            <div className="space-y-5">
              <Field group label={`Categorie (fino a ${maxCats})`}>
                <div className="flex flex-wrap gap-1.5">
                  {(cfg?.categories || []).map((c) => (
                    <Chip key={c} active={form.categories.includes(c)} onClick={() => set({ categories: toggle(form.categories, c, maxCats) })}>
                      {labelOf(cfg?.categoryLabels, c)}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field group label={`Lingue (fino a ${maxLocales})`}>
                <div className="flex flex-wrap gap-1.5">
                  {(cfg?.locales || []).map((l) => (
                    <Chip key={l} active={form.locales.includes(l)} onClick={() => set({ locales: toggle(form.locales, l, maxLocales) })}>
                      {labelOf(cfg?.localeLabels, l)}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field group label={`Tag (${form.tags.length}/${maxTags})`} hint="Parole che usano le persone quando cercano. Invio per aggiungere.">
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-espresso/60 p-2 ring-1 ring-sand/15 focus-within:ring-ember/45">
                  {form.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ember/15 py-1 pl-2.5 pr-1.5 text-sm text-ember ring-1 ring-ember/30">
                      #{t}
                      <button type="button" aria-label={`Togli ${t}`} onClick={() => set({ tags: form.tags.filter((x) => x !== t) })} className="rounded-full p-0.5 hover:bg-ember/20">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {form.tags.length < maxTags && (
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag(tagDraft);
                        } else if (e.key === "Backspace" && !tagDraft && form.tags.length) set({ tags: form.tags.slice(0, -1) });
                      }}
                      onBlur={() => tagDraft && addTag(tagDraft)}
                      placeholder={form.tags.length ? "" : "musica, gaming, chill…"}
                      className="min-w-[8rem] flex-1 bg-transparent px-2 py-1 text-crema outline-none placeholder:text-crema/30"
                    />
                  )}
                </div>
                {(cfg?.suggestedTags || []).filter((t) => !form.tags.includes(t)).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(cfg?.suggestedTags || [])
                      .filter((t) => !form.tags.includes(t))
                      .slice(0, 12)
                      .map((t) => (
                        <button key={t} type="button" onClick={() => addTag(t)} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-crema/45 ring-1 ring-sand/12 hover:text-ember">
                          <Plus className="size-3" />
                          {t}
                        </button>
                      ))}
                  </div>
                )}
              </Field>
            </div>
          </Step>

          {/* 5 · link e dettagli */}
          <Step n={5} title="Link e dettagli">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={kind === "bot" ? "Link per aggiungere il bot" : "Link d’invito"} hint={kind === "server" ? "Meglio un invito che non scade." : undefined}>
                <input value={form.inviteUrl} onChange={(e) => set({ inviteUrl: e.target.value })} placeholder={kind === "bot" ? "https://discord.com/oauth2/authorize?…" : "https://discord.gg/…"} className={INPUT} />
              </Field>
              <Field label="Sito web">
                <input value={form.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })} placeholder="https://…" className={INPUT} />
              </Field>
              {SOCIAL_KEYS.map((k) => (
                <Field key={k} label={SOCIAL_LABELS[k]}>
                  <input value={form.socials[k] || ""} onChange={(e) => set({ socials: { ...form.socials, [k]: e.target.value } })} placeholder="@nome o link" className={INPUT} />
                </Field>
              ))}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Toggle on={form.acceptsPartnerships} onClick={() => set({ acceptsPartnerships: !form.acceptsPartnerships })} icon={<Handshake />} label="Partnership aperte" />
              <Toggle on={form.requireVerification} onClick={() => set({ requireVerification: !form.requireVerification })} icon={<ShieldCheck />} label="Verifica all’ingresso" />
              <Toggle on={form.nsfw} onClick={() => set({ nsfw: !form.nsfw })} icon={<CircleAlert />} label="Contenuti 18+" danger />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Colore della scheda</p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colore ${c}`}
                    aria-pressed={form.accent === c}
                    onClick={() => set({ accent: c })}
                    className={cn("size-9 rounded-full ring-2 ring-offset-2 ring-offset-roast transition-transform hover:scale-110", form.accent === c ? "ring-crema" : "ring-transparent")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </Step>
        </div>

        {/* anteprima e invio */}
        <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start">
          <p className="font-script text-2xl text-caramel/85">Così apparirà</p>
          <div className="pointer-events-none">
            <ListingCard listing={preview} cfg={cfg} />
          </div>
          <div className="rounded-3xl bg-roast/80 p-5 ring-1 ring-sand/12">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-crema">Completezza</span>
              <span className="tabular-nums text-crema/55">
                {done}/{checks.length}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-crema/8">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-caramel to-ember" animate={{ width: `${(done / checks.length) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {checks.map((c) => (
                <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-crema/75" : "text-crema/40")}>
                  <span className={cn("flex size-4 items-center justify-center rounded-full", c.ok ? "bg-ember text-ink" : "ring-1 ring-sand/25")}>{c.ok && <Check className="size-3" />}</span>
                  {c.label}
                  {c.optional && !c.ok ? <span className="text-xs text-crema/30">· consigliato</span> : null}
                </li>
              ))}
            </ul>
            {err && <p className="mt-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p>}
            {sent ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#5f9a6a]/20 p-3 text-sm text-[#a7d8b0] ring-1 ring-[#5f9a6a]/40">
                <Check className="size-4" /> {sent}
              </p>
            ) : (
              <button
                type="submit"
                disabled={busy || !canSend}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember py-3.5 font-bold text-ink transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45"
              >
                <Send className="size-4" /> {busy ? "Invio…" : "Invia in revisione"}
              </button>
            )}
            <p className="mt-3 text-center text-xs text-crema/40">
              Lo staff controlla ogni scheda prima di pubblicarla.{" "}
              <SmartLink href={page("/vetrina/linee-guida-recensioni/")} className="text-caramel underline-offset-2 hover:underline">
                Linee guida
              </SmartLink>
              {draft.restored ? " · bozza ripresa" : ""}
            </p>
          </div>
        </aside>
      </form>
    </section>
  );
}

const INPUT = "w-full rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-ember/45";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <motion.fieldset initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.05 }} className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-caramel/15 font-display text-lg font-bold text-ember ring-1 ring-caramel/30">{n}</span>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
      </div>
      {children}
    </motion.fieldset>
  );
}

/* group: il campo contiene pulsanti (chip), non un input → div, altrimenti il clic sull’etichetta preme il primo chip */
function Field({ label, hint, counter, group = false, children }: { label: string; hint?: string; counter?: ReactNode; group?: boolean; children: ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
        <span>{label}</span>
        {counter}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-crema/40">{hint}</span> : null}
    </Tag>
  );
}

function Counter({ n, min }: { n: number; min: number }) {
  return <span className={cn("normal-case tracking-normal tabular-nums", n >= min ? "text-[#a7d8b0]" : "text-crema/35")}>{n >= min ? <Check className="inline size-3.5" /> : `${n}/${min}`}</span>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", active ? "bg-ember/20 text-ember ring-1 ring-ember/40" : "bg-espresso/60 text-crema/55 ring-1 ring-sand/12 hover:text-crema")}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, icon, label, danger = false }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition-colors [&>svg]:size-4",
        on ? (danger ? "bg-[#a83a2c]/20 text-[#f0a493] ring-[#a83a2c]/45" : "bg-ember/15 text-ember ring-ember/40") : "bg-espresso/50 text-crema/55 ring-sand/12 hover:text-crema",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? (danger ? "bg-[#a83a2c]" : "bg-ember") : "bg-crema/15")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-crema transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

