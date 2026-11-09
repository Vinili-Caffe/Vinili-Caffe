"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, Smile, Trash2 } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { ColorPicker } from "@/components/ui/color-picker";
import { toggleEmojiPicker, customEmojiUrl, type EmojiPick } from "@/components/ui/emoji-picker";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { loadCommunity, type CommunityData, type MsgDraft, type PickerChannel, type PickerEmoji, type PickerRole } from "@/lib/dashboard-community";
import { Field, Toggle, fieldClass, labelClass, miniBtn } from "../bits";

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
];

export function sampleVars(data: CommunityData | null, extra: Record<string, string> = {}) {
  return {
    user: "@Mario",
    username: "Mario",
    "user.name": "mario",
    "user.id": "123456789012345678",
    server: data?.guild.name || "Il tuo server",
    membercount: String(data?.guild.memberCount ?? 128),
    channel: "#generale",
    args: "",
    ...extra,
  } as Record<string, string>;
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
          guildEmojis: emojis.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: e.url })),
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
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClass, "resize-y leading-relaxed")}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <EmojiButton emojis={emojis} onPick={(t) => onChange(insertAt(ref.current, value, t, max))} />
        {placeholders?.length ? <PlaceholderChips items={placeholders} onInsert={(t) => onChange(insertAt(ref.current, value, t, max))} /> : null}
      </div>
    </div>
  );
}

/* ───────────── editor messaggio ───────────── */

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
  const setEmbed = (p: Partial<MsgDraft["embed"]>) => onChange({ ...value, embed: { ...e, ...p } });
  const setBtn = (i: number, p: Partial<MsgDraft["buttons"][number]>) =>
    onChange({ ...value, buttons: value.buttons.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  return (
    <div className="space-y-4">
      <RichTextArea label="Testo del messaggio" value={value.content} onChange={(content) => onChange({ ...value, content })} max={2000} rows={3} emojis={emojis} placeholders={placeholders} placeholder="Facoltativo se usi l'embed" />

      <div className="rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/10">
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
              </Field>
              <div className="min-w-0">
                <span className={cn(labelClass, "block")}>Colore</span>
                <ColorPicker value={e.color} onChange={(color) => setEmbed({ color })} className="mt-1.5 flex" />
              </div>
            </div>
            <RichTextArea label="Descrizione" value={e.description} onChange={(description) => setEmbed({ description })} max={4096} rows={5} emojis={emojis} placeholders={placeholders} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Immagine grande (link)">
                <input value={e.imageUrl} onChange={(ev) => setEmbed({ imageUrl: ev.target.value })} placeholder="https://…" className={fieldClass} />
              </Field>
              <Field label="Miniatura (link)">
                <input value={e.thumbnailUrl} onChange={(ev) => setEmbed({ thumbnailUrl: ev.target.value })} placeholder="https://…" className={fieldClass} />
              </Field>
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

      {allowButtons ? (
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className={labelClass}>Pulsanti link</span>
            <button
              type="button"
              className={miniBtn}
              disabled={value.buttons.length >= maxButtons}
              onClick={() => onChange({ ...value, buttons: [...value.buttons, { label: "", url: "", emoji: "" }] })}
            >
              <Plus className="size-3.5" /> Aggiungi
            </button>
          </div>
          {value.buttons.length ? (
            <ul className="mt-2 space-y-2">
              {value.buttons.map((b, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-espresso/40 p-2 ring-1 ring-sand/10">
                  <EmojiButton emojis={emojis} onPick={(emoji) => setBtn(i, { emoji })} label="Emoji del pulsante">
                    {b.emoji ? <EmojiGlyph value={b.emoji} /> : <Smile className="size-3.5" />}
                  </EmojiButton>
                  <input value={b.label} maxLength={80} placeholder="Testo" onChange={(ev) => setBtn(i, { label: ev.target.value })} className={cn(fieldClass, "mt-0 w-36 flex-1 py-1.5")} />
                  <input value={b.url} placeholder="https://…" onChange={(ev) => setBtn(i, { url: ev.target.value })} className={cn(fieldClass, "mt-0 min-w-40 flex-[2] py-1.5")} />
                  <button type="button" aria-label="Togli il pulsante" className={miniBtn} onClick={() => onChange({ ...value, buttons: value.buttons.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-crema/50">Fino a {maxButtons} pulsanti che aprono un link.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────── anteprima stile Discord ───────────── */

const fillVars = (s: string, vars: Record<string, string>) => s.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) => vars[k] ?? m);

export type PreviewRow =
  | { kind: "buttons"; items: { label: string; emoji?: string; style: 1 | 2 | 3 | 4 | 5 }[] }
  | { kind: "select"; placeholder: string };

const BTN_STYLE: Record<number, string> = {
  1: "bg-[#5865f2] text-white",
  2: "bg-[#4e5058] text-white",
  3: "bg-[#248046] text-white",
  4: "bg-[#da373c] text-white",
  5: "bg-[#4e5058] text-white",
};

export function DiscordMessagePreview({
  draft,
  vars,
  roles = [],
  channels = [],
  rows = [],
  botName = "Vinili & Caffè",
  className,
}: {
  draft: MsgDraft;
  vars: Record<string, string>;
  roles?: PickerRole[];
  channels?: PickerChannel[];
  rows?: PreviewRow[];
  botName?: string;
  className?: string;
}) {
  const names = {
    roles: Object.fromEntries(roles.map((r) => [r.id, r.name])),
    channels: Object.fromEntries(channels.map((c) => [c.id, c.name])),
  };
  const content = fillVars(draft.content, vars).trim();
  const e = draft.embed;
  const title = fillVars(e.title, vars).trim();
  const desc = fillVars(e.description, vars).trim();
  const footer = fillVars(e.footerText, vars).trim();
  const showEmbed = e.enabled && (title || desc || e.imageUrl || e.thumbnailUrl);
  const linkRow: PreviewRow | null = draft.buttons.length
    ? { kind: "buttons", items: draft.buttons.map((b) => ({ label: fillVars(b.label, vars), emoji: b.emoji, style: 5 as const })) }
    : null;
  const allRows = [...(linkRow ? [linkRow] : []), ...rows];
  return (
    <div className={cn("rounded-xl bg-[#313338] p-3 ring-1 ring-sand/10", className)}>
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-caramel to-ember text-xs font-bold text-ink">VC</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-white">{botName}</span>
            <span className="ml-1.5 rounded bg-[#5865f2] px-1 py-px align-[1px] text-[0.6rem] font-semibold text-white">APP</span>
            <span className="ml-1.5 text-[0.7rem] text-[#949ba4]">Oggi</span>
          </p>
          {content ? <DiscordContent text={content} names={names} className="mt-0.5 text-sm leading-relaxed text-[#dbdee1]" /> : null}
          {showEmbed ? (
            <div className="mt-1.5 flex max-w-[32rem] overflow-hidden rounded bg-[#2b2d31]">
              <span className="w-1 shrink-0" style={{ background: e.color }} aria-hidden />
              <div className="min-w-0 flex-1 p-3">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {title ? <DiscordContent text={title} names={names} className="text-[0.95rem] font-semibold text-white" /> : null}
                    {desc ? <DiscordContent text={desc} names={names} className="text-sm leading-relaxed text-[#dbdee1]" /> : null}
                  </div>
                  {e.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumbnailUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                  ) : null}
                </div>
                {e.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.imageUrl} alt="" className="mt-2 max-h-64 w-full rounded object-cover" />
                ) : null}
                {footer || e.timestamp ? (
                  <p className="mt-2 text-[0.72rem] text-[#949ba4]">
                    {footer}
                    {footer && e.timestamp ? " • " : ""}
                    {e.timestamp ? "Oggi alle " + new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {!content && !showEmbed ? <p className="mt-0.5 text-sm italic text-[#949ba4]">Messaggio vuoto</p> : null}
          {allRows.map((row, i) =>
            row.kind === "select" ? (
              <div key={i} className="mt-1.5 flex max-w-[24rem] items-center justify-between rounded bg-[#1e1f22] px-3 py-2 text-sm text-[#949ba4]">
                {row.placeholder}
                <span aria-hidden>▾</span>
              </div>
            ) : (
              <div key={i} className="mt-1.5 flex flex-wrap gap-1.5">
                {row.items.map((b, j) => (
                  <span key={j} className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium", BTN_STYLE[b.style])}>
                    {b.emoji ? <EmojiGlyph value={b.emoji} /> : null}
                    {b.label}
                    {b.style === 5 ? <ExternalLink className="size-3.5 opacity-80" /> : null}
                  </span>
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Colonne editor + anteprima fissa a destra su desktop. */
export function EditorWithPreview({ editor, preview }: { editor: React.ReactNode; preview: React.ReactNode }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0">{editor}</div>
      <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">Anteprima</p>
        {preview}
      </div>
    </div>
  );
}

export function formatWhen(ms: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
