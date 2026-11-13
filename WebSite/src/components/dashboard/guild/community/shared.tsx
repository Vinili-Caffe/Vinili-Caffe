"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Mail, Send, Smile } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { ColorPicker } from "@/components/ui/color-picker";
import { toggleEmojiPicker, customEmojiUrl, type EmojiPick } from "@/components/ui/emoji-picker";
import { Select } from "@/components/ui/Select";
import { avatarUrl, displayName, useAuth, type DiscordUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { chooseDialog } from "@/components/ui";
import { communityApi, emptyDraft, loadCommunity, type CommunityData, type MsgDraft, type PickerChannel, type PickerEmoji, type PickerRole } from "@/lib/dashboard-community";
import { ExpandableTextarea, Field, SettingRow, Toggle, fieldClass, labelClass, miniBtn } from "../bits";
import { EmbedFieldsPreview, FieldsEditor, LinkButtonsEditor, V2Editor, V2Preview, blocksFromClassic, v2Of } from "./draftExtras";

/* ───────────── dati ───────────── */

export function useCommunity(guildId: string, token: string) {
  const [data, setData] = useState<CommunityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadCommunity(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, setData, error, reload };
}

/* ───────────── segnaposto ───────────── */

export const MEMBER_PLACEHOLDERS = [
  { token: "{user}", hint: "menziona l'utente" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{server}", hint: "nome del server" },
  { token: "{membercount}", hint: "numero di membri" },
  { token: "{benvenuto}", hint: "benvenuto/benvenuta in base ai pronomi" },
  { token: "{Benvenuto}", hint: "come sopra, con la maiuscola" },
];

/** Si possono usare al posto di un link nelle immagini dell'embed. */
export const IMAGE_PLACEHOLDERS = [
  { token: "{avatar}", label: "Foto utente", hint: "foto profilo di chi entra o usa il comando" },
  { token: "{servericon}", label: "Icona server", hint: "icona del server" },
  { token: "{serverbanner}", label: "Banner server", hint: "banner del server (se ne ha uno)" },
];

/** Campo immagine: link oppure uno dei segnaposto con un clic. */
export function ImageUrlField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const active = IMAGE_PLACEHOLDERS.find((p) => p.token === value);
  return (
    <div className="min-w-0">
      <span className={cn(labelClass, "block")}>{label}</span>
      <input value={value} onChange={(ev) => onChange(ev.target.value)} placeholder="https://…" aria-label={label} className={fieldClass} />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {IMAGE_PLACEHOLDERS.map((p) => (
          <button
            key={p.token}
            type="button"
            title={p.hint}
            onClick={() => onChange(active?.token === p.token ? "" : p.token)}
            className={cn(
              "rounded-md px-2 py-1 text-[0.72rem] font-semibold ring-1 transition",
              active?.token === p.token ? "bg-caramel/20 text-ember ring-caramel/40" : "bg-crema/[0.06] text-crema/70 ring-sand/10 hover:bg-crema/[0.1] hover:text-crema",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function sampleVars(data: CommunityData | null, extra: Record<string, string> = {}, viewer?: DiscordUser | null) {
  const id = String(viewer?.id || "").trim();
  const nice = viewer ? displayName(viewer) : "Tu";
  const uname = String(viewer?.username || "").trim() || "tu";
  return {
    user: id ? `<@${id}>` : "@Tu",
    username: nice,
    "user.name": uname,
    "user.id": id,
    server: data?.guild.name || "Il tuo server",
    avatar: viewer ? avatarUrl(viewer, 256) : "https://cdn.discordapp.com/embed/avatars/0.png",
    servericon: data?.guild.icon ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png?size=256` : "https://cdn.discordapp.com/embed/avatars/1.png",
    serverbanner: data?.guild.banner
      ? `https://cdn.discordapp.com/banners/${data.guild.id}/${data.guild.banner}.${data.guild.banner.startsWith("a_") ? "gif" : "png"}?size=1024`
      : "",
    benvenuto: "benvenuto",
    Benvenuto: "Benvenuto",
    membercount: String(data?.guild.memberCount ?? 128),
    channel: "#generale",
    args: "",
    ...extra,
  } as Record<string, string>;
}

/** Anteprima dashboard: usa sempre l’utente loggato (nome + avatar), non un Mario generico. */
export function useSampleVars(data: CommunityData | null, extra: Record<string, string> = {}) {
  const { user } = useAuth();
  const extraKey = JSON.stringify(extra);
  return useMemo(() => sampleVars(data, JSON.parse(extraKey) as Record<string, string>, user), [data, user, extraKey]);
}

export function PlaceholderChips({ items, onInsert }: { items: { token: string; hint: string }[]; onInsert: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <button
          key={p.token}
          type="button"
          onClick={() => onInsert(p.token)}
          title={p.hint}
          className="rounded-md bg-crema/[0.06] px-2 py-1 font-mono text-[0.72rem] text-crema/80 ring-1 ring-sand/10 transition hover:bg-crema/[0.1] hover:text-crema"
        >
          {p.token}
        </button>
      ))}
    </div>
  );
}

/* ───────────── campi ───────────── */

export function ChannelField({
  label,
  value,
  channels,
  onChange,
  hint,
}: {
  label: string;
  value: string | null;
  channels: PickerChannel[];
  onChange: (id: string | null) => void;
  hint?: React.ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select
        value={value || ""}
        onChange={(v) => onChange(v || null)}
        className={fieldClass}
        options={[{ value: "", label: "— Scegli un canale —" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
      />
    </Field>
  );
}

export function roleOptions(roles: PickerRole[], guildId?: string) {
  return roles.filter((r) => !r.managed && r.id !== guildId).map((r) => ({ value: r.id, label: `@${r.name}` }));
}

/** Pulsante emoji: normali + emoji del server. `onPick` riceve "😀" o "<:nome:id>". */
export function EmojiButton({
  emojis,
  onPick,
  className,
  children,
  label = "Emoji",
}: {
  emojis: PickerEmoji[];
  onPick: (text: string) => void;
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() =>
        toggleEmojiPicker({
          anchor: ref.current,
          guildEmojis: emojis.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: e.url, guildName: e.guildName })),
          onPick: (p: EmojiPick) => onPick(p.type === "unicode" ? p.text : p.markup),
        })
      }
      className={cn(miniBtn, className)}
    >
      {children ?? <Smile className="size-3.5" />}
    </button>
  );
}

/** Mostra un'emoji salvata ("😀" o "<:nome:id>"). */
export function EmojiGlyph({ value, className }: { value: string; className?: string }) {
  const m = String(value || "").match(/^<(a?):([\w~]+):(\d+)>$/);
  if (m) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={customEmojiUrl(m[3], m[1] === "a", 48)} alt={m[2]} className={cn("inline-block size-[1.1em] object-contain", className)} />;
  }
  return value ? <span className={className}>{value}</span> : null;
}

function insertAt(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, insert: string, max: number) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? start;
  const next = (value.slice(0, start) + insert + value.slice(end)).slice(0, max);
  if (el) {
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(start + insert.length, start + insert.length);
      } catch {
        /* ignore */
      }
    });
  }
  return next;
}

/** Textarea con pulsante emoji e chip dei segnaposto. */
export function RichTextArea({
  label,
  value,
  onChange,
  max,
  rows = 4,
  emojis,
  placeholders,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  emojis: PickerEmoji[];
  placeholders?: { token: string; hint: string }[];
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>{label}</span>
        <span className="text-[0.68rem] tabular-nums text-crema/45">
          {value.length}/{max}
        </span>
      </div>
      <ExpandableTextarea
        ref={ref}
        value={value}
        rows={Math.max(rows, 5)}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <EmojiButton emojis={emojis} onPick={(t) => onChange(insertAt(ref.current, value, t, max))} />
        {placeholders?.length ? <PlaceholderChips items={placeholders} onInsert={(t) => onChange(insertAt(ref.current, value, t, max))} /> : null}
      </div>
    </div>
  );
}

/* ───────────── editor messaggio ───────────── */

function cloneDraft(d: MsgDraft): MsgDraft {
  return JSON.parse(JSON.stringify(d)) as MsgDraft;
}

export function DraftEditor({
  value,
  onChange,
  emojis,
  placeholders,
  allowButtons = true,
  maxButtons = 5,
}: {
  value: MsgDraft;
  onChange: (d: MsgDraft) => void;
  emojis: PickerEmoji[];
  placeholders?: { token: string; hint: string }[];
  allowButtons?: boolean;
  maxButtons?: number;
}) {
  const e = value.embed;
  const pastRef = useRef<MsgDraft[]>([]);
  const applyingUndo = useRef(false);
  const [canUndo, setCanUndo] = useState(false);

  const setDraft = useCallback(
    (next: MsgDraft) => {
      if (!applyingUndo.current) {
        pastRef.current.push(cloneDraft(value));
        if (pastRef.current.length > 40) pastRef.current.shift();
        setCanUndo(true);
      }
      onChange(next);
    },
    [onChange, value],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    applyingUndo.current = true;
    setCanUndo(pastRef.current.length > 0);
    onChange(prev);
    queueMicrotask(() => {
      applyingUndo.current = false;
    });
  }, [onChange]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== "z" || ev.shiftKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        /* in input nativo Ctrl+Z resta quello del browser; qui solo se non c'è selezione da annullare… lasciamo entrambi: usiamo il bottone + Ctrl+Z fuori dai campi */
        return;
      }
      if (!pastRef.current.length) return;
      ev.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const setEmbed = (p: Partial<MsgDraft["embed"]>) => setDraft({ ...value, embed: { ...e, ...p } });
  const v2 = v2Of(value);
  const mentionUsers = value.mentionUsers === true;
  const mentionRoles = value.mentionRoles !== false;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-[15rem] flex-1 grid-cols-2 gap-1 rounded-xl bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Formato del messaggio">
          {[
            { on: false, label: "Testo + embed" },
            { on: true, label: "Components V2" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={v2.enabled === opt.on}
              onClick={() => {
                if (v2.enabled === opt.on) return;
                setDraft({ ...value, v2: { ...v2, enabled: opt.on, blocks: opt.on && !v2.blocks.length ? blocksFromClassic(value) : v2.blocks } });
              }}
              className={cn(
                "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors",
                v2.enabled === opt.on ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button type="button" className={miniBtn} disabled={!canUndo} onClick={undo} title="Annulla l'ultima modifica (Ctrl+Z fuori dai campi)">
          Annulla modifica
        </button>
      </div>

      <div className="space-y-2 rounded-2xl bg-espresso/40 p-3 ring-1 ring-sand/10">
        <SettingRow title="Ping utenti" description="Se attivo, le menzioni utente nel testo (e {user} nel benvenuto) notificano davvero.">
          <Toggle size="sm" checked={mentionUsers} onChange={(v) => setDraft({ ...value, mentionUsers: v })} label="Ping utenti" />
        </SettingRow>
        <SettingRow title="Ping ruoli" description="Se attivo, le menzioni <@&ruolo> nel testo notificano i membri di quel ruolo.">
          <Toggle size="sm" checked={mentionRoles} onChange={(v) => setDraft({ ...value, mentionRoles: v })} label="Ping ruoli" />
        </SettingRow>
      </div>

      {v2.enabled ? (
        <>
          <p className="text-xs text-crema/55">
            Il nuovo formato di Discord: blocchi di testo, sezioni con miniatura o pulsante, gallerie di immagini, separatori e pulsanti, anche dentro un contenitore colorato. Al posto di testo ed embed.
          </p>
          <V2Editor value={v2} onChange={(next) => setDraft({ ...value, v2: next })} emojis={emojis} placeholders={placeholders} />
        </>
      ) : (
      <>
      <RichTextArea label="Testo del messaggio" value={value.content} onChange={(content) => setDraft({ ...value, content })} max={2000} rows={6} emojis={emojis} placeholders={placeholders} placeholder="Facoltativo se usi l'embed" />

      <div className="rounded-2xl bg-espresso/40 p-3 ring-1 ring-sand/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-crema">Embed</p>
            <p className="text-xs text-crema/55">Il riquadro colorato con titolo, testo e immagini.</p>
          </div>
          <Toggle checked={e.enabled} onChange={(enabled) => setEmbed({ enabled })} label="Usa l'embed" size="sm" />
        </div>
        {e.enabled ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Titolo">
                <input value={e.title} maxLength={256} onChange={(ev) => setEmbed({ title: ev.target.value })} className={fieldClass} />
                <input value={e.url || ""} placeholder="Link del titolo (facoltativo), https://…" onChange={(ev) => setEmbed({ url: ev.target.value })} className={cn(fieldClass, "mt-2 py-1.5 text-xs")} aria-label="Link del titolo" />
              </Field>
              <div className="min-w-0">
                <span className={cn(labelClass, "block")}>Colore</span>
                <ColorPicker value={e.color} onChange={(color) => setEmbed({ color })} className="mt-1.5 flex" />
              </div>
            </div>
            <RichTextArea label="Descrizione" value={e.description} onChange={(description) => setEmbed({ description })} max={4096} rows={8} emojis={emojis} placeholders={placeholders} />
            <FieldsEditor fields={e.fields ?? []} onChange={(fields) => setEmbed({ fields })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Autore (facoltativo)">
                <input value={e.authorName || ""} maxLength={256} placeholder="es. {username}" onChange={(ev) => setEmbed({ authorName: ev.target.value })} className={fieldClass} />
              </Field>
              <ImageUrlField label="Icona dell'autore" value={e.authorIconUrl || ""} onChange={(authorIconUrl) => setEmbed({ authorIconUrl })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUrlField label="Immagine grande" value={e.imageUrl} onChange={(imageUrl) => setEmbed({ imageUrl })} />
              <ImageUrlField label="Miniatura" value={e.thumbnailUrl} onChange={(thumbnailUrl) => setEmbed({ thumbnailUrl })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Piè di pagina">
                <input value={e.footerText} maxLength={2048} onChange={(ev) => setEmbed({ footerText: ev.target.value })} className={fieldClass} />
              </Field>
              <label className="flex items-center gap-2 pb-2.5 text-sm text-crema/80">
                <Toggle checked={e.timestamp} onChange={(timestamp) => setEmbed({ timestamp })} label="Mostra data e ora" size="sm" />
                Data e ora
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {allowButtons ? <LinkButtonsEditor buttons={value.buttons} onChange={(buttons) => setDraft({ ...value, buttons })} emojis={emojis} max={maxButtons} /> : null}
      </>
      )}
    </div>
  );
}

/* ───────────── anteprima stile Discord ───────────── */

const fillVars = (text: string, vars: Record<string, string>) => {
  let s = String(text || "");
  if (Object.prototype.hasOwnProperty.call(vars, "bonus")) {
    const bonusRaw = String(vars.bonus ?? "");
    if (!bonusRaw.trim()) {
      s = s
        .replace(/\n[ \t]*\{bonus\}[ \t]*(?=\n|$)/g, "")
        .replace(/\{bonus\}[ \t]*\n/g, "")
        .replace(/\{bonus\}/g, "");
    } else {
      const bonusBody = bonusRaw.replace(/^\n+/, "").replace(/\n+$/, "");
      s = s.replace(/\n[ \t]*\{bonus\}/g, `\n${bonusBody}`);
      s = s.replace(/\{bonus\}/g, bonusRaw);
    }
  }
  return s.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) => (k === "bonus" ? m : vars[k] ?? m));
};

export type PreviewRow =
  | { kind: "buttons"; items: { label: string; emoji?: string; style: 1 | 2 | 3 | 4 | 5 }[] }
  | { kind: "select"; placeholder: string }
  | { kind: "reactions"; emojis: string[] };

/* Misure prese da Discord (desktop): embed max 516px, miniatura 80×80, immagine max 400×300,
   testo messaggio 16/22px, embed 14/18px, titolo 16px, piè di pagina 12px, pulsanti alti 32px. */
const BTN_STYLE: Record<number, string> = {
  1: "bg-[#5865f2] text-white",
  2: "bg-[#4e5058] text-white",
  3: "bg-[#248046] text-white",
  4: "bg-[#da373c] text-white",
  5: "bg-[#4e5058] text-white",
};

/** Larghezza della chat su cui è disegnata l'anteprima: sotto, si rimpicciolisce tutta in proporzione. */
const CHAT_WIDTH = 600;

function ScaleToFit({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / width);
      setBox({ scale, height: i.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="relative w-full overflow-hidden" style={{ height: box.height || undefined }}>
      <div ref={inner} style={{ width, transform: `scale(${box.scale})`, transformOrigin: "top left" }} className="absolute left-0 top-0">
        {children}
      </div>
    </div>
  );
}

/* server e accesso per le prove di invio (li mette il pannello del server) */
export const DraftTestContext = createContext<{ guildId: string; token: string; onToast: (msg: string, err?: boolean) => void } | null>(null);

/**
 * Anteprima del messaggio + tasto "Prova".
 * Con un canale impostato chiede dove provarlo (canale o privato); senza, arriva in privato.
 */
export function DiscordMessagePreview({
  testChannelId,
  testDmOnly,
  ...props
}: React.ComponentProps<typeof DiscordMessagePreviewBody> & {
  /** canale dove il messaggio verrà mandato davvero (per la prova nel canale) */
  testChannelId?: string | null;
  /** messaggio privato: la prova va solo in privato */
  testDmOnly?: boolean;
}) {
  const ctx = useContext(DraftTestContext);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!ctx) return <DiscordMessagePreviewBody {...props} />;
  const send = async () => {
    let where: "dm" | "channel" = "dm";
    if (testChannelId && !testDmOnly) {
      const chName = (props.channels || []).find((c) => c.id === testChannelId)?.name;
      const pick = await chooseDialog({
        title: "Dove vuoi provarlo?",
        message: "Il messaggio viene mandato così com'è adesso, con i valori d'esempio.",
        choices: [
          { id: "channel", label: `Nel canale ${chName ? "#" + chName : "impostato"}` },
          { id: "dm", label: "In privato a me" },
        ],
      });
      if (!pick) return;
      where = pick === "channel" ? "channel" : "dm";
    }
    setBusy(true);
    const r = await communityApi.testMessage(ctx.token, ctx.guildId, props.draft, props.vars, where === "channel" ? testChannelId : null);
    setBusy(false);
    if (!r.ok) return ctx.onToast(r.message, true);
    setSent(true);
    window.setTimeout(() => setSent(false), 2500);
    ctx.onToast(where === "channel" ? "Prova inviata nel canale." : "Prova inviata: guarda i tuoi messaggi privati su Discord.");
  };
  return (
    <div className="space-y-2">
      <DiscordMessagePreviewBody {...props} />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:opacity-50",
            sent ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" : "bg-crema/[0.05] text-crema/80 ring-sand/15 hover:bg-crema/[0.09] hover:text-crema",
          )}
        >
          <Send className="size-3.5" aria-hidden /> {busy ? "Invio…" : sent ? "Inviata!" : "Prova"}
        </button>
      </div>
    </div>
  );
}

function DiscordMessagePreviewBody({
  draft,
  vars,
  roles = [],
  channels = [],
  rows = [],
  bot,
  className,
}: {
  draft: MsgDraft;
  vars: Record<string, string>;
  roles?: PickerRole[];
  channels?: PickerChannel[];
  rows?: PreviewRow[];
  bot?: { name: string; avatarUrl: string } | null;
  className?: string;
}) {
  const previewUserId = String(vars["user.id"] || "").trim();
  const previewUserName = String(vars.username || vars["user.name"] || "").trim() || "tu";
  const names = {
    users: previewUserId ? { [previewUserId]: previewUserName } : {},
    roles: Object.fromEntries(roles.map((r) => [r.id, r.name])),
    channels: Object.fromEntries(channels.map((c) => [c.id, c.name])),
  };
  const content = fillVars(draft.content, vars).trim();
  const e = draft.embed;
  const title = fillVars(e.title, vars).trim();
  const desc = fillVars(e.description, vars).trim();
  const footer = fillVars(e.footerText, vars).trim();
  const author = fillVars(e.authorName || "", vars).trim();
  const urlOf = (u: string) => {
    const v = fillVars(u || "", vars).trim();
    return /^https?:\/\//i.test(v) ? v : "";
  };
  const imageUrl = urlOf(e.imageUrl);
  const thumbUrl = urlOf(e.thumbnailUrl);
  const authorIcon = urlOf(e.authorIconUrl || "");
  const showEmbed = !v2Of(draft).enabled && e.enabled && (title || desc || imageUrl || thumbUrl || author || (e.fields ?? []).length);
  const v2 = v2Of(draft);
  const fields = e.fields ?? [];
  /* pulsanti link raggruppati per fila, come su Discord (in V2 stanno nei blocchi) */
  const byRow = new Map<number, typeof draft.buttons>();
  draft.buttons.forEach((b, i) => {
    const r = typeof b.row === "number" ? b.row : Math.min(4, Math.floor(i / 5));
    byRow.set(r, [...(byRow.get(r) || []), b]);
  });
  const linkRows: PreviewRow[] = v2.enabled
    ? []
    : [...byRow.keys()]
        .sort((a, b) => a - b)
        .map((r) => ({ kind: "buttons" as const, items: (byRow.get(r) || []).slice(0, 5).map((b) => ({ label: fillVars(b.label, vars), emoji: b.emoji, style: 5 as const })) }));
  const allRows = [...linkRows, ...rows];
  const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  return (
    <div translate="no" className={cn("overflow-hidden rounded-xl bg-[#313338] py-3 ring-1 ring-sand/10", className)}>
      <ScaleToFit width={CHAT_WIDTH}>
        <div className="flex gap-4 pl-4 pr-4 font-sans text-[16px] leading-[22px] text-[#dbdee1] antialiased">
          {bot?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bot.avatarUrl} alt="" className="mt-[2px] size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="mt-[2px] size-10 shrink-0 animate-pulse rounded-full bg-white/10" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center leading-[22px]">
              <span className="text-[16px] font-medium text-[#f2f3f5]">{bot?.name || "Bot"}</span>
              <span className="ml-1 inline-flex h-[15px] items-center rounded-[3px] bg-[#5865f2] px-1 text-[10px] font-semibold leading-none text-white">APP</span>
              <span className="ml-2 text-[12px] leading-[22px] text-[#949ba4]">Oggi alle {time}</span>
            </p>
            {v2.enabled ? <V2Preview v2={v2} vars={vars} names={names} fill={fillVars} /> : null}
            {!v2.enabled && content ? <DiscordContent text={content} names={names} className="whitespace-pre-line text-[16px] leading-[22px]" /> : null}

            {showEmbed ? (
              <div
                className="mt-[2px] grid w-fit max-w-[516px] rounded-[4px] border-l-4 bg-[#2b2d31] pb-4 pl-3 pr-4 pt-2"
                style={{ borderLeftColor: e.color, gridTemplateColumns: thumbUrl ? "minmax(0,1fr) auto" : "minmax(0,1fr)" }}
              >
                <div className="min-w-0">
                  {author ? (
                    <p className="mt-2 flex items-center gap-2 text-[14px] font-semibold leading-[22px] text-[#f2f3f5]">
                      {authorIcon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={authorIcon} alt="" className="size-6 rounded-full object-cover" />
                      ) : null}
                      <span className="min-w-0 break-words">{author}</span>
                    </p>
                  ) : null}
                  {title ? <DiscordContent text={title} names={names} className={cn("mt-2 text-[16px] font-semibold leading-[22px]", /^https?:\/\//i.test(e.url || "") ? "text-[#00a8fc]" : "text-[#f2f3f5]")} /> : null}
                  {desc ? <DiscordContent text={desc} names={names} className="mt-2 whitespace-pre-line text-[14px] leading-[18px] text-[#dbdee1]" /> : null}
                  <EmbedFieldsPreview fields={fields} vars={vars} names={names} fill={fillVars} />
                </div>
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl} alt="" className="ml-4 mt-2 max-h-20 max-w-20 justify-self-end rounded-[3px] object-contain" />
                ) : null}
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="col-span-full mt-4 h-auto max-h-[300px] w-auto max-w-[400px] rounded-[4px] object-contain" />
                ) : null}
                {footer || e.timestamp ? (
                  <p className="col-span-full mt-2 text-[12px] font-medium leading-4 text-[#dbdee1]">
                    {footer}
                    {footer && e.timestamp ? " • " : ""}
                    {e.timestamp ? `Oggi alle ${time}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!v2.enabled && !content && !showEmbed ? <p className="italic text-[#949ba4]">Messaggio vuoto</p> : null}

            {allRows.length ? (
              <div className="mt-1 flex flex-col gap-2 py-1">
                {allRows.map((row, i) =>
                  row.kind === "reactions" ? (
                    <div key={i} className="flex flex-wrap gap-1">
                      {row.emojis.map((em, j) => (
                        <span key={j} className="inline-flex h-6 items-center gap-1.5 rounded-[8px] border border-[#3f4147] bg-[#2b2d31] px-1.5 text-[14px] font-medium text-[#dbdee1]">
                          <EmojiGlyph value={em} className="size-4" />1
                        </span>
                      ))}
                    </div>
                  ) : row.kind === "select" ? (
                    <div key={i} className="flex h-10 w-full max-w-[400px] items-center justify-between rounded-[8px] border border-[#1e1f22] bg-[#1e1f22] px-3 text-[16px] text-[#949ba4]">
                      <span className="truncate">{row.placeholder}</span>
                      <span aria-hidden className="ml-2 text-[#b5bac1]">⌄</span>
                    </div>
                  ) : (
                    <div key={i} className="flex flex-wrap gap-2">
                      {row.items.map((b, j) => (
                        <span
                          key={j}
                          className={cn("inline-flex h-8 min-w-[60px] items-center justify-center gap-1.5 rounded-[8px] px-4 text-[14px] font-medium leading-4", BTN_STYLE[b.style])}
                        >
                          {b.emoji ? <EmojiGlyph value={b.emoji} className="size-[18px]" /> : null}
                          {b.label}
                          {b.style === 5 ? <ExternalLink className="size-4" /> : null}
                        </span>
                      ))}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
      </ScaleToFit>
    </div>
  );
}

/** "Manda anche in privato": interruttore e, se acceso, editor + anteprima del messaggio privato. */
export function DmExtra({
  value,
  onChange,
  data,
  vars,
  placeholders,
  hint = "Arriva a chi ha i messaggi privati aperti.",
  editorKey,
}: {
  value: { enabled: boolean; draft: MsgDraft } | undefined;
  onChange: (next: { enabled: boolean; draft: MsgDraft }) => void;
  data: CommunityData;
  vars: Record<string, string>;
  placeholders: { token: string; hint: string }[];
  hint?: string;
  editorKey: string;
}) {
  const v = value || { enabled: false, draft: emptyDraft({ content: "Ciao {username}!", embed: { ...emptyDraft().embed, enabled: false } }) };
  return (
    <section className={cn("rounded-2xl p-4 ring-1 transition-colors", v.enabled ? "bg-[#5865f2]/[0.07] ring-[#5865f2]/25" : "bg-espresso/40 ring-sand/10")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", v.enabled ? "bg-[#5865f2]/20 text-[#aab3ff]" : "bg-crema/[0.06] text-crema/55")}>
          <Mail className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-crema">Manda anche in privato</p>
          <p className="text-xs text-crema/55">{hint}</p>
        </div>
        <Toggle size="sm" checked={v.enabled} onChange={(enabled) => onChange({ ...v, enabled })} label="Manda anche in privato" />
      </div>
      {v.enabled ? (
        <div className="mt-4">
          <EditorWithPreview
            editor={<DraftEditor key={`dm-${editorKey}`} value={v.draft} onChange={(draft) => onChange({ ...v, draft })} emojis={data.pickers.emojis} placeholders={placeholders} maxButtons={data.limits.buttons} />}
            preview={<DiscordMessagePreview testDmOnly bot={data.bot} draft={v.draft} vars={vars} roles={data.pickers.roles} channels={data.pickers.textChannels} />}
          />
        </div>
      ) : null}
    </section>
  );
}

/** Colonne editor + anteprima fissa a destra su desktop. */
export function EditorWithPreview({ editor, preview }: { editor: React.ReactNode; preview: React.ReactNode }) {
  return (
    <div className="@container">
    <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] @5xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="min-w-0">{editor}</div>
      <div className="min-w-0 @3xl:sticky @3xl:top-20 @3xl:self-start @3xl:max-h-[calc(100dvh-6rem)] @3xl:overflow-y-auto @3xl:overscroll-contain">
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">Anteprima</p>
        {preview}
      </div>
    </div>
    </div>
  );
}

export function formatWhen(ms: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
