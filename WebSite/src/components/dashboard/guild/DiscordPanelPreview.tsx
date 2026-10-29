"use client";

import { cn } from "@/lib/cn";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { EmojiText } from "@/components/discord/EmojiText";

const STYLE_BG: Record<string, string> = {
  Primary: "bg-[#5865f2]",
  Secondary: "bg-[#4e5058]",
  Success: "bg-[#248046]",
  Danger: "bg-[#da373c]",
};

type Field = { name?: string; value?: string; inline?: boolean };

/** Anteprima locale stile Discord (nessuna API): embed + bottone/menu. */
export function DiscordPanelPreview({
  title,
  description,
  color = "#6F4E37",
  buttonText,
  buttonStyle = "Primary",
  buttonEmoji,
  fields,
  footer,
  mode = "button",
  options,
  className,
}: {
  title?: string | null;
  description?: string | null;
  color?: string | null;
  buttonText?: string | null;
  buttonStyle?: string | null;
  buttonEmoji?: string | null;
  fields?: Field[] | null;
  footer?: string | null;
  mode?: "button" | "dropdown";
  options?: { label: string; description?: string }[];
  className?: string;
}) {
  const bar = /^#[0-9a-fA-F]{6}$/.test(String(color || "")) ? String(color) : "#6F4E37";
  const btnClass = STYLE_BG[buttonStyle || ""] || STYLE_BG.Primary;
  const emoji = String(buttonEmoji || "").trim();
  const emojiLooksCustom = /^<a?:\w+:\d+>$/.test(emoji);

  return (
    <div className={cn("rounded-xl bg-[#313338] p-3 ring-1 ring-white/10", className)}>
      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/40">
        Anteprima Discord
      </p>
      <div className="flex gap-0 overflow-hidden rounded-lg bg-[#2b2d31]">
        <span className="w-1 shrink-0 self-stretch" style={{ background: bar }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          {title ? <p className="font-semibold text-white">{title}</p> : null}
          {description ? (
            <DiscordContent text={description} className="text-sm leading-relaxed text-[#dbdee1]" />
          ) : null}
          {fields && fields.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {fields.map((f, i) => (
                <div key={i} className={f.inline === false ? "sm:col-span-2" : undefined}>
                  <p className="text-xs font-semibold text-white">{f.name || "Campo"}</p>
                  <DiscordContent text={f.value || "—"} className="text-sm text-[#dbdee1]" />
                </div>
              ))}
            </div>
          ) : null}
          {footer ? <p className="text-[0.7rem] text-white/45">{footer}</p> : null}
        </div>
      </div>

      <div className="mt-3">
        {mode === "dropdown" ? (
          <div className="rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1] ring-1 ring-white/10">
            <p className="text-white/55">{buttonText || "Seleziona un argomento..."}</p>
            {options && options.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
                {options.slice(0, 5).map((o, i) => (
                  <li key={i}>
                    <span className="font-medium text-white"><EmojiText text={o.label} /></span>
                    {o.description ? <span className="block text-xs text-white/45"><EmojiText text={o.description} /></span> : null}
                  </li>
                ))}
                {options.length > 5 ? (
                  <li className="text-xs text-white/40">+{options.length - 5} altri…</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white",
              btnClass,
            )}
          >
            {emoji && !emojiLooksCustom ? <span aria-hidden>{emoji}</span> : null}
            {emojiLooksCustom ? <span className="text-xs opacity-80">emoji</span> : null}
            <span className="truncate">{buttonText || "Apri un ticket"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
