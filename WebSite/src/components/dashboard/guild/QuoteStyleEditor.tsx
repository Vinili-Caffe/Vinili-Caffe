"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { defaultQuoteStyle, previewGuildQuoteStyle, type QuoteStyle } from "@/lib/dashboard-guild";
import { ColorPicker } from "@/components/ui/color-picker";
import { Range } from "@/components/ui/Range";
import { Field, PremiumLock, Toggle, TrackUnsaved, fieldClass } from "./bits";

const BG_PRESETS: { value: string; label: string; swatch: string }[] = [
  { value: "black", label: "Nero", swatch: "#070707" },
  { value: "charcoal", label: "Antracite", swatch: "#1a1a1a" },
  { value: "navy", label: "Navy", swatch: "#0b1220" },
  { value: "wine", label: "Wine", swatch: "#1a0a0e" },
  { value: "forest", label: "Forest", swatch: "#0a1410" },
  { value: "white", label: "Bianco", swatch: "#f4f4f4" },
  { value: "cream", label: "Cream", swatch: "#f7ecdf" },
  { value: "custom", label: "Custom", swatch: "conic-gradient(from 180deg, #f43f5e, #eab308, #22c55e, #3b82f6, #f43f5e)" },
];

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
  { value: "display", label: "Display (Fraktur)" },
  { value: "arial", label: "Arial" },
  { value: "verdana", label: "Verdana" },
  { value: "trebuchet", label: "Trebuchet" },
  { value: "tahoma", label: "Tahoma" },
  { value: "helvetica", label: "Helvetica" },
  { value: "roboto", label: "Roboto" },
  { value: "opensans", label: "Open Sans" },
  { value: "lato", label: "Lato" },
  { value: "montserrat", label: "Montserrat" },
  { value: "poppins", label: "Poppins" },
  { value: "nunito", label: "Nunito" },
  { value: "rubik", label: "Rubik" },
  { value: "ubuntu", label: "Ubuntu" },
  { value: "inter", label: "Inter" },
  { value: "georgia", label: "Georgia" },
  { value: "times", label: "Times" },
  { value: "playfair", label: "Playfair" },
  { value: "merriweather", label: "Merriweather" },
  { value: "crimson", label: "Crimson Text" },
  { value: "libre", label: "Libre Baskerville" },
  { value: "courier", label: "Courier" },
  { value: "sourcecode", label: "Source Code" },
  { value: "impact", label: "Impact" },
  { value: "oswald", label: "Oswald" },
  { value: "bebas", label: "Bebas Neue" },
  { value: "anton", label: "Anton" },
  { value: "comic", label: "Comic" },
  { value: "pacifico", label: "Pacifico" },
  { value: "dancing", label: "Dancing Script" },
  { value: "greatvibes", label: "Great Vibes" },
  { value: "script", label: "Dancing Script (script)" },
  { value: "exo2", label: "Exo 2" },
  { value: "inconsolata", label: "Inconsolata" },
  { value: "mplus", label: "M PLUS Rounded" },
  { value: "dela", label: "Dela Gothic One" },
  { value: "dot", label: "DotGothic16" },
  { value: "pop", label: "Hachi Maru Pop" },
  { value: "rampart", label: "Rampart One" },
  { value: "reggae", label: "Reggae One" },
  { value: "rocknroll", label: "RocknRoll One" },
  { value: "yuji", label: "Yuji Syuku" },
  { value: "yusei", label: "Yusei Magic" },
  { value: "jiyu", label: "Jiyu no Tsubasa" },
  { value: "shippori", label: "Shippori Mincho" },
  { value: "bruno", label: "Bruno Ace SC" },
  { value: "castoro", label: "Castoro Titling" },
  { value: "poltawski", label: "Poltawski Nowy" },
  { value: "vina", label: "Vina Sans" },
];

function ColorInput({
  value,
  disabled,
  onChange,
  label,
  allowEmpty,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (next: string | null) => void;
  label: string;
  allowEmpty?: boolean;
}) {
  return (
    <ColorPicker
      value={value ?? ""}
      defaultHex="#070707"
      allowEmpty={allowEmpty}
      placeholder={allowEmpty ? "auto" : "#070707"}
      ariaLabel={label}
      disabled={disabled}
      onChange={(hex) => onChange(hex ? hex : allowEmpty ? null : "#070707")}
      className="mt-1.5 flex w-full [&>input]:w-0 [&>input]:min-w-0 [&>input]:flex-1"
    />
  );
}

export function QuoteStyleEditor({
  guildId,
  token,
  value,
  disabled,
  locked,
  saving,
  onSave,
}: {
  guildId: string;
  token: string;
  value: QuoteStyle;
  disabled?: boolean;
  locked?: boolean;
  saving?: boolean;
  onSave: (next: QuoteStyle) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<QuoteStyle>(value);
  const [dirty, setDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  useEffect(() => {
    if (!guildId || !token || locked) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewFailed(false);
      void previewGuildQuoteStyle(token, guildId, draft, ac.signal).then((url) => {
        if (ac.signal.aborted) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewFailed(!url);
        setPreviewLoading(false);
      });
    }, 420);
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [draft, guildId, token, locked]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const patch = (partial: Partial<QuoteStyle>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const fontOptions = useMemo(() => {
    if (FONT_OPTIONS.some((o) => o.value === draft.font)) return FONT_OPTIONS;
    return [{ value: draft.font, label: draft.font }, ...FONT_OPTIONS];
  }, [draft.font]);

  const busy = Boolean(disabled || locked || saving);

  return (
    <div className={cn("space-y-4", disabled && "opacity-50")}>
      <TrackUnsaved
        dirty={dirty}
        onSave={async () => {
          const ok = await onSave(draft);
          if (ok) setDirty(false);
        }}
        onReset={() => {
          setDraft(value);
          setDirty(false);
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-crema">Stile quote</p>
          <p className="mt-0.5 text-xs text-crema/60">
            Anteprima dal canvas reale di <code className="text-crema/55">+quote</code> (stesso render del bot).
          </p>
        </div>
        {locked ? <Lock className="size-3.5 text-crema/50" aria-label="Richiede premium" /> : null}
      </div>

      {locked ? <PremiumLock feature="Lo stile delle quote" note="Senza Premium le quote usano lo stile base. Con Premium scegli colori, font e impaginazione." /> : null}

      <div className="relative overflow-hidden rounded-xl bg-espresso/80 ring-1 ring-sand/15">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Anteprima quote" className="mx-auto max-h-[320px] w-full object-contain" />
        ) : (
          <div className="flex min-h-[160px] items-center justify-center px-4 py-8 text-sm text-crema/60">
            {previewLoading ? "Generazione anteprima…" : previewFailed ? "Anteprima non disponibile." : "Anteprima quote"}
          </div>
        )}
        {previewLoading && previewUrl ? (
          <div className="pointer-events-none absolute inset-0 bg-ink/25 backdrop-blur-[1px]" aria-hidden />
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-crema/70">Sfondo</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {BG_PRESETS.map((p) => {
            const on = draft.bg === p.value;
            return (
              <button
                key={p.value}
                type="button"
                disabled={busy}
                title={p.label}
                aria-label={p.label}
                aria-pressed={on}
                onClick={() => patch({ bg: p.value, bgColor: p.value === "custom" ? draft.bgColor || "#070707" : null })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-1.5 ring-1 transition",
                  on ? "bg-caramel/15 ring-caramel/40" : "ring-sand/10 hover:ring-sand/25",
                  busy && "cursor-not-allowed",
                )}
              >
                <span className="size-7 rounded-md ring-1 ring-black/30" style={{ background: p.swatch }} />
                <span className="truncate text-[0.6rem] text-crema/55">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {draft.bg === "custom" ? (
        <Field label="Colore sfondo custom">
          <ColorInput value={draft.bgColor} disabled={busy} label="Colore sfondo" onChange={(next) => patch({ bgColor: next })} />
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Colore testo (vuoto = auto)">
          <ColorInput
            value={draft.fgColor}
            disabled={busy}
            allowEmpty
            label="Colore testo"
            onChange={(next) => patch({ fgColor: next })}
          />
        </Field>
        <Field label="Font">
          <Select
            value={draft.font}
            disabled={busy}
            onChange={(next) => patch({ font: next })}
            className={fieldClass}
            options={fontOptions}
            searchable
            searchPlaceholder="Cerca un font…"
          />
        </Field>
        <Field label="Orientamento">
          <Select
            value={draft.orientation}
            disabled={busy}
            onChange={(next) => patch({ orientation: next === "vertical" ? "vertical" : "horizontal" })}
            className={fieldClass}
            options={[
              { value: "horizontal", label: "Orizzontale" },
              { value: "vertical", label: "Verticale" },
            ]}
          />
        </Field>
        <Field label="Avatar">
          <Select
            value={draft.avatarMode}
            disabled={busy}
            onChange={(next) => patch({ avatarMode: next === "static" ? "static" : "dynamic" })}
            className={fieldClass}
            options={[
              { value: "dynamic", label: "Dinamico (GIF se disponibile)" },
              { value: "static", label: "Statico (PNG)" },
            ]}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-espresso/55 p-3 ring-1 ring-sand/10">
          <div>
            <p className="text-sm font-semibold text-crema">Grassetto</p>
            <p className="mt-0.5 text-xs text-crema/60">Testo in bold.</p>
          </div>
          <Toggle checked={draft.bold} disabled={busy} label="Grassetto" onChange={(next) => patch({ bold: next })} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-espresso/55 p-3 ring-1 ring-sand/10">
          <div>
            <p className="text-sm font-semibold text-crema">Specchio</p>
            <p className="mt-0.5 text-xs text-crema/60">Inverte il layout orizzontale.</p>
          </div>
          <Toggle checked={draft.flip} disabled={busy} label="Specchio" onChange={(next) => patch({ flip: next })} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gradiente sfondo (opzionale)">
          <ColorInput
            value={draft.bgGradTo}
            disabled={busy}
            allowEmpty
            label="Gradiente sfondo"
            onChange={(next) => patch({ bgGradTo: next })}
          />
        </Field>
        <Field label={`Angolo gradiente sfondo (${draft.bgGradAngle}°)`}>
          <Range
            aria-label="Angolo gradiente sfondo"
            min={0}
            max={359}
            value={draft.bgGradAngle}
            disabled={busy || !draft.bgGradTo}
            onChange={(v) => patch({ bgGradAngle: v })}
            className="mt-3"
            />
        </Field>
        <Field label={`Fade profondità (${draft.fadeDepth}%)`}>
          <Range
            aria-label="Fade profondità"
            min={0}
            max={100}
            value={draft.fadeDepth}
            disabled={busy}
            onChange={(v) => patch({ fadeDepth: v })}
            className="mt-3"
            />
        </Field>
        <Field label={`Fade opacità (${draft.fadeOpacity}%)`}>
          <Range
            aria-label="Fade opacità"
            min={0}
            max={100}
            value={draft.fadeOpacity}
            disabled={busy}
            onChange={(v) => patch({ fadeOpacity: v })}
            className="mt-3"
            />
        </Field>
      </div>

      <Field label="Footer">
        <input
          type="text"
          value={draft.footer}
          disabled={busy}
          maxLength={80}
          onChange={(e) => patch({ footer: e.target.value })}
          className={fieldClass}
          placeholder="discord.gg/viniliecaffe"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const next = defaultQuoteStyle();
            setDraft(next);
            const ok = await onSave(next);
            if (ok) setDirty(false);
          }}
          className="rounded-lg bg-espresso/70 px-3.5 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/15 disabled:opacity-45"
        >
          Ripristina default
        </button>
      </div>
    </div>
  );
}
