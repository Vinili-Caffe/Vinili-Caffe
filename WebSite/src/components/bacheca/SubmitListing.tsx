"use client";

import { useEffect, useState } from "react";
import { Bot, Info, LogIn, Server } from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import {
  createListing,
  loadBoardsConfig,
  loadClaimableServers,
  type BoardKind,
  type BoardsConfig,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "../SmartLink";
import { Select } from "@/components/ui/Select";

type Guild = { id: string; name: string; iconUrl?: string; alreadyListed?: boolean; botPresent?: boolean; hasDraft?: boolean };
type ListingDraft = { discordId: string; name: string; tagline: string; description: string };
type VetrinaDraft = { kind: BoardKind; form: ListingDraft };

const BACHECA_DRAFT_KEY = "vc_bacheca_draft_v1";
const emptyForm = (): ListingDraft => ({ discordId: "", name: "", tagline: "", description: "" });

/** Form invio scheda bot/server in bacheca. */
export function SubmitListing() {
  const { ready, token, login } = useAuth();
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [draftBundle, setDraftBundle] = useState<VetrinaDraft>(() => ({ kind: "server", form: emptyForm() }));
  const kind = draftBundle.kind;
  const form = draftBundle.form;
  const setKind = (k: BoardKind) => setDraftBundle((b) => ({ ...b, kind: k }));
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const discordId = form.discordId;
  const name = form.name;
  const tagline = form.tagline;
  const description = form.description;
  const setDiscordId = (v: string) => setDraftBundle((b) => ({ ...b, form: { ...b.form, discordId: v } }));
  const setName = (v: string) => setDraftBundle((b) => ({ ...b, form: { ...b.form, name: v } }));
  const setTagline = (v: string) => setDraftBundle((b) => ({ ...b, form: { ...b.form, tagline: v } }));
  const setDescription = (v: string) => setDraftBundle((b) => ({ ...b, form: { ...b.form, description: v } }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const draft = useFormDraft("bacheca", draftBundle, setDraftBundle, {
    storageKey: BACHECA_DRAFT_KEY,
    watch: true,
    debounceMs: 320,
    isEmpty: (d) =>
      !d.form.discordId.trim() && !d.form.name.trim() && !d.form.tagline.trim() && !d.form.description.trim(),
  });

  useEffect(() => {
    if (!ready) return;
    loadBoardsConfig("", token).then((c) => c && setCfg(c));
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !token || kind !== "server") return;
    loadClaimableServers(token).then((r) => {
      if (r.ok) setGuilds((r.data.guilds as Guild[]) || []);
    });
  }, [ready, token, kind]);

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-xl px-6 pb-24 text-center">
        <p className="font-display text-3xl">Prima il login</p>
        <p className="mt-2 text-crema/60">Per mettere una scheda in vetrina serve Discord collegato.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  const minTag = cfg?.minTaglineChars ?? 20;
  const minDesc = cfg?.minDescriptionChars ?? 80;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return login();
    setErr("");
    setMsg("");
    if (!discordId.trim()) {
      setErr(kind === "server" ? "Scegli un server." : "Inserisci il Client ID del bot.");
      return;
    }
    if (tagline.trim().length < minTag) {
      setErr(`La tagline deve avere almeno ${minTag} caratteri.`);
      return;
    }
    if (description.trim().length < minDesc) {
      setErr(`La descrizione deve avere almeno ${minDesc} caratteri.`);
      return;
    }
    setBusy(true);
    const r = await createListing(token, {
      kind,
      discordId: discordId.trim(),
      name: name.trim() || undefined,
      tagline: tagline.trim(),
      description: description.trim(),
      submit: true,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(r.data.message || (r.data.resumed ? "Bozza ripresa." : "Scheda inviata in revisione."));
    draft.clear();
    const slug = r.data.listing?.slug;
    if (slug) {
      window.setTimeout(() => {
        window.location.href = page(`/vetrina/scheda/?slug=${encodeURIComponent(slug)}`);
      }, 900);
    } else {
      window.setTimeout(() => {
        window.location.href = page("/vetrina/le-mie/");
      }, 900);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24">
      <div className="mb-6 flex gap-3 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/25">
        <Info className="mt-0.5 size-5 shrink-0 text-ember" />
        <p className="text-sm text-crema/75">
          Compila tagline e descrizione come sul sito attuale. Dopo l’invio la scheda va in revisione staff.{" "}
          <SmartLink href={page("/vetrina/linee-guida-recensioni/")} className="text-caramel underline">
            Linee guida
          </SmartLink>
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 rounded-[2rem] bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12 sm:p-8">
        <div className="flex gap-2">
          {(["server", "bot"] as BoardKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setDiscordId("");
              }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold",
                kind === k ? "bg-caramel text-ink" : "bg-crema/6 text-crema/65 ring-1 ring-sand/15",
              )}
            >
              {k === "bot" ? <Bot className="size-4" /> : <Server className="size-4" />}
              {k === "bot" ? "Bot" : "Server"}
            </button>
          ))}
        </div>

        {kind === "server" ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Server gestibile</span>
            <Select
              value={discordId}
              onChange={setDiscordId}
              placeholder="Seleziona…"
              className="mt-2 rounded-2xl bg-espresso/60 px-4 py-3"
              options={[
                { value: "", label: "Seleziona…" },
                ...guilds.map((g) => ({
                  value: g.id,
                  label: `${g.name}${g.alreadyListed ? " (già in vetrina)" : ""}${!g.botPresent ? " — bot assente" : ""}`,
                  disabled: !!g.alreadyListed && !g.hasDraft,
                })),
              ]}
            />
          </label>
        ) : (
          <>
            <label htmlFor="discord-id" className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Client ID bot</span>
              <input id="discord-id" name="discord-id"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15"
                inputMode="numeric"
                placeholder="Application ID"
              />
            </label>
            <label htmlFor="name" className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Nome</span>
              <input id="name" name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15"
                maxLength={100}
              />
            </label>
          </>
        )}

        <label htmlFor="tagline" className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
            Tagline <span className="normal-case tracking-normal text-crema/35">({tagline.length}/{minTag}+)</span>
          </span>
          <input id="tagline" name="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="mt-2 w-full rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15"
            maxLength={500}
          />
        </label>

        <label htmlFor="description" className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">
            Descrizione <span className="normal-case tracking-normal text-crema/35">({description.length}/{minDesc}+)</span>
          </span>
          <textarea id="description" name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            className="mt-2 w-full resize-y rounded-2xl bg-espresso/60 px-4 py-3 text-crema outline-none ring-1 ring-sand/15"
            maxLength={cfg?.maxMarkdownChars || 4000}
          />
        </label>

        {err && <p className="text-sm text-ember">{err}</p>}
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-3.5 font-semibold text-ink disabled:opacity-50"
        >
          {busy ? "Invio…" : "Invia in revisione"}
        </button>
      </form>
    </section>
  );
}
