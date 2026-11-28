"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Bot,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Eraser,
  Eye,
  Handshake,
  ImagePlus,
  Languages,
  LayoutGrid,
  Loader2,
  LogIn,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import {
  SOCIAL_LABELS,
  createListing,
  generateGuildInvite,
  labelOf,
  listingFeatures,
  categoriesFor,
  loadBotDefaults,
  loadBoardsConfig,
  loadClaimableServers,
  loadGuildDefaults,
  loadMyListing,
  patchListing,
  probeLink,
  statusLabel,
  submitListing,
  uploadBanner,
  type BoardKind,
  type BoardListing,
  type BoardsConfig,
  type CreateListingBody,
  type ProbeKind,
  type SocialKey,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { SmartLink } from "../SmartLink";
import { DiscordContent } from "../discord/DiscordContent";
import { ListingCard } from "@/components/vetrina/ListingCard";
import { OptionPicker } from "@/components/vetrina/OptionPicker";
import { ColorPicker } from "@/components/ui/color-picker";
import { GlobalSaveBar, TrackUnsaved } from "@/components/dashboard/guild/bits";

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
  paidTier: "free" | "paid";
  paidFeaturesAvailable: boolean;
  acceptsPartnerships: boolean;
  requireVerification: boolean;
  nsfw: boolean;
  accent: string;
  visitorNotes: string;
  bannerUrl: string;
  iconUrl: string;
  /* bot */
  prefix: string;
  supportUrl: string;
  webInterface: boolean;
  userInstallable: boolean;
};
type Bundle = { kind: BoardKind; form: Form };
type Check = { state: "idle" | "busy" | "ok" | "bad"; label?: string };

const DRAFT_KEY = "vc_bacheca_draft_v1";
const DEFAULT_ACCENT = "#d99a5b";
const ACCENTS = [DEFAULT_ACCENT, "#f0b46e", "#c0503c", "#e879a6", "#a855f7", "#5865f2", "#38bdf8", "#3fae7a"];
const SOCIAL_KEYS: SocialKey[] = ["instagram", "tiktok", "youtube", "twitch", "x", "github"];
const HEX = /^#[0-9a-f]{6}$/i;

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
  paidTier: "free",
  paidFeaturesAvailable: false,
  acceptsPartnerships: false,
  requireVerification: false,
  nsfw: false,
  accent: DEFAULT_ACCENT,
  visitorNotes: "",
  bannerUrl: "",
  iconUrl: "",
  prefix: "",
  supportUrl: "",
  webInterface: false,
  userInstallable: false,
});

/* le bozze salvate dai moduli precedenti hanno solo una parte dei campi */
const normalize = (b: Partial<Bundle> | null | undefined): Bundle => ({
  kind: b?.kind === "bot" ? "bot" : "server",
  form: { ...emptyForm(), ...(b?.form || {}) },
});

function fromListing(l: BoardListing & { markdown?: string }): Bundle {
  const f = listingFeatures(l);
  return normalize({
    kind: l.kind === "bot" ? "bot" : "server",
    form: {
      ...emptyForm(),
      discordId: l.discordId || "",
      name: l.name || "",
      tagline: l.tagline || "",
      description: l.description || l.markdown || "",
      categories: l.categories || [],
      locales: l.locales?.length ? l.locales : ["it"],
      tags: l.tags || [],
      inviteUrl: (l.kind === "bot" ? l.botInviteUrl : l.inviteUrl) || "",
      siteUrl: l.siteUrl || "",
      socials: l.socials || {},
      paidTier: f.paidTier === "paid" ? "paid" : "free",
      paidFeaturesAvailable: Boolean(f.paidFeaturesAvailable),
      acceptsPartnerships: Boolean(f.acceptsPartnerships),
      requireVerification: Boolean(f.requireVerification),
      nsfw: Boolean(l.nsfw),
      accent: HEX.test(l.accent || "") ? l.accent : DEFAULT_ACCENT,
      visitorNotes: l.visitorNotes || "",
      bannerUrl: l.bannerUrl || "",
      iconUrl: l.iconUrl || "",
      prefix: l.prefix || "",
      supportUrl: l.supportUrl || "",
      webInterface: Boolean(f.webInterface),
      userInstallable: Boolean(f.userInstallable),
    },
  });
}

/** Toglie la formattazione Discord (grassetti, titoli, citazioni, link markdown) lasciando il testo. */
function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ""))
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__|~~|\|\|)(.+?)\1/g, "$2")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1$2")
    .replace(/(^|\s)_([^_]+?)_(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(#{1,3}|-#)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "");
}

function useEditId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(new URLSearchParams(location.search).get("edit") || "");
    } catch {
      setId("");
    }
  }, []);
  return id;
}

/** Modulo per mettere in vetrina (o modificare) un server o un bot, con anteprima dal vivo. */
export function SubmitListing({ editId: forcedEditId }: { editId?: string } = {}) {
  const { ready, token, login } = useAuth();
  const urlEditId = useEditId();
  /* dentro la pagina Modifica l'id arriva da fuori (lì l'URL usa ?id=) */
  const editId = forcedEditId ?? urlEditId;
  const editing = Boolean(editId);
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [bundle, setBundleRaw] = useState<Bundle>(() => normalize(null));
  const setBundle = useCallback((v: Bundle | ((b: Bundle) => Bundle)) => setBundleRaw((prev) => normalize(typeof v === "function" ? v(prev) : v)), []);
  const { kind, form } = bundle;
  const set = useCallback((patch: Partial<Form>) => setBundle((b) => ({ ...b, form: { ...b.form, ...patch } })), [setBundle]);
  const [editing_listing, setEditingListing] = useState<BoardListing | null>(null);
  const [savedId, setSavedId] = useState("");
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [guildsBusy, setGuildsBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send" | "invite" | "banner" | "defaults">("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");
  const [descView, setDescView] = useState<"write" | "preview">("write");
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(normalize(null)));
  const dirty = !sent && JSON.stringify(bundle) !== baseline;

  const draft = useFormDraft("bacheca", bundle, (v) => setBundle(v), {
    storageKey: DRAFT_KEY,
    watch: true,
    debounceMs: 320,
    notify: false,
    enabled: !editId,
    isEmpty: (d) => !d.form.discordId.trim() && !d.form.name.trim() && !d.form.tagline.trim() && !d.form.description.trim(),
  });

  useEffect(() => {
    if (!ready) return;
    void loadBoardsConfig("", token).then((c) => c && setCfg(c));
  }, [ready, token]);

  /* modifica di una scheda esistente */
  useEffect(() => {
    if (!ready || !token || !editId) return;
    void loadMyListing(token, editId).then((r) => {
      if (!r.ok) return setErr(r.message);
      setEditingListing(r.data.listing);
      const loaded = fromListing(r.data.listing);
      setBundle(loaded);
      setBaseline(JSON.stringify(loaded));
    });
  }, [ready, token, editId, setBundle]);

  const refreshGuilds = useCallback(async () => {
    if (!token) return;
    setGuildsBusy(true);
    const r = await loadClaimableServers(token);
    setGuilds(r.ok ? ((r.data.guilds as Guild[]) || []) : []);
    setGuildsBusy(false);
  }, [token]);

  useEffect(() => {
    if (ready && token && kind === "server" && !editing) void refreshGuilds();
  }, [ready, token, kind, editing, refreshGuilds]);

  const minTag = cfg?.minTaglineChars ?? 20;
  const minDesc = cfg?.minDescriptionChars ?? 80;
  const maxCats = cfg?.maxCategories ?? 3;
  const maxLocales = cfg?.maxLocales ?? 3;
  const maxTags = cfg?.maxTags ?? 10;
  const guild = guilds?.find((g) => g.id === form.discordId);
  const botMissing = kind === "server" && Boolean(guild) && guild?.botPresent === false;
  const addBotUrl = cfg?.botInviteUrl ? `${cfg.botInviteUrl}${cfg.botInviteUrl.includes("?") ? "&" : "?"}guild_id=${form.discordId}&disable_guild_select=true` : "";

  const required = [
    { ok: Boolean(form.discordId.trim()), label: kind === "server" ? "Server scelto" : "Client ID del bot" },
    { ok: form.tagline.trim().length >= minTag, label: `Frase breve (${minTag}+ caratteri)` },
    { ok: form.description.trim().length >= minDesc, label: `Descrizione (${minDesc}+ caratteri)` },
    { ok: form.categories.length > 0, label: "Almeno una categoria" },
    { ok: form.locales.length > 0, label: "Almeno una lingua" },
  ];
  const optional = [
    { ok: Boolean(form.inviteUrl.trim()), label: kind === "bot" ? "Link per aggiungerlo" : "Link d’invito" },
    { ok: form.tags.length >= 3, label: "Almeno 3 tag" },
    { ok: Boolean(form.bannerUrl), label: "Banner" },
  ];
  const all = [...required, ...optional.map((o) => ({ ...o, optional: true }))];
  const done = all.filter((c) => c.ok).length;
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
      bannerUrl: form.bannerUrl,
      iconUrl: form.iconUrl || guild?.iconUrl || "",
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
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </section>
    );
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32);
    if (!t || form.tags.includes(t) || form.tags.length >= maxTags) return;
    set({ tags: [...form.tags, t] });
    setTagDraft("");
  }

  async function pickGuild(g: Guild) {
    if (g.id !== form.discordId) {
      /* cambio server: nome, invito e banner ripartono da quello nuovo (il nome solo se non l'hai scritto tu) */
      const nameFromGuild = !form.name.trim() || (guilds || []).some((x) => x.name === form.name);
      set({ discordId: g.id, name: nameFromGuild ? g.name : form.name, iconUrl: g.iconUrl || "", inviteUrl: "", bannerUrl: "" });
      setChecks((c) => ({ ...c, invite: { state: "idle" } }));
    }
    if (!token || g.botPresent === false) return;
    /* come la vecchia bacheca: nome, icona, banner e invito presi dal server */
    setBusy("defaults");
    const r = await loadGuildDefaults(token, g.id);
    setBusy("");
    if (!r.ok) {
      showToast(r.message || "Non riesco a leggere i dati del server.", true);
      return;
    }
    setBundle((b) => ({
      ...b,
      form: {
        ...b.form,
        name: b.form.name || r.data.name || g.name,
        iconUrl: r.data.iconUrl || b.form.iconUrl,
        bannerUrl: b.form.bannerUrl || r.data.bannerUrl || "",
        inviteUrl: b.form.inviteUrl || r.data.inviteUrl || "",
      },
    }));
    if (r.data.inviteUrl) setChecks((c) => ({ ...c, invite: { state: "ok", label: "Invito valido" } }));
  }

  async function onGenerateInvite() {
    if (!token || !form.discordId) return;
    setBusy("invite");
    const r = await generateGuildInvite(token, form.discordId, editId || savedId || undefined);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    set({ inviteUrl: r.data.inviteUrl, bannerUrl: form.bannerUrl || r.data.bannerUrl || "" });
    setChecks((c) => ({ ...c, invite: { state: "ok", label: "Invito creato dal bot" } }));
  }

  async function check(key: string, probeKind: ProbeKind, value: string, apply: (v: string) => void) {
    if (!token) return;
    const v = value.trim();
    if (!v) return setChecks((c) => ({ ...c, [key]: { state: "idle" } }));
    setChecks((c) => ({ ...c, [key]: { state: "busy" } }));
    const r = await probeLink(token, probeKind, v);
    if (!r.ok) return setChecks((c) => ({ ...c, [key]: { state: "bad", label: r.message } }));
    if (r.data.found && r.data.value && r.data.value !== v) apply(r.data.value);
    setChecks((c) => ({
      ...c,
      [key]: r.data.found ? { state: "ok", label: r.data.label ? `Server: ${r.data.label}` : "Link valido" } : { state: "bad", label: "Link non trovato o non valido" },
    }));
  }

  async function onBannerFile(file: File | undefined) {
    if (!file || !token) return;
    if (file.size > 2.5 * 1024 * 1024) return showToast("Il banner deve pesare al massimo 2,5 MB", true);
    setBusy("banner");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    }).catch(() => "");
    const r = dataUrl ? await uploadBanner(token, dataUrl) : null;
    setBusy("");
    if (!r || !r.ok) return showToast(r ? r.message : "Non riesco a leggere l’immagine", true);
    set({ bannerUrl: r.data.bannerUrl || r.data.url });
    showToast("Banner caricato");
  }

  /** Bot: nome e avatar letti da Discord dal Client ID (non sovrascrive un nome già scritto). */
  async function fillBotDefaults() {
    const id = form.discordId.trim();
    if (!token || editing || kind !== "bot" || !/^\d{16,22}$/.test(id)) return;
    setBusy("defaults");
    const r = await loadBotDefaults(token, id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    set({ name: form.name.trim() || r.data.name, iconUrl: r.data.iconUrl || form.iconUrl });
  }

  function body(submit: boolean): CreateListingBody {
    const socials = Object.fromEntries(Object.entries(form.socials).map(([k, v]) => [k, (v || "").trim()])) as Partial<Record<SocialKey, string>>;
    return {
      kind,
      discordId: form.discordId.trim(),
      name: form.name.trim() || undefined,
      tagline: form.tagline.trim(),
      description: form.description.trim(),
      categories: form.categories,
      locales: form.locales,
      tags: form.tags,
      ...(kind === "bot" ? { botInviteUrl: form.inviteUrl.trim() } : { inviteUrl: form.inviteUrl.trim() }),
      siteUrl: form.siteUrl.trim(),
      socials,
      features: {
        paidTier: form.paidTier,
        paidFeaturesAvailable: form.paidFeaturesAvailable,
        acceptsPartnerships: kind === "server" && form.acceptsPartnerships,
        requireVerification: kind === "server" && form.requireVerification,
        webInterface: kind === "bot" && form.webInterface,
        userInstallable: kind === "bot" && form.userInstallable,
      },
      ...(kind === "bot" ? { prefix: form.prefix.trim(), supportUrl: form.supportUrl.trim(), iconUrl: form.iconUrl || undefined } : {}),
      nsfw: form.nsfw,
      accent: form.accent,
      visitorNotes: form.visitorNotes.trim(),
      bannerUrl: form.bannerUrl,
      submit,
    };
  }

  async function save(submit: boolean) {
    if (!token) return login();
    setErr("");
    if (!form.discordId.trim()) return setErr(kind === "server" ? "Scegli prima un server." : "Inserisci il Client ID del bot.");
    if (submit) {
      const missing = required.find((c) => !c.ok);
      if (missing) return setErr(`Manca ancora: ${missing.label.toLowerCase()}.`);
    }
    setBusy(submit ? "send" : "draft");
    const id = editId || savedId;
    let listing: BoardListing | undefined;
    let message = "";
    if (id) {
      const { kind: _k, discordId: _d, submit: _s, ...patch } = body(submit);
      void _k;
      void _d;
      void _s;
      const r = await patchListing(token, id, patch);
      if (!r.ok) {
        setBusy("");
        setErr(r.message);
        showToast(r.message, true);
        return;
      }
      listing = r.data.listing;
      if (submit && listing?.status !== "approved" && listing?.status !== "pending") {
        const s = await submitListing(token, id);
        if (!s.ok) {
          setBusy("");
          setErr(s.message);
          showToast(s.message, true);
          return;
        }
        listing = s.data.listing || listing;
        message = s.data.message || "";
      }
    } else {
      const r = await createListing(token, body(submit));
      if (!r.ok) {
        setBusy("");
        setErr(r.message);
        showToast(r.message, true);
        return;
      }
      listing = r.data.listing;
      message = r.data.message || "";
      if (listing?.id) setSavedId(listing.id);
    }
    setBusy("");
    setBaseline(JSON.stringify(bundle));
    if (!submit) {
      showToast("Bozza salvata nelle tue schede");
      return;
    }
    const doneMsg = message || (editing ? "Modifiche salvate." : "Scheda inviata in revisione!");
    draft.clear();
    setSent(doneMsg);
    showToast(doneMsg);
    window.setTimeout(() => {
      window.location.href = page(listing?.slug ? `/vetrina/scheda/?slug=${encodeURIComponent(listing.slug)}` : "/vetrina/le-mie/");
    }, 1400);
  }

  const status = editing_listing?.status;
  const liveListing = editing && (status === "approved" || status === "pending");

  return (
    <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
      {/* come nella dashboard: barra in basso solo con modifiche non salvate */}
      <TrackUnsaved
        dirty={dirty && Boolean(form.discordId || form.tagline || form.description || form.name)}
        onSave={() => save(Boolean(liveListing))}
        onReset={() => setBundle(JSON.parse(baseline) as Bundle)}
      />
      <GlobalSaveBar />
      {editing && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl bg-caramel/10 p-4 ring-1 ring-caramel/25">
          <Pencil className="size-5 text-ember" />
          <p className="flex-1 text-sm text-crema/75">
            Stai modificando <strong className="text-crema">{editing_listing?.name || "la scheda"}</strong>
            {status ? ` · ${statusLabel(status).toLowerCase()}` : ""}.{" "}
            {status === "rejected" && editing_listing?.moderation?.rejectReason ? `Motivo del rifiuto: ${editing_listing.moderation.rejectReason}` : ""}
          </p>
          <SmartLink href={page("/vetrina/le-mie/")} className="text-sm text-crema/55 hover:text-crema">
            Torna alle mie schede
          </SmartLink>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-6">
          {/* 1 · tipo */}
          {!editing && (
            <Step n={1} title="Cosa metti in vetrina?">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(["server", "bot"] as BoardKind[]).map((k) => {
                  const active = kind === k;
                  const Icon = k === "bot" ? Bot : Server;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBundle((b) => ({ kind: k, form: { ...b.form, discordId: "", inviteUrl: "", iconUrl: "" } }))}
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
          )}

          {/* 2 · identità */}
          <Step n={editing ? 1 : 2} title={kind === "server" ? "Quale server?" : "Quale bot?"}>
            {kind === "server" ? (
              editing ? (
                <p className="flex items-center gap-3 rounded-2xl bg-espresso/50 p-4 text-sm text-crema/65 ring-1 ring-sand/12">
                  <Server className="size-5 text-ember" /> Server collegato: <strong className="text-crema">{form.name || form.discordId}</strong>
                </p>
              ) : guilds === null ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-espresso/50" />
                  ))}
                </div>
              ) : guilds.length === 0 ? (
                <p className="rounded-2xl bg-espresso/50 p-4 text-sm text-crema/60 ring-1 ring-sand/12">
                  Non trovo server che gestisci. Ti servono i permessi di gestione del server: se li hai, rientra con Discord e consenti l’accesso all’elenco dei tuoi server.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {guilds.map((g) => {
                      const locked = Boolean(g.alreadyListed && !g.hasDraft);
                      const active = form.discordId === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={locked}
                          onClick={() => void pickGuild(g)}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-45",
                            active ? "bg-caramel/15 ring-caramel/50" : "bg-espresso/50 ring-sand/12 hover:ring-sand/30",
                          )}
                        >
                          {g.iconUrl ? (
                             
                            <img src={g.iconUrl} alt="" className="size-10 rounded-xl object-cover" />
                          ) : (
                            <span className="flex size-10 items-center justify-center rounded-xl bg-mocha font-display text-lg text-crema/70">{g.name.slice(0, 1)}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-crema">{g.name}</span>
                            <span className={cn("text-xs", g.botPresent === false && !locked ? "text-ember" : "text-crema/45")}>
                              {locked ? "Già in vetrina" : g.hasDraft ? "Hai una bozza: riprendila" : g.botPresent === false ? "Manca il bot nel server" : "Pronto"}
                            </span>
                          </span>
                          {active && (busy === "defaults" ? <Loader2 className="size-5 shrink-0 animate-spin text-ember" /> : <Check className="size-5 shrink-0 text-ember" />)}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => void refreshGuilds()} disabled={guildsBusy} className="mt-3 inline-flex items-center gap-1.5 text-sm text-crema/50 hover:text-crema disabled:opacity-50">
                    <RefreshCcw className={cn("size-3.5", guildsBusy && "animate-spin")} /> Aggiorna l’elenco
                  </button>
                  {botMissing && (
                    <div className="mt-4 rounded-2xl bg-ember/10 p-4 ring-1 ring-ember/30">
                      <p className="flex items-center gap-2 font-semibold text-ember">
                        <CircleAlert className="size-4" /> Prima aggiungi il bot di Vinili &amp; Caffè al server
                      </p>
                      <p className="mt-1 text-sm text-crema/65">Serve per leggere nome, icona e membri e per creare l’invito. Aggiungilo, poi ricontrolla.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {addBotUrl && (
                          <a href={addBotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-caramel px-4 py-2 text-sm font-bold text-ink">
                            <Plus className="size-4" /> Aggiungi il bot
                          </a>
                        )}
                        <button type="button" onClick={() => void refreshGuilds()} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
                          <RefreshCcw className={cn("size-4", guildsBusy && "animate-spin")} /> L’ho aggiunto, ricontrolla
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Client ID del bot" hint="Lo trovi nel Developer Portal di Discord, alla voce Application ID: nome e avatar li prendiamo da lì.">
                  <div className="flex items-center gap-2">
                    {form.iconUrl ? (
                       
                      <img src={form.iconUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-sand/20" />
                    ) : null}
                    <input
                      value={form.discordId}
                      disabled={editing}
                      onChange={(e) => set({ discordId: e.target.value.replace(/\D/g, "") })}
                      onBlur={() => void fillBotDefaults()}
                      inputMode="numeric"
                      placeholder="123456789012345678"
                      className={cn(INPUT, editing && "opacity-60")}
                    />
                    {busy === "defaults" ? <Loader2 className="size-5 shrink-0 animate-spin text-ember" /> : null}
                  </div>
                </Field>
                <Field label="Nome del bot">
                  <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Come si chiama?" className={INPUT} />
                </Field>
                <Field label="Prefisso" hint="Se il bot ha anche comandi che iniziano con un simbolo (come ! o $). Lascia vuoto se usa solo i comandi con la barra.">
                  <input value={form.prefix} onChange={(e) => set({ prefix: e.target.value.slice(0, 16) })} maxLength={16} placeholder="!" className={INPUT} />
                </Field>
              </div>
            )}
          </Step>

          {/* 3 · presentazione */}
          <Step n={editing ? 2 : 3} title="Contenuti">
            <div className="space-y-4">
              {kind === "server" && (
                <Field label="Nome mostrato" hint="Di solito è il nome del server.">
                  <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className={INPUT} />
                </Field>
              )}
              <Field label="Frase breve" hint="La prima cosa che si legge sulla card." counter={<Counter n={form.tagline.trim().length} min={minTag} />}>
                <input
                  value={form.tagline}
                  onChange={(e) => set({ tagline: e.target.value.replace(/\n/g, " ") })}
                  maxLength={140}
                  placeholder={kind === "bot" ? "Musica in alta qualità e radio 24/7 per il tuo server." : "Una community accogliente per chi ama musica e videogiochi."}
                  className={INPUT}
                />
              </Field>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-crema/45">
                  <span className="flex-1">Descrizione</span>
                  <Counter n={form.description.trim().length} min={minDesc} />
                  <span className="inline-flex rounded-full bg-espresso/60 p-0.5 normal-case tracking-normal ring-1 ring-sand/12">
                    {(["write", "preview"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setDescView(v)} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", descView === v ? "bg-crema text-ink" : "text-crema/55")}>
                        {v === "write" ? <Pencil className="size-3" /> : <Eye className="size-3" />} {v === "write" ? "Scrivi" : "Anteprima"}
                      </button>
                    ))}
                  </span>
                  <button type="button" title="Togli grassetti, titoli e citazioni" onClick={() => set({ description: stripMarkdown(form.description) })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 normal-case tracking-normal text-crema/50 ring-1 ring-sand/12 hover:text-crema">
                    <Eraser className="size-3" /> Togli formattazione
                  </button>
                </div>
                {descView === "write" ? (
                  <textarea
                    value={form.description}
                    onChange={(e) => set({ description: e.target.value })}
                    rows={10}
                    maxLength={cfg?.maxMarkdownChars || 4000}
                    placeholder="Racconta cosa si fa, com’è l’atmosfera, gli eventi, le funzioni principali…"
                    className={cn(INPUT, "resize-y leading-relaxed")}
                  />
                ) : (
                  <div className="min-h-[15rem] rounded-2xl bg-espresso/60 p-4 leading-relaxed text-crema/80 ring-1 ring-sand/15">
                    {form.description.trim() ? <DiscordContent text={form.description} /> : <span className="text-crema/35">Niente da mostrare ancora.</span>}
                  </div>
                )}
                <span className="mt-1.5 block text-xs text-crema/40">Formato di Discord: **grassetto**, *corsivo*, # titoli, &gt; citazioni, elenchi e link.</span>
              </div>
              <Field label="Note per chi entra" hint="Facoltativo: cosa fare appena arrivati.">
                <input value={form.visitorNotes} onChange={(e) => set({ visitorNotes: e.target.value })} maxLength={300} placeholder="Leggi le regole in #benvenuto e presentati!" className={INPUT} />
              </Field>
            </div>
          </Step>

          {/* 4 · classificazione */}
          <Step n={editing ? 3 : 4} title="Classificazione">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field group label={`Categorie (${form.categories.length}/${maxCats})`}>
                  <OptionPicker
                    multiple
                    max={maxCats}
                    icon={<LayoutGrid />}
                    placeholder="Scegli le categorie"
                    searchPlaceholder="Cerca una categoria…"
                    options={categoriesFor(cfg, kind).map((c) => ({ value: c, label: labelOf(cfg?.categoryLabels, c) }))}
                    value={form.categories}
                    onChange={(categories) => set({ categories })}
                  />
                </Field>
                <Field group label={`Lingue (${form.locales.length}/${maxLocales})`}>
                  <OptionPicker
                    multiple
                    max={maxLocales}
                    icon={<Languages />}
                    placeholder="Scegli le lingue"
                    searchPlaceholder="Cerca una lingua…"
                    options={(cfg?.locales || []).map((l) => ({ value: l, label: labelOf(cfg?.localeLabels, l) }))}
                    value={form.locales}
                    onChange={(locales) => set({ locales })}
                  />
                </Field>
              </div>
              <Field group label={`Tag (${form.tags.length}/${maxTags})`} hint="Parole che usano le persone quando cercano. Invio o virgola per aggiungere.">
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
                      .filter((t) => !form.tags.includes(t) && (!tagDraft || t.includes(tagDraft.trim().toLowerCase())))
                      .slice(0, 16)
                      .map((t) => (
                        <button key={t} type="button" onClick={() => addTag(t)} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-crema/45 ring-1 ring-sand/12 hover:text-ember">
                          <Plus className="size-3" />
                          {t}
                        </button>
                      ))}
                  </div>
                )}
              </Field>
              <Toggle on={form.nsfw} onClick={() => set({ nsfw: !form.nsfw })} icon={<CircleAlert />} label="Contenuti per adulti (18+)" danger />
            </div>
          </Step>

          {/* 5 · collegamenti */}
          <Step n={editing ? 4 : 5} title="Collegamenti">
            <div className="space-y-4">
              <Field label={kind === "bot" ? "Link per aggiungere il bot" : "Link d’invito"} hint={kind === "server" ? "Meglio un invito che non scade: il bot può crearne uno per te." : "Il link OAuth che usi per invitare il bot."} status={<CheckBadge c={checks.invite} />}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={form.inviteUrl}
                    onChange={(e) => {
                      set({ inviteUrl: e.target.value });
                      setChecks((c) => ({ ...c, invite: { state: "idle" } }));
                    }}
                    onBlur={() => void check("invite", kind === "bot" ? "bot_invite" : "invite", form.inviteUrl, (v) => set({ inviteUrl: v }))}
                    placeholder={kind === "bot" ? "https://discord.com/oauth2/authorize?client_id=…" : "https://discord.gg/…"}
                    className={INPUT}
                  />
                  {kind === "server" ? (
                    <button
                      type="button"
                      disabled={!form.discordId || botMissing || busy === "invite"}
                      onClick={() => void onGenerateInvite()}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-crema/10 px-4 py-3 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-40"
                    >
                      {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Genera invito
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!form.discordId}
                      onClick={() => set({ inviteUrl: `https://discord.com/oauth2/authorize?client_id=${form.discordId}&scope=bot%20applications.commands` })}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-crema/10 px-4 py-3 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-40"
                    >
                      <Wand2 className="size-4" /> Link standard
                    </button>
                  )}
                </div>
              </Field>
              {kind === "bot" && (
                <Field label="Server di supporto" hint="L’invito al server dove si chiede aiuto. Dalla pagina Gestisci puoi collegare un server già in vetrina." status={<CheckBadge c={checks.support} />}>
                  <input
                    value={form.supportUrl}
                    onChange={(e) => {
                      set({ supportUrl: e.target.value });
                      setChecks((c) => ({ ...c, support: { state: "idle" } }));
                    }}
                    onBlur={() => void check("support", "invite", form.supportUrl, (v) => set({ supportUrl: v }))}
                    placeholder="https://discord.gg/…"
                    className={INPUT}
                  />
                </Field>
              )}
              <Field label="Sito web" status={<CheckBadge c={checks.website} />}>
                <input
                  value={form.siteUrl}
                  onChange={(e) => {
                    set({ siteUrl: e.target.value });
                    setChecks((c) => ({ ...c, website: { state: "idle" } }));
                  }}
                  onBlur={() => void check("website", "website", form.siteUrl, (v) => set({ siteUrl: v }))}
                  placeholder="www.esempio.it"
                  className={INPUT}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SOCIAL_KEYS.map((k) => (
                  <Field key={k} label={SOCIAL_LABELS[k]} status={<CheckBadge c={checks[k]} />}>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-crema/35">@</span>
                      <input
                        value={(form.socials[k] || "").replace(/^@/, "")}
                        onChange={(e) => {
                          set({ socials: { ...form.socials, [k]: e.target.value } });
                          setChecks((c) => ({ ...c, [k]: { state: "idle" } }));
                        }}
                        onBlur={() => void check(k, k, form.socials[k] || "", (v) => set({ socials: { ...form.socials, [k]: v } }))}
                        placeholder="nome o link"
                        className={cn(INPUT, "pl-9")}
                      />
                    </div>
                  </Field>
                ))}
              </div>
            </div>
          </Step>

          {/* 6 · personalizzazione */}
          <Step n={editing ? 5 : 6} title="Personalizzazione">
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold text-crema/45">Banner (facoltativo)</p>
                <div
                  className="relative flex h-40 items-end overflow-hidden rounded-2xl ring-1 ring-sand/15"
                  style={{ background: form.bannerUrl ? undefined : `radial-gradient(120% 140% at 15% 0%, ${form.accent}aa, transparent 55%), #1a110c` }}
                >
                  {form.bannerUrl ? (
                     
                    <img src={form.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : null}
                  <div className="relative flex w-full flex-wrap gap-2 bg-gradient-to-t from-espresso/90 to-transparent p-3">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === "banner"} className="inline-flex items-center gap-1.5 rounded-full bg-crema px-3.5 py-1.5 text-sm font-bold text-ink disabled:opacity-60">
                      {busy === "banner" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {form.bannerUrl ? "Cambia banner" : "Carica banner"}
                    </button>
                    {form.bannerUrl && (
                      <button type="button" onClick={() => set({ bannerUrl: "" })} className="inline-flex items-center gap-1.5 rounded-full bg-espresso/80 px-3.5 py-1.5 text-sm font-semibold text-crema/80 ring-1 ring-sand/25">
                        <Trash2 className="size-4" /> Rimuovi
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void onBannerFile(e.target.files?.[0])} />
                </div>
                <p className="mt-1.5 text-xs text-crema/40">PNG, JPG, WEBP o GIF fino a 2,5 MB. Se il server ha un banner su Discord lo usiamo in automatico.</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-crema/45">Colore della scheda</p>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colore ${c}`}
                      aria-pressed={form.accent.toLowerCase() === c}
                      onClick={() => set({ accent: c })}
                      className={cn("size-9 rounded-full ring-2 ring-offset-2 ring-offset-roast transition-transform ", form.accent.toLowerCase() === c ? "ring-crema" : "ring-transparent")}
                      style={{ background: c }}
                    />
                  ))}
                  {/* selettore del sito (come nella dashboard), non la tavolozza del browser */}
                  <ColorPicker
                    value={HEX.test(form.accent) ? form.accent : DEFAULT_ACCENT}
                    defaultHex={DEFAULT_ACCENT}
                    showReset
                    ariaLabel="Colore della scheda"
                    onChange={(hex) => set({ accent: hex || DEFAULT_ACCENT })}
                  />
                </div>
              </div>
            </div>
          </Step>

          {/* 7 · funzionalità */}
          <Step n={editing ? 6 : 7} title="Funzionalità">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-crema/45">Il progetto è…</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                  {(
                    [
                      ["free", "Gratis", "Tutte le funzioni principali sono gratuite."],
                      ["paid", "A pagamento", "Si paga, o le funzioni principali sono dietro un paywall."],
                    ] as const
                  ).map(([v, title, hint]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={form.paidTier === v}
                      onClick={() => set({ paidTier: v })}
                      className={cn("rounded-2xl p-4 text-left ring-1 transition-colors", form.paidTier === v ? "bg-ember/15 ring-ember/45" : "bg-espresso/50 ring-sand/12 hover:ring-sand/30")}
                    >
                      <span className="flex items-center gap-2 font-semibold text-crema">
                        <span className={cn("size-4 rounded-full ring-2", form.paidTier === v ? "bg-ember ring-ember/40" : "ring-sand/30")} /> {title}
                      </span>
                      <span className="mt-1 block text-xs text-crema/50">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* una sotto l'altra: in tre colonne le scritte andavano a capo male */}
              <div className="grid grid-cols-1 gap-2">
                <Toggle on={form.paidFeaturesAvailable} onClick={() => set({ paidFeaturesAvailable: !form.paidFeaturesAvailable })} icon={<Sparkles />} label="Funzioni premium opzionali" />
                {kind === "server" ? (
                  <>
                    <Toggle on={form.acceptsPartnerships} onClick={() => set({ acceptsPartnerships: !form.acceptsPartnerships })} icon={<Handshake />} label="Accetta partnership" />
                    <Toggle on={form.requireVerification} onClick={() => set({ requireVerification: !form.requireVerification })} icon={<ShieldCheck />} label="Verifica all’ingresso" />
                  </>
                ) : (
                  <>
                    <Toggle on={form.webInterface} onClick={() => set({ webInterface: !form.webInterface })} icon={<MonitorSmartphone />} label="Ha un’interfaccia web (dashboard)" />
                    <Toggle on={form.userInstallable} onClick={() => set({ userInstallable: !form.userInstallable })} icon={<UserRound />} label="Installabile come app utente" />
                  </>
                )}
              </div>
            </div>
          </Step>
        </div>

        {/* anteprima e invio */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <p className="font-script text-2xl text-caramel/85">Così apparirà</p>
          <div className="pointer-events-none">
            <ListingCard listing={preview} cfg={cfg} />
          </div>
          <div className="rounded-3xl bg-roast/80 p-5 ring-1 ring-sand/12">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-crema">Completezza</span>
              <span className="tabular-nums text-crema/55">
                {done}/{all.length}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-crema/8">
              <motion.div className="h-full rounded-full bg-caramel" animate={{ width: `${(done / all.length) * 100}%` }} />
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {all.map((c) => (
                <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-crema/75" : "text-crema/40")}>
                  <span className={cn("flex size-4 items-center justify-center rounded-full", c.ok ? "bg-ember text-ink" : "ring-1 ring-sand/25")}>{c.ok && <Check className="size-3" />}</span>
                  {c.label}
                  {"optional" in c && !c.ok ? <span className="text-xs text-crema/30">· consigliato</span> : null}
                </li>
              ))}
            </ul>
            {err && <p className="mt-4 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p>}
            {sent ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#5f9a6a]/20 p-3 text-sm text-[#a7d8b0] ring-1 ring-[#5f9a6a]/40">
                <Check className="size-4" /> {sent}
              </p>
            ) : (
              <div className="mt-5 space-y-2">
                <button
                  type="submit"
                  disabled={!!busy || !canSend}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-caramel py-3.5 font-bold text-ink transition  disabled:translate-y-0 disabled:opacity-45"
                >
                  {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {editing && (status === "approved" || status === "pending") ? "Salva le modifiche" : "Invia in revisione"}
                </button>
                {!(editing && (status === "approved" || status === "pending")) && (
                  <button
                    type="button"
                    disabled={!!busy || !form.discordId}
                    onClick={() => void save(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-crema/8 py-3 text-sm font-semibold text-crema ring-1 ring-sand/20 transition hover:bg-crema/12 disabled:opacity-45"
                  >
                    {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salva come bozza
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 text-center text-xs text-crema/40">
              Lo staff controlla ogni scheda prima di pubblicarla.{" "}
              <SmartLink href={page("/vetrina/linee-guida-recensioni/")} className="text-caramel underline-offset-2 hover:underline">
                Linee Guida
              </SmartLink>
              {draft.restored ? " · bozza ripresa" : ""}
            </p>
          </div>
        </aside>
      </form>
    </section>
  );
}

const INPUT = "w-full rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-ember/45 disabled:cursor-not-allowed";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <motion.fieldset initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.04 }} className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
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
function Field({ label, hint, counter, status, group = false, children }: { label: string; hint?: string; counter?: ReactNode; status?: ReactNode; group?: boolean; children: ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-crema/45">
        <span>{label}</span>
        {counter}
        {status}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-crema/40">{hint}</span> : null}
    </Tag>
  );
}

function Counter({ n, min }: { n: number; min: number }) {
  return <span className={cn("normal-case tracking-normal tabular-nums", n >= min ? "text-[#a7d8b0]" : "text-crema/35")}>{n >= min ? <Check className="inline size-3.5" /> : `${n}/${min}`}</span>;
}

function CheckBadge({ c }: { c?: Check }) {
  if (!c || c.state === "idle") return null;
  if (c.state === "busy")
    return (
      <span className="inline-flex items-center gap-1 normal-case tracking-normal text-crema/45">
        <Loader2 className="size-3.5 animate-spin" /> controllo…
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-1 normal-case tracking-normal", c.state === "ok" ? "text-[#a7d8b0]" : "text-ember")}>
      {c.state === "ok" ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />} {c.label || (c.state === "ok" ? "ok" : "non valido")}
    </span>
  );
}

function Toggle({ on, onClick, icon, label, danger = false }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition-colors [&>svg]:size-4",
        on ? (danger ? "bg-[#a83a2c]/20 text-[#f0a493] ring-[#a83a2c]/45" : "bg-ember/15 text-ember ring-ember/40") : "bg-espresso/50 text-crema/55 ring-sand/12 hover:text-crema",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? (danger ? "bg-[#a83a2c]" : "bg-ember") : "bg-crema/15")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-crema transition-[color,background-color,border-color,opacity,transform]", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

