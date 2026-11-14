"use client";

/* Parti avanzate dell'editor messaggi: campi dell'embed, pulsanti su più file, Components V2 (editor e anteprima). */
import { ArrowDown, ArrowUp, ExternalLink, Image as ImageIcon, LayoutPanelLeft, Minus, MousePointerClick, Plus, Smile, Trash2, Type } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { ColorPicker } from "@/components/ui/color-picker";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { MsgButton, MsgDraft, MsgField, MsgV2, PickerEmoji, V2Block, V2LinkButton } from "@/lib/dashboard-community";
import { ExpandableTextarea, Field, Toggle, fieldClass, labelClass, miniBtn } from "../bits";
import { EmojiButton, EmojiGlyph, ImageUrlField, RichTextArea } from "./shared";

export const DEFAULT_V2: MsgV2 = { enabled: false, container: true, accentColor: "", blocks: [] };
export const v2Of = (d: MsgDraft): MsgV2 => d.v2 ?? DEFAULT_V2;
const MAX_BLOCKS = 30;
const ROW_OPTIONS = [0, 1, 2, 3, 4].map((r) => ({ value: String(r), label: `Fila ${r + 1}` }));

/** Passando a V2 parte da quello che c'era già (testo, titolo, descrizione, immagine, pulsanti). */
export function blocksFromClassic(d: MsgDraft): V2Block[] {
  const out: V2Block[] = [];
  const e = d.embed;
  const head = [e.enabled && e.title.trim() ? `### ${e.title.trim()}` : "", d.content.trim(), e.enabled ? e.description.trim() : ""].filter(Boolean).join("\n\n");
  if (head) {
    out.push(
      e.enabled && e.thumbnailUrl
        ? { type: "section", content: head, accessory: "thumbnail", thumbnailUrl: e.thumbnailUrl, button: { label: "", url: "", emoji: "" } }
        : { type: "text", content: head },
    );
  }
  for (const f of e.enabled ? e.fields ?? [] : []) out.push({ type: "text", content: `**${f.name}**\n${f.value}` });
  if (e.enabled && e.imageUrl) out.push({ type: "media", urls: [e.imageUrl] });
  if (e.enabled && e.footerText.trim()) out.push({ type: "separator", divider: true, spacing: "small" }, { type: "text", content: `-# ${e.footerText.trim()}` });
  const rows = new Map<number, MsgButton[]>();
  for (const b of d.buttons) rows.set(b.row ?? 0, [...(rows.get(b.row ?? 0) || []), b]);
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    out.push({ type: "buttons", buttons: (rows.get(r) || []).slice(0, 5).map((b) => ({ label: b.label, url: b.url, emoji: b.emoji })) });
  }
  return out;
}

/* ───────────── campi dell'embed ───────────── */

export function FieldsEditor({ fields, onChange }: { fields: MsgField[]; onChange: (f: MsgField[]) => void }) {
  const set = (i: number, p: Partial<MsgField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>Campi</span>
        <button type="button" className={miniBtn} disabled={fields.length >= 25} onClick={() => onChange([...fields, { name: "", value: "", inline: false }])}>
          <Plus className="size-3.5" /> Aggiungi campo
        </button>
      </div>
      {fields.length ? (
        <ul className="mt-2 space-y-2">
          {fields.map((f, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-espresso/40 p-2 ring-1 ring-sand/10">
              <div className="flex flex-wrap items-center gap-2">
                <input value={f.name} maxLength={256} placeholder="Nome del campo" onChange={(ev) => set(i, { name: ev.target.value })} className={cn(fieldClass, "mt-0 min-w-40 flex-1 py-1.5")} />
                <label className="flex items-center gap-2 text-xs text-crema/75">
                  <Toggle size="sm" checked={f.inline} onChange={(inline) => set(i, { inline })} label="Affiancato" />
                  Affiancato
                </label>
                <button type="button" aria-label="Sposta su" className={miniBtn} disabled={i === 0} onClick={() => onChange(swap(fields, i, i - 1))}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label="Sposta giù" className={miniBtn} disabled={i === fields.length - 1} onClick={() => onChange(swap(fields, i, i + 1))}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" aria-label="Togli il campo" className={miniBtn} onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <ExpandableTextarea value={f.value} maxLength={1024} rows={3} placeholder="Valore" onChange={(ev) => set(i, { value: ev.target.value })} className="min-h-[5rem]" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-crema/50">Fino a 25 campi con nome e valore. &quot;Affiancato&quot; li mette uno accanto all&apos;altro (fino a 3 per riga).</p>
      )}
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* ───────────── pulsanti link con fila ───────────── */

export function LinkButtonsEditor({
  buttons,
  onChange,
  emojis,
  max,
  withRows = true,
}: {
  buttons: (MsgButton | V2LinkButton)[];
  onChange: (b: MsgButton[]) => void;
  emojis: PickerEmoji[];
  max: number;
  withRows?: boolean;
}) {
  const list = buttons.map((b, i) => ({ ...b, row: "row" in b && typeof b.row === "number" ? b.row : Math.min(4, Math.floor(i / 5)) })) as MsgButton[];
  const set = (i: number, p: Partial<MsgButton>) => onChange(list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const perRow = (r: number) => list.filter((b) => b.row === r).length;
  const firstFreeRow = [0, 1, 2, 3, 4].find((r) => perRow(r) < 5) ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={labelClass}>Pulsanti link</span>
        <button
          type="button"
          className={miniBtn}
          disabled={list.length >= max}
          onClick={() => {
            /* il nuovo pulsante va nella fila dell'ultimo, o nella prima libera se quella è piena */
            const lastRow = list.length ? (list[list.length - 1].row ?? 0) : 0;
            const row = !withRows ? 0 : perRow(lastRow) < 5 ? lastRow : firstFreeRow;
            onChange([...list, { label: "", url: "", emoji: "", row }]);
          }}
        >
          <Plus className="size-3.5" /> Aggiungi
        </button>
      </div>
      {list.length ? (
        <ul className="mt-2 space-y-2">
          {list.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-espresso/40 p-2 ring-1 ring-sand/10">
              <EmojiButton emojis={emojis} onPick={(emoji) => set(i, { emoji })} label="Emoji del pulsante">
                {b.emoji ? <EmojiGlyph value={b.emoji} /> : <Smile className="size-3.5" />}
              </EmojiButton>
              <input value={b.label} maxLength={80} placeholder="Testo" onChange={(ev) => set(i, { label: ev.target.value })} className={cn(fieldClass, "mt-0 w-36 flex-1 py-1.5")} />
              <input value={b.url} placeholder="https://…" onChange={(ev) => set(i, { url: ev.target.value })} className={cn(fieldClass, "mt-0 min-w-40 flex-[2] py-1.5")} />
              {withRows ? (
                <div className="w-24">
                  <Select
                    size="sm"
                    value={String(b.row)}
                    onChange={(v) => {
                      const r = Number(v);
                      if (r !== b.row && perRow(r) >= 5) return;
                      set(i, { row: r });
                    }}
                    options={ROW_OPTIONS.map((o) => ({ ...o, label: perRow(Number(o.value)) >= 5 && Number(o.value) !== b.row ? `${o.label} (piena)` : o.label }))}
                    aria-label="Fila del pulsante"
                  />
                </div>
              ) : null}
              <button type="button" aria-label="Togli il pulsante" className={miniBtn} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-crema/50">Fino a {max} pulsanti che aprono un link{withRows ? ", su 5 file da 5 pulsanti: scegli tu in quale fila va ognuno" : ""}.</p>
      )}
    </div>
  );
}

/* ───────────── Components V2: editor ───────────── */

const BLOCK_LABEL: Record<V2Block["type"], string> = {
  text: "Testo",
  section: "Sezione con miniatura o pulsante",
  media: "Immagini",
  separator: "Separatore",
  buttons: "Fila di pulsanti",
};

export function V2Editor({
  value,
  onChange,
  emojis,
  placeholders,
}: {
  value: MsgV2;
  onChange: (v: MsgV2) => void;
  emojis: PickerEmoji[];
  placeholders?: { token: string; hint: string }[];
}) {
  const blocks = value.blocks;
  const setBlocks = (b: V2Block[]) => onChange({ ...value, blocks: b });
  const setBlock = (i: number, b: V2Block) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
  const add = (b: V2Block) => setBlocks([...blocks, b]);
  const full = blocks.length >= MAX_BLOCKS;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-espresso/40 p-3 ring-1 ring-sand/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5 text-crema">Contenitore</p>
            <p className="mt-0.5 text-xs text-crema/55">Racchiude i blocchi in un riquadro, con una striscia colorata a sinistra se vuoi.</p>
          </div>
          <div className="flex min-h-5 shrink-0 items-center">
            <Toggle size="sm" checked={value.container} onChange={(container) => onChange({ ...value, container })} label="Usa il contenitore" />
          </div>
        </div>
        {value.container ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-crema/80">
              <Toggle size="sm" checked={Boolean(value.accentColor)} onChange={(on) => onChange({ ...value, accentColor: on ? "#d49150" : "" })} label="Colore laterale" />
              Colore laterale
            </label>
            {value.accentColor ? <ColorPicker value={value.accentColor} onChange={(accentColor) => onChange({ ...value, accentColor })} className="flex" /> : null}
          </div>
        ) : null}
      </div>

      {blocks.length ? (
        <ol className="space-y-2">
          {blocks.map((b, i) => (
            <li key={i} className="rounded-2xl bg-espresso/40 p-3 ring-1 ring-sand/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-crema/55">
                  {i + 1}. {BLOCK_LABEL[b.type]}
                </span>
                <span className="flex-1" />
                <button type="button" aria-label="Sposta su" className={miniBtn} disabled={i === 0} onClick={() => setBlocks(swap(blocks, i, i - 1))}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label="Sposta giù" className={miniBtn} disabled={i === blocks.length - 1} onClick={() => setBlocks(swap(blocks, i, i + 1))}>
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" aria-label="Togli il blocco" className={miniBtn} onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {b.type === "text" ? (
                <RichTextArea label="Testo" value={b.content} onChange={(content) => setBlock(i, { ...b, content })} max={4000} rows={7} emojis={emojis} placeholders={placeholders} placeholder="Markdown: # titoli, **grassetto**, -# testo piccolo…" />
              ) : b.type === "section" ? (
                <div className="space-y-3">
                  <RichTextArea label="Testo" value={b.content} onChange={(content) => setBlock(i, { ...b, content })} max={4000} rows={6} emojis={emojis} placeholders={placeholders} />
                  <Field label="Accanto al testo">
                    <Select
                      value={b.accessory}
                      onChange={(v) => setBlock(i, { ...b, accessory: v as "thumbnail" | "button" })}
                      options={[
                        { value: "thumbnail", label: "Miniatura" },
                        { value: "button", label: "Pulsante link" },
                      ]}
                      className="mt-1.5 h-11 rounded-lg"
                    />
                  </Field>
                  {b.accessory === "thumbnail" ? (
                    <ImageUrlField label="Miniatura" value={b.thumbnailUrl} onChange={(thumbnailUrl) => setBlock(i, { ...b, thumbnailUrl })} />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <EmojiButton emojis={emojis} onPick={(emoji) => setBlock(i, { ...b, button: { ...b.button, emoji } })} label="Emoji del pulsante">
                        {b.button.emoji ? <EmojiGlyph value={b.button.emoji} /> : <Smile className="size-3.5" />}
                      </EmojiButton>
                      <input value={b.button.label} maxLength={80} placeholder="Testo" onChange={(ev) => setBlock(i, { ...b, button: { ...b.button, label: ev.target.value } })} className={cn(fieldClass, "mt-0 w-36 flex-1 py-1.5")} />
                      <input value={b.button.url} placeholder="https://…" onChange={(ev) => setBlock(i, { ...b, button: { ...b.button, url: ev.target.value } })} className={cn(fieldClass, "mt-0 min-w-40 flex-[2] py-1.5")} />
                    </div>
                  )}
                </div>
              ) : b.type === "media" ? (
                <div className="space-y-2">
                  {b.urls.map((u, j) => (
                    <div key={j} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <ImageUrlField label={`Immagine ${j + 1}`} value={u} onChange={(url) => setBlock(i, { ...b, urls: b.urls.map((x, k) => (k === j ? url : x)) })} />
                      </div>
                      <button type="button" aria-label="Togli l'immagine" className={cn(miniBtn, "mb-1.5")} onClick={() => setBlock(i, { ...b, urls: b.urls.filter((_, k) => k !== j) })}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className={miniBtn} disabled={b.urls.length >= 10} onClick={() => setBlock(i, { ...b, urls: [...b.urls, ""] })}>
                    <Plus className="size-3.5" /> Aggiungi immagine
                  </button>
                </div>
              ) : b.type === "separator" ? (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-crema/80">
                    <Toggle size="sm" checked={b.divider} onChange={(divider) => setBlock(i, { ...b, divider })} label="Mostra la linea" />
                    Linea visibile
                  </label>
                  <div className="w-40">
                    <Select
                      size="sm"
                      value={b.spacing}
                      onChange={(v) => setBlock(i, { ...b, spacing: v as "small" | "large" })}
                      options={[
                        { value: "small", label: "Spazio piccolo" },
                        { value: "large", label: "Spazio grande" },
                      ]}
                      aria-label="Spazio"
                    />
                  </div>
                </div>
              ) : (
                <LinkButtonsEditor buttons={b.buttons} onChange={(bt) => setBlock(i, { ...b, buttons: bt.map(({ label, url, emoji }) => ({ label, url, emoji })) })} emojis={emojis} max={5} withRows={false} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl bg-espresso/40 p-3 text-sm text-crema/60 ring-1 ring-sand/10">Aggiungi il primo blocco: testo, sezione, immagini, separatore o pulsanti.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={miniBtn} disabled={full} onClick={() => add({ type: "text", content: "" })}>
          <Type className="size-3.5" /> Testo
        </button>
        <button type="button" className={miniBtn} disabled={full} onClick={() => add({ type: "section", content: "", accessory: "thumbnail", thumbnailUrl: "", button: { label: "", url: "", emoji: "" } })}>
          <LayoutPanelLeft className="size-3.5" /> Sezione
        </button>
        <button type="button" className={miniBtn} disabled={full} onClick={() => add({ type: "media", urls: [""] })}>
          <ImageIcon className="size-3.5" /> Immagini
        </button>
        <button type="button" className={miniBtn} disabled={full} onClick={() => add({ type: "separator", divider: true, spacing: "small" })}>
          <Minus className="size-3.5" /> Separatore
        </button>
        <button type="button" className={miniBtn} disabled={full} onClick={() => add({ type: "buttons", buttons: [{ label: "", url: "", emoji: "" }] })}>
          <MousePointerClick className="size-3.5" /> Pulsanti
        </button>
      </div>
    </div>
  );
}

/* ───────────── anteprima ───────────── */

type Names = { roles: Record<string, string>; channels: Record<string, string> };

export function EmbedFieldsPreview({ fields, vars, names, fill }: { fields: MsgField[]; vars: Record<string, string>; names: Names; fill: (s: string, v: Record<string, string>) => string }) {
  if (!fields.length) return null;
  /* come Discord: i campi affiancati stanno fino a 3 per riga, quelli normali occupano tutta la riga */
  const rows: MsgField[][] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if (f.inline && last && last.length < 3 && last.every((x) => x.inline)) last.push(f);
    else rows.push([f]);
  }
  return (
    <div className="mt-2 grid gap-2">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row[0].inline ? row.length : 1}, minmax(0,1fr))` }}>
          {row.map((f, j) => (
            <div key={j} className="min-w-0 text-[14px] leading-[18px]">
              <DiscordContent text={fill(f.name, vars) || "​"} names={names} className="font-semibold text-[#f2f3f5]" />
              <DiscordContent text={fill(f.value, vars) || "​"} names={names} className="whitespace-pre-line text-[#dbdee1]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PreviewLinkButton({ b, fill, vars }: { b: V2LinkButton; fill: (s: string, v: Record<string, string>) => string; vars: Record<string, string> }) {
  return (
    <span className="inline-flex h-8 min-w-[60px] items-center justify-center gap-1.5 rounded-[8px] bg-[#4e5058] px-4 text-[14px] font-medium leading-4 text-white">
      {b.emoji ? <EmojiGlyph value={b.emoji} className="size-[18px]" /> : null}
      {fill(b.label, vars)}
      <ExternalLink className="size-4" />
    </span>
  );
}

export function V2Preview({ v2, vars, names, fill }: { v2: MsgV2; vars: Record<string, string>; names: Names; fill: (s: string, v: Record<string, string>) => string }) {
  const urlOf = (u: string) => {
    const v = fill(u || "", vars).trim();
    /* blob: = immagini d'esempio generate per l'anteprima (es. la quote del server) */
    return /^(https?:\/\/|blob:)/i.test(v) ? v : "";
  };
  const body = (
    <div className="flex flex-col gap-2">
      {v2.blocks.length ? null : <p className="italic text-[#949ba4]">Messaggio vuoto</p>}
      {v2.blocks.map((b, i) => {
        if (b.type === "text") return b.content.trim() ? <DiscordContent key={i} text={fill(b.content, vars)} names={names} className="whitespace-pre-line text-[16px] leading-[22px]" /> : null;
        if (b.type === "section") {
          const thumb = b.accessory === "thumbnail" ? urlOf(b.thumbnailUrl) : "";
          return (
            <div key={i} className="flex items-start gap-3">
              <DiscordContent text={fill(b.content, vars) || "​"} names={names} className="min-w-0 flex-1 whitespace-pre-line text-[16px] leading-[22px]" />
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-[85px] shrink-0 rounded-[8px] object-cover" />
              ) : b.accessory === "button" && b.button.url ? (
                <PreviewLinkButton b={b.button} fill={fill} vars={vars} />
              ) : null}
            </div>
          );
        }
        if (b.type === "media") {
          const urls = b.urls.map(urlOf).filter(Boolean);
          if (!urls.length) return null;
          return (
            <div key={i} className={cn("grid gap-1 overflow-hidden rounded-[8px]", urls.length === 1 ? "grid-cols-1" : urls.length === 2 || urls.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
              {urls.map((u, j) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={j} src={u} alt="" className={cn("w-full object-cover", urls.length === 1 ? "max-h-[350px]" : "aspect-square")} />
              ))}
            </div>
          );
        }
        if (b.type === "separator") return <div key={i} className={b.spacing === "large" ? "py-3" : "py-1"}>{b.divider ? <div className="h-px bg-[#3f4147]" /> : null}</div>;
        return b.buttons.length ? (
          <div key={i} className="flex flex-wrap gap-2">
            {b.buttons.map((x, j) => (
              <PreviewLinkButton key={j} b={x} fill={fill} vars={vars} />
            ))}
          </div>
        ) : null;
      })}
    </div>
  );
  if (!v2.container) return <div className="mt-[2px]">{body}</div>;
  return (
    <div className="mt-[2px] max-w-[516px] rounded-[8px] border border-[#3f4147] bg-[#2b2d31] p-4" style={v2.accentColor ? { borderLeft: `4px solid ${v2.accentColor}` } : undefined}>
      {body}
    </div>
  );
}
