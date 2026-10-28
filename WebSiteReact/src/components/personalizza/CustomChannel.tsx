"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Plus, Smile, Star, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { EmojiText } from "@/components/discord/EmojiText";
import { RoleIconGlyph, RolePreview, VoicePreview, parseRoleIcon } from "./DiscordPreview";
import { cn } from "@/lib/cn";
import {
  HOLO_PRIMARY,
  HOLO_SECONDARY,
  featureUnlocked,
  inferColorMode,
  loadGuildEmojis,
  mutateCustomProfile,
  normalizeHex,
  requirementsFor,
  type ColorMode,
  type CustomProfileState,
  type CustomRoleEntity,
  type CustomVoiceEntity,
  type GuildEmoji,
} from "@/lib/personalizza";
import { confirmDialog } from "@/components/ui";
import { ColorKnob } from "./ColorKnob";
import { EmojiPopover, type EmojiPick } from "./EmojiPopover";
import { LockPlate } from "./LockPlate";

type Target = "primary" | "secondary" | "voice";

function entityFor(state: CustomProfileState, target: Target): CustomRoleEntity | CustomVoiceEntity | null {
  if (target === "primary") return state.primary;
  if (target === "secondary") return state.secondary;
  return state.voice;
}

/** Canale mixer: ruolo principale/secondario o vocale privata. */
export function CustomChannel({
  target,
  state,
  token,
  onState,
  onToast,
}: {
  target: Target;
  state: CustomProfileState;
  token: string;
  onState: (s: CustomProfileState) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const unlocked = featureUnlocked(state, target);
  const req = requirementsFor(state, target);
  const entity = entityFor(state, target);
  const gradientOk = Boolean(state.permissions?.gradientHolo);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#FF66CC");
  const [hex2, setHex2] = useState("#66CCFF");
  const [mode, setMode] = useState<ColorMode>("solid");
  const [icon, setIcon] = useState("");
  const [emoji, setEmoji] = useState("");
  const [memberId, setMemberId] = useState("");
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [picker, setPicker] = useState<"icon" | "emoji" | "name" | null>(null);
  const nameBtn = useRef<HTMLButtonElement>(null);
  const iconBtn = useRef<HTMLButtonElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entity) {
      setName("");
      setIcon("");
      setEmoji("");
      setMode("solid");
      return;
    }
    setName(String(entity.name || "").replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "").trim() || entity.name || "");
    if ("color" in entity) {
      const role = entity as CustomRoleEntity;
      setHex(normalizeHex(role.color, "#FF66CC"));
      setHex2(normalizeHex(role.color2, "#66CCFF"));
      setMode(inferColorMode(role.color, role.color2, role.colorMode));
      setIcon(String(role.emoji || ""));
    }
    if ("emoji" in entity && target === "voice") {
      setEmoji(String((entity as CustomVoiceEntity).emoji || ""));
    }
  }, [entity, target]);

  useEffect(() => {
    let cancelled = false;
    loadGuildEmojis(token).then((list) => {
      if (!cancelled) setGuildEmojis(list);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function run(action: string, extra: Record<string, string> = {}) {
    if (busy) return;
    if (target === "voice" && action === "create" && state.voiceActivity?.recreationBlocked) {
      onToast(
        `Ricreazione bloccata${state.voiceActivity.cooldownRemainingLabel ? ` ancora per ${state.voiceActivity.cooldownRemainingLabel}` : ""}.`,
        true,
      );
      return;
    }
    setBusy(true);
    const r = await mutateCustomProfile(token, { target, action, ...extra });
    setBusy(false);
    if (!r.ok) {
      onToast(r.message, true);
      return;
    }
    onState(r.data);
    onToast(r.message || "Salvato.");
  }

  // nel campo le custom si vedono come :nome:; per il bot serve di nuovo <:nome:id>
  function resolveIconValue(raw: string): string {
    const v = raw.trim();
    const m = v.match(/^:([A-Za-z0-9_~]+):$/);
    if (!m) return v;
    const e = guildEmojis.find((g) => g.name === m[1]);
    return e ? `<${e.animated ? "a" : ""}:${e.name}:${e.id}>` : v;
  }

  function applyMode(next: ColorMode) {
    if ((next === "gradient" || next === "holo") && !gradientOk) {
      onToast("Gradiente e olografico sono riservati a VIP, Server Booster, Double Booster o VIP+.", true);
      return;
    }
    setMode(next);
    if (next === "holo") {
      setHex(HOLO_PRIMARY);
      setHex2(HOLO_SECONDARY);
    }
  }

  function onEmojiPick(pick: EmojiPick, field: "icon" | "emoji" | "name") {
    if (field === "name") {
      if (pick.type !== "unicode") {
        onToast("Qui puoi usare solo emoji normali (non quelle custom del server).", true);
        return;
      }
      setName((n) => `${pick.text} ${n}`.trim());
      return;
    }
    if (field === "icon") {
      const value = pick.type === "custom" ? pick.markup : pick.text;
      setIcon(value);
      return;
    }
    if (pick.type !== "unicode") {
      onToast("Per la vocale usa un'emoji unicode (es. 🎧).", true);
      return;
    }
    setEmoji(pick.text);
  }

  const title =
    target === "primary" ? "Ruolo principale" : target === "secondary" ? "Ruolo secondario" : "Vocale privata";
  const Icon = target === "voice" ? Mic : Star;

  if (!unlocked) {
    return (
      <LockPlate
        title={title}
        anyOf={req?.anyOf}
        note={req?.note || "Sblocca questa funzione con boost, donazioni o livello."}
      />
    );
  }

  if (!entity) {
    const blocked = target === "voice" && state.voiceActivity?.recreationBlocked;
    return (
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Canale libero</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-crema/60">
              {target === "voice"
                ? "Crea la tua vocale privata e invita chi vuoi."
                : "Crea il ruolo e personalizza nome, colore e icona."}
            </p>
            {blocked && (
              <p className="mt-3 rounded-2xl bg-caramel/10 px-3 py-2 text-sm text-crema/70 ring-1 ring-caramel/25">
                Ricreazione bloccata
                {state.voiceActivity?.cooldownRemainingLabel
                  ? ` ancora per ${state.voiceActivity.cooldownRemainingLabel}`
                  : state.voiceActivity?.recreationBlockedLabel
                    ? ` (fino al ${state.voiceActivity.recreationBlockedLabel})`
                    : ""}
                .
              </p>
            )}
            <button
              type="button"
              disabled={busy || blocked}
              onClick={() => run("create")}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Crea
            </button>
          </div>
        </div>
      </div>
    );
  }

  const members = Array.isArray(entity.sharedMembers) ? entity.sharedMembers : [];
  const iconInfo = parseRoleIcon(icon);
  // icona già sul ruolo (immagine caricata da Discord) quando il campo è vuoto
  const savedIconUrl = target !== "voice" ? String((entity as CustomRoleEntity).iconUrl || "") : "";
  const voiceAct = target === "voice" ? state.voiceActivity : null;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">{title}</p>
            <h3 className="mt-1 font-display text-2xl font-semibold"><EmojiText text={entity.name || "—"} /></h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ message: "Confermi l'eliminazione?", danger: true })) run("delete");
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-red-500/15 hover:text-red-200 hover:ring-red-400/30 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Elimina
          </button>
        </div>

        {voiceAct && (
          <p className="mt-3 rounded-2xl bg-crema/4 px-3 py-2 text-xs leading-relaxed text-crema/60 ring-1 ring-sand/10">
            Attività settimanale: {Math.round((voiceAct.weeklySeconds || 0) / 3600)}h
            {voiceAct.weeklyMinSeconds ? ` / min ${Math.round(voiceAct.weeklyMinSeconds / 3600)}h` : ""}
            {voiceAct.failedWeekStreak
              ? ` · settimane sotto soglia: ${voiceAct.failedWeekStreak}/${voiceAct.maxFailedWeeks || 3}`
              : ""}
            {req && "note" in req && req.note ? ` · ${req.note}` : ""}
          </p>
        )}

        <div className="mt-5">
          {target === "voice" ? (
            <VoicePreview name={name} emoji={emoji} members={members} />
          ) : (
            <RolePreview
              name={name}
              mode={mode}
              color={normalizeHex(hex, "#FF66CC")}
              color2={normalizeHex(hex2, "#66CCFF")}
              icon={icon || (entity as CustomRoleEntity).iconUrl || ""}
            />
          )}
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-crema/50">Nome</span>
            <div className="relative mt-1.5 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1 rounded-xl bg-espresso/70 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
                maxLength={80}
              />
              {target !== "voice" && (
                <div className="relative">
                  <button
                    ref={nameBtn}
                    type="button"
                    onClick={() => setPicker(picker === "name" ? null : "name")}
                    className="rounded-xl bg-crema/8 p-2.5 ring-1 ring-sand/20 hover:bg-crema/12"
                    aria-label="Aggiungi emoji al nome"
                  >
                    <Smile className="size-4" />
                  </button>
                  <EmojiPopover
                    open={picker === "name"}
                    onClose={() => setPicker(null)}
                    onPick={(p) => onEmojiPick(p, "name")}
                    guildEmojis={guildEmojis}
                    unicodeOnly
                    anchorRef={nameBtn}
                  />
                </div>
              )}
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => run("rename", target === "voice" ? { name: name.trim(), baseName: name.trim() } : { name: name.trim() })}
                className="rounded-full bg-crema/8 px-4 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/12 disabled:opacity-50"
              >
                Rinomina
              </button>
            </div>
          </label>

          {target === "voice" ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-crema/50">Emoji canale</span>
              <div className="relative mt-1.5 flex gap-2">
                <input
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl bg-espresso/70 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
                  placeholder="🎧"
                />
                <div className="relative">
                  <button
                    ref={emojiBtn}
                    type="button"
                    onClick={() => setPicker(picker === "emoji" ? null : "emoji")}
                    className="rounded-xl bg-crema/8 p-2.5 ring-1 ring-sand/20 hover:bg-crema/12"
                    aria-label="Scegli emoji"
                  >
                    <Smile className="size-4" />
                  </button>
                  <EmojiPopover
                    open={picker === "emoji"}
                    onClose={() => setPicker(null)}
                    onPick={(p) => onEmojiPick(p, "emoji")}
                    guildEmojis={guildEmojis}
                    unicodeOnly
                    anchorRef={emojiBtn}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || !emoji.trim()}
                  onClick={() => run("emoji", { emoji: emoji.trim() })}
                  className="rounded-full bg-crema/8 px-4 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/12 disabled:opacity-50"
                >
                  Applica
                </button>
              </div>
            </label>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-crema/50">Modalità colore</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Modalità colore">
                  {(
                    [
                      ["solid", "Tinta"],
                      ["gradient", "Gradiente"],
                      ["holo", "Olografico"],
                    ] as const
                  ).map(([id, label]) => {
                    const locked = (id === "gradient" || id === "holo") && !gradientOk;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={mode === id}
                        aria-disabled={locked}
                        onClick={() => applyMode(id)}
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition-colors",
                          mode === id
                            ? "bg-caramel text-ink ring-caramel"
                            : locked
                              ? "bg-crema/[0.03] text-crema/35 ring-sand/10"
                              : "bg-crema/[0.04] text-crema/75 ring-sand/20 hover:ring-sand/40",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ColorKnob label="Primario" value={hex} onChange={setHex} disabled={mode === "holo"} />
              {(mode === "gradient" || mode === "holo") && (
                <ColorKnob label="Secondario" value={hex2} onChange={setHex2} disabled={mode === "holo"} />
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const m = mode === "holo" ? "gradient" : mode;
                  const h1 = mode === "holo" ? HOLO_PRIMARY : normalizeHex(hex);
                  const h2 = mode === "holo" || mode === "gradient" ? (mode === "holo" ? HOLO_SECONDARY : normalizeHex(hex2)) : "";
                  if (mode === "solid" && !h1) {
                    onToast("Inserisci un colore HEX valido (es. #ff66cc).", true);
                    return;
                  }
                  if (mode === "gradient" && (!h1 || !h2)) {
                    onToast("Per il gradiente servono primario e secondario HEX validi.", true);
                    return;
                  }
                  run("color", { mode: m, hex: h1, hex2: h2 });
                }}
                className="rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/12 disabled:opacity-50"
              >
                Applica colore
              </button>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-crema/50">Icona ruolo</span>
                <div className="relative mt-1.5 flex gap-2">
                  {/* l'emoji si vede davvero; le custom si leggono come :nome: invece del codice <:nome:id> */}
                  <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-espresso/70 pl-2.5 ring-1 ring-sand/15 focus-within:ring-caramel/60">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-crema/6">
                      {iconInfo.kind !== "none" ? (
                        <RoleIconGlyph value={icon} />
                      ) : savedIconUrl ? (
                        <RoleIconGlyph value={savedIconUrl} />
                      ) : (
                        <Smile className="size-4 text-crema/30" />
                      )}
                    </span>
                    <input
                      value={iconInfo.kind === "img" && icon.startsWith("<") ? `:${iconInfo.name}:` : icon}
                      onChange={(e) => setIcon(e.target.value)}
                      onFocus={(e) => {
                        if (icon.startsWith("<")) e.currentTarget.select();
                      }}
                      placeholder={savedIconUrl ? "Icona attuale · scegline un'altra per cambiarla" : "Scegli un'emoji o incolla un link https"}
                      className="min-w-0 flex-1 bg-transparent py-2.5 pr-2 text-sm outline-none"
                    />
                    {icon && (
                      <button
                        type="button"
                        onClick={() => setIcon("")}
                        className="mr-1.5 rounded-lg p-1 text-crema/40 hover:bg-crema/8 hover:text-crema"
                        aria-label="Svuota icona"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </span>
                  <div className="relative">
                    <button
                      ref={iconBtn}
                      type="button"
                      onClick={() => setPicker(picker === "icon" ? null : "icon")}
                      className="rounded-xl bg-crema/8 p-2.5 ring-1 ring-sand/20 hover:bg-crema/12"
                      aria-label="Scegli icona"
                    >
                      <Smile className="size-4" />
                    </button>
                    <EmojiPopover
                      open={picker === "icon"}
                      onClose={() => setPicker(null)}
                      onPick={(p) => onEmojiPick(p, "icon")}
                      guildEmojis={guildEmojis}
                      preferCustom
                      anchorRef={iconBtn}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !icon.trim()}
                    onClick={() => run("icon", { value: resolveIconValue(icon) })}
                    className="rounded-full bg-crema/8 px-4 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/12 disabled:opacity-50"
                  >
                    Applica
                  </button>
                </div>
              </label>
            </>
          )}
        </div>
      </div>

      {/* membri condivisi */}
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Condivisione</p>
        <h4 className="mt-1 font-display text-xl font-semibold">Membri</h4>
        <div className="mt-3 flex gap-2">
          <input
            value={memberId}
            onChange={(e) => setMemberId(e.target.value.replace(/\D/g, "").slice(0, 20))}
            placeholder="ID Discord"
            className="min-w-0 flex-1 rounded-xl bg-espresso/70 px-3 py-2.5 font-mono text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
          />
          <button
            type="button"
            disabled={busy || !/^\d{17,20}$/.test(memberId)}
            onClick={() => {
              run("members_add", { memberId });
              setMemberId("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-caramel/20 px-4 py-2 text-sm font-semibold text-ember ring-1 ring-caramel/30 hover:bg-caramel/30 disabled:opacity-50"
          >
            <UserPlus className="size-4" /> Aggiungi
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {members.length === 0 && <li className="text-sm text-crema/45">Nessun utente ancora.</li>}
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-espresso/50 px-3 py-2 ring-1 ring-sand/10">
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-crema/10 text-xs">?</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {m.displayName || m.username || m.id}
                {m.isOwner && <span className="ml-2 text-[0.65rem] uppercase tracking-wider text-caramel">Tu</span>}
              </span>
              {!m.isOwner && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("members_remove", { memberId: m.id })}
                  className="rounded-lg p-1.5 text-crema/45 hover:bg-crema/8 hover:text-crema disabled:opacity-50"
                  aria-label="Rimuovi"
                >
                  <UserMinus className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
