"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Disc3,
  HelpCircle,
  ListMusic,
  Lock,
  LogOut,
  Minus,
  Pencil,
  Play,
  Plus,
  Settings2,
  Share2,
  Timer,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isDiscordActivity } from "@/lib/discordActivity";
import {
  formatPartyCode,
  MUSIC_QUIZ_ANSWER_CHOICES_MS,
  type MusicQuizDifficulty,
  type MusicQuizPartyQueueItem,
  type MusicQuizPartyRoom as Room,
  type MusicQuizPartySettings,
} from "@/lib/musicQuiz";
import { MusicQuizSearch } from "./MusicQuizSearch";
import { ChatButton, ChatDrawer, useUnread } from "./PartyChat";

type Act = (action: string, extra?: Record<string, unknown>) => Promise<void>;

const DEFAULT_SETTINGS: MusicQuizPartySettings = {
  locked: false,
  chatEnabled: true,
  answerMs: 30_000,
  autoNext: true,
  presentationMode: false,
  leaderboard: "always",
  queueActive: true,
  queueVisible: "all",
  queueAdd: "host",
};

export function MusicQuizPartyLobby({
  room,
  me,
  invite,
  busy,
  onAct,
  onLeave,
}: {
  room: Room;
  me: string;
  invite: string;
  busy: boolean;
  onAct: Act;
  onLeave: () => void;
}) {
  const isHost = room.hostId === me;
  const settings = room.settings || DEFAULT_SETTINGS;
  const queue = room.queue || [];
  const head = queue[0];
  const players = room.players;
  const max = room.maxPlayers || 8;
  const canStart = players.length >= 2;
  const chat = room.chat || [];

  const [copied, setCopied] = useState<"code" | "link" | "">("");
  const [advanced, setAdvanced] = useState(false);
  const [queueSettings, setQueueSettings] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.roomName || "");
  const unread = useUnread(chat, me, chatOpen);
  const qrSrc = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(invite)}`,
    [invite],
  );

  useEffect(() => {
    setNameDraft(room.roomName || "");
  }, [room.roomName]);

  function copy(kind: "code" | "link") {
    const text = kind === "code" ? room.roomId : invite;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    });
  }

  /* condividi: menu del telefono/computer se c'è, altrimenti copia il link */
  async function share() {
    const data = { title: room.roomName || "Music Quiz", text: `Entra nella mia stanza del Music Quiz: codice ${formatPartyCode(room.roomId)}`, url: invite };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* annullato: si copia */
      }
    }
    copy("link");
  }

  async function patchSettings(partial: Partial<MusicQuizPartySettings> & { roomName?: string; maxPlayers?: number }) {
    const { roomName, maxPlayers, ...settingsPatch } = partial;
    await onAct("settings", {
      settings: settingsPatch,
      ...(roomName != null ? { roomName } : {}),
      ...(maxPlayers != null ? { maxPlayers } : {}),
    });
  }

  return (
    <div className={cn("mx-auto max-w-3xl space-y-4 px-4 pb-40", isDiscordActivity() ? "pt-6" : "pt-24 sm:pt-28")}>
      {/* intestazione a strisce */}
      <header
        className="flex items-center gap-3 rounded-3xl px-4 py-3.5 text-ink shadow-[0_18px_40px_-22px_rgba(0,0,0,0.9)] sm:px-5"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, #d69a5f 0 18px, #c98b50 18px 36px)" }}
      >
        <span className="hidden size-11 shrink-0 place-items-center rounded-2xl bg-ink/15 sm:grid">
          <Disc3 className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink/65">Lobby del party</p>
          {editingName && isHost ? (
            <form
              className="mt-0.5 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void patchSettings({ roomName: nameDraft.trim() || room.roomName });
                setEditingName(false);
              }}
            >
              <input
                autoFocus
                value={nameDraft}
                maxLength={40}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => setEditingName(false)}
                className="w-full max-w-xs rounded-lg bg-ink/10 px-2 py-0.5 font-display text-xl font-semibold outline-none"
              />
            </form>
          ) : (
            <button
              type="button"
              disabled={!isHost}
              onClick={() => setEditingName(true)}
              className="group inline-flex max-w-full items-center gap-1.5 text-left font-display text-xl font-semibold uppercase tracking-wide disabled:cursor-default"
            >
              <span className="truncate">{room.roomName || "Party"}</span>
              {isHost ? <Pencil className="size-3.5 shrink-0 opacity-50 transition group-hover:opacity-90" aria-label="Cambia nome" /> : null}
            </button>
          )}
        </div>
        <button type="button" onClick={() => setHelpOpen(true)} className="grid size-10 place-items-center rounded-full bg-ink/80 text-crema transition hover:bg-ink" aria-label="Come funziona">
          <HelpCircle className="size-5" />
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Esci dalla stanza"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink/80 px-3 text-xs font-bold uppercase tracking-wide text-crema transition hover:bg-ink sm:px-4"
        >
          <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Esci</span>
        </button>
      </header>

      {/* codice della stanza */}
      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR per entrare nella stanza" className="size-20 shrink-0 rounded-xl bg-crema p-1" />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crema/45">Codice stanza</p>
          <p className="font-mono text-4xl font-bold tracking-[0.18em] text-crema">{formatPartyCode(room.roomId)}</p>
          {settings.locked ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-ember">
              <Lock className="size-3" aria-hidden /> Stanza bloccata: nessuno può entrare
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <PillButton onClick={() => copy("code")} icon={copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}>
            {copied === "code" ? "Copiato" : "Copia"}
          </PillButton>
          <PillButton onClick={() => void share()} icon={copied === "link" ? <Check className="size-4" /> : <Share2 className="size-4" />}>
            {copied === "link" ? "Link copiato" : "Condividi"}
          </PillButton>
        </div>
      </Card>

      {/* prossimo gioco */}
      <Card className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={head?.cover || room.packCover || "/images/logo-disco.png"} alt="" className="size-20 shrink-0 rounded-2xl object-cover ring-1 ring-sand/20 sm:size-28" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-caramel">Prossimo</p>
          <h2 className="mt-1 truncate font-display text-2xl font-semibold text-crema sm:text-3xl">{head?.title || room.packTitle}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag icon={<Disc3 className="size-3" />}>Music Quiz</Tag>
            <Tag>Indovina la canzone</Tag>
            <Tag>{diffLabel(head?.difficulty || room.difficulty)}</Tag>
            <Tag icon={<Timer className="size-3" />}>{settings.answerMs / 1000}s per risposta</Tag>
          </div>
        </div>
      </Card>

      {/* giocatori */}
      <Card>
        <SectionHead icon={<Users className="size-5" />} kicker="Lobby" title="Giocatori">
          <span className="rounded-full bg-crema/[0.07] px-3 py-1 text-sm font-bold tabular-nums ring-1 ring-sand/15">
            <span className="text-caramel">{players.length}</span>
            <span className="text-crema/60"> / {max}</span>
          </span>
        </SectionHead>
        <ul className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {players.map((p) => {
              const host = p.userId === room.hostId;
              const mine = p.userId === me;
              return (
                <motion.li
                  key={p.userId}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1",
                    host ? "bg-caramel/10 ring-caramel/40" : "bg-espresso/55 ring-sand/10",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.avatarUrl || "/images/logo-disco.png"} alt="" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-sand/15" />
                  <span className={cn("min-w-0 flex-1 truncate font-semibold", host ? "text-caramel" : "text-crema")}>{p.displayName}</span>
                  {mine ? <span className="inline-flex h-6 items-center rounded-full bg-crema/10 px-2.5 text-[10px] font-bold uppercase leading-none tracking-wide text-crema/70">Tu</span> : null}
                  {host ? (
                    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-caramel/20 px-2.5 text-[10px] font-bold uppercase leading-none tracking-wide text-caramel">
                      <Crown className="size-3" aria-hidden /> Host
                    </span>
                  ) : isHost ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAct("kick", { userId: p.userId })}
                      className="rounded-full p-1.5 text-crema/35 opacity-100 transition hover:bg-ember/20 hover:text-ember sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Togli ${p.displayName} dalla stanza`}
                      title="Togli dalla stanza"
                    >
                      <UserX className="size-4" />
                    </button>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
          {players.length < max ? (
            <li className="flex items-center gap-3 rounded-2xl border border-dashed border-sand/20 px-3 py-2.5 text-sm text-crema/45">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-crema/[0.05]">
                <Plus className="size-4" aria-hidden />
              </span>
              {settings.locked
                ? "Stanza bloccata: nessun nuovo giocatore."
                : `${max - players.length} ${max - players.length === 1 ? "posto libero" : "posti liberi"}, in attesa che entrino.`}
            </li>
          ) : null}
        </ul>
      </Card>

      {/* coda dei giochi */}
      {queue.length || isHost || settings.queueAdd === "all" ? (
        <Card>
          <SectionHead icon={<ListMusic className="size-5" />} kicker="A seguire" title="Coda dei giochi">
            {isHost ? (
              <button
                type="button"
                onClick={() => setQueueSettings((v) => !v)}
                className={cn("grid size-10 place-items-center rounded-full ring-1 transition", queueSettings ? "bg-caramel/20 text-caramel ring-caramel/40" : "text-crema/55 ring-sand/15 hover:text-crema")}
                aria-label="Impostazioni della coda"
                aria-expanded={queueSettings}
              >
                <Settings2 className="size-4" />
              </button>
            ) : null}
          </SectionHead>

          <AnimatePresence initial={false}>
            {queueSettings && isHost ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mb-4 space-y-4 rounded-2xl bg-espresso/60 p-4 ring-1 ring-sand/10">
                  <Toggle label="Coda attiva" hint="Spegnila per non far cambiare la lista." on={settings.queueActive} onChange={(v) => void patchSettings({ queueActive: v })} />
                  <Seg
                    label="Chi vede la coda"
                    value={settings.queueVisible}
                    options={[
                      { id: "all", label: "Tutti" },
                      { id: "host", label: "Solo l'host" },
                    ]}
                    onChange={(v) => void patchSettings({ queueVisible: v as "all" | "host" })}
                  />
                  <Seg
                    label="Chi aggiunge giochi"
                    value={settings.queueAdd}
                    options={[
                      { id: "host", label: "Solo l'host" },
                      { id: "all", label: "Tutti" },
                    ]}
                    onChange={(v) => void patchSettings({ queueAdd: v as "host" | "all" })}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <ul className="space-y-2">
            {queue.map((q, i) => (
              <QueueRow
                key={q.id}
                item={q}
                index={i}
                last={i === queue.length - 1}
                isHost={isHost}
                busy={busy}
                onMove={(dir) => void onAct("queue_move", { id: q.id, dir })}
                onRemove={() => void onAct("queue_remove", { id: q.id })}
                onPlay={() => void onAct("queue_play", { id: q.id })}
              />
            ))}
          </ul>

          {(isHost || settings.queueAdd === "all") && settings.queueActive ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-dashed border-caramel/35 px-3 py-3 text-left transition hover:border-caramel/60 hover:bg-caramel/[0.05]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-caramel text-ink">
                <Plus className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold uppercase tracking-wide text-crema">Aggiungi gioco</span>
                <span className="text-xs text-crema/50">Metti in coda il prossimo quiz della stanza</span>
              </span>
            </button>
          ) : null}
        </Card>
      ) : null}

      {/* impostazioni */}
      <Card>
        <SectionHead icon={<Settings2 className="size-5" />} kicker="Stanza" title="Impostazioni" />
        {isHost ? (
          <div className="divide-y divide-sand/10 rounded-2xl bg-espresso/45 ring-1 ring-sand/10">
            <Row>
              <Toggle
                label="Blocca la stanza"
                hint="Nessun altro può entrare, nemmeno con il codice o il link."
                on={settings.locked}
                onChange={(v) => void patchSettings({ locked: v })}
              />
            </Row>
            <Row>
              <Toggle
                label="Chat"
                hint="I giocatori scrivono in lobby e mandano reazioni con le emoji durante la partita."
                on={settings.chatEnabled}
                onChange={(v) => void patchSettings({ chatEnabled: v })}
              />
            </Row>
            <Row>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-crema">Tempo per rispondere</p>
                  <p className="text-xs text-crema/45">Quanto tempo hanno tutti a ogni domanda. Vale dal round successivo.</p>
                </div>
                <span className="font-mono text-xl font-bold tabular-nums text-caramel">{settings.answerMs / 1000}s</span>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-1 rounded-xl bg-ink/30 p-1">
                {MUSIC_QUIZ_ANSWER_CHOICES_MS.map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => void patchSettings({ answerMs: ms })}
                    className={cn(
                      "relative rounded-lg py-1.5 text-xs font-bold tabular-nums transition",
                      settings.answerMs === ms ? "text-ink" : "text-crema/60 hover:text-crema",
                    )}
                  >
                    {settings.answerMs === ms ? <motion.span layoutId="answer-ms" className="absolute inset-0 rounded-lg bg-caramel" /> : null}
                    <span className="relative">{ms / 1000}s</span>
                  </button>
                ))}
              </div>
            </Row>
            <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-crema/80 hover:text-crema" aria-expanded={advanced}>
              Avanzate
              <ChevronDown className={cn("size-4 transition", advanced && "rotate-180")} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {advanced ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <Row>
                    <Toggle label="Modalità auto" hint="Passa da solo al round successivo dopo 5 secondi." on={settings.autoNext} onChange={(v) => void patchSettings({ autoNext: v })} />
                  </Row>
                  <Row>
                    <Toggle
                      label="Modalità presentazione"
                      hint="Tutti, anche l'host, vedono la domanda e giocano in classifica."
                      on={settings.presentationMode}
                      onChange={(v) => void patchSettings({ presentationMode: v })}
                    />
                  </Row>
                  <Row>
                    <Seg
                      label="Classifica"
                      hint="Quando i giocatori vedono la classifica."
                      value={settings.leaderboard}
                      options={[
                        { id: "always", label: "Sempre" },
                        { id: "end", label: "A fine partita" },
                        { id: "never", label: "Mai" },
                      ]}
                      onChange={(v) => void patchSettings({ leaderboard: v as MusicQuizPartySettings["leaderboard"] })}
                    />
                  </Row>
                  <Row>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-crema">Posti</p>
                        <p className="text-xs text-crema/45">Quante persone possono entrare (da 2 a 20).</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl bg-ink/30 p-1">
                        <button
                          type="button"
                          disabled={busy || max <= Math.max(2, players.length)}
                          onClick={() => void patchSettings({ maxPlayers: max - 1 })}
                          className="grid size-8 place-items-center rounded-lg text-crema/70 hover:bg-crema/10 disabled:opacity-30"
                          aria-label="Un posto in meno"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="w-8 text-center font-mono text-lg font-bold tabular-nums text-crema">{max}</span>
                        <button
                          type="button"
                          disabled={busy || max >= 20}
                          onClick={() => void patchSettings({ maxPlayers: max + 1 })}
                          className="grid size-8 place-items-center rounded-lg text-crema/70 hover:bg-crema/10 disabled:opacity-30"
                          aria-label="Un posto in più"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                  </Row>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : (
          /* chi non è host vede solo come è impostata la stanza */
          <div className="flex flex-wrap gap-2">
            <Tag icon={<Timer className="size-3" />}>{settings.answerMs / 1000}s per risposta</Tag>
            <Tag>{settings.autoNext ? "Avanza da sola" : "Avanza l'host"}</Tag>
            <Tag>Classifica: {settings.leaderboard === "always" ? "sempre" : settings.leaderboard === "end" ? "a fine partita" : "mai"}</Tag>
            <Tag>{settings.chatEnabled ? "Chat attiva" : "Chat spenta"}</Tag>
            <Tag icon={<Users className="size-3" />}>{max} posti</Tag>
          </div>
        )}
      </Card>

      {/* barra in basso: inizia + chat */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-sand/10 bg-espresso/85 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            {isHost ? (
              <button
                type="button"
                disabled={busy || !canStart}
                onClick={() => void onAct("start")}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-caramel to-ember text-base font-bold uppercase tracking-wide text-ink shadow-[0_12px_30px_-12px_rgba(214,154,95,0.8)] transition hover:brightness-105 disabled:from-crema/25 disabled:to-crema/25 disabled:text-crema/60 disabled:shadow-none"
              >
                <Play className="size-5 fill-current" aria-hidden /> Inizia la partita
              </button>
            ) : (
              <div className="flex h-14 items-center justify-center rounded-2xl bg-crema/[0.06] text-sm font-semibold text-crema/70 ring-1 ring-sand/15">
                <span className="mr-2 size-2 animate-pulse rounded-full bg-caramel" aria-hidden />
                In attesa che l&apos;host faccia partire la partita…
              </div>
            )}
            <p className="mt-1.5 text-center text-xs text-crema/45">
              {isHost ? (canStart ? `${players.length} giocatori pronti` : "Servono almeno 2 giocatori per iniziare") : `Host: ${players.find((p) => p.userId === room.hostId)?.displayName || "—"}`}
            </p>
          </div>
          <ChatButton unread={unread} onClick={() => setChatOpen(true)} className="mb-5" />
        </div>
      </div>

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chat={chat}
        me={me}
        enabled={settings.chatEnabled}
        onSend={(text) => void onAct("chat", { text })}
      />

      <AnimatePresence>
        {addOpen ? (
          <Modal title="Aggiungi gioco" onClose={() => setAddOpen(false)} wide>
            <AddGame
              onPick={(slug, difficulty) => {
                setAddOpen(false);
                void onAct("queue_add", { slug, difficulty });
              }}
            />
          </Modal>
        ) : null}
        {helpOpen ? (
          <Modal title="Come funziona" onClose={() => setHelpOpen(false)}>
            <ol className="space-y-3 text-sm text-crema/80">
              <HelpStep n={1}>Gli amici entrano con il codice, il QR o il link: si condividono dal riquadro in alto.</HelpStep>
              <HelpStep n={2}>L&apos;host sceglie i quiz da giocare e li mette in coda; si possono spostare, togliere o far partire subito.</HelpStep>
              <HelpStep n={3}>A ogni domanda parte uno spezzone: chi indovina prima prende più punti, fino a 100.</HelpStep>
              <HelpStep n={4}>Durante la partita si mandano reazioni con le emoji; in lobby c&apos;è la chat.</HelpStep>
              <HelpStep n={5}>Alla fine c&apos;è il podio, e l&apos;host può far partire il prossimo quiz della coda.</HelpStep>
            </ol>
          </Modal>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------- pezzi ---------- */

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl bg-roast/75 p-4 ring-1 ring-sand/12 backdrop-blur sm:p-5", className)}>{children}</section>;
}

function SectionHead({ icon, kicker, title, children }: { icon: ReactNode; kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-crema/[0.06] text-crema/70 ring-1 ring-sand/10">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-crema/45">{kicker}</p>
        <h3 className="font-display text-2xl font-semibold leading-tight text-crema">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5">{children}</div>;
}

function PillButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full bg-crema/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.13]">
      {icon}
      {children}
    </button>
  );
}

function Tag({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-crema/[0.07] px-2.5 text-[11px] font-semibold leading-none text-crema/75 ring-1 ring-sand/15">
      {icon}
      {children}
    </span>
  );
}

function diffLabel(d: MusicQuizDifficulty) {
  return d === "1s" ? "1 secondo" : d === "3s" ? "3 secondi" : "5 secondi";
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-start justify-between gap-4 text-left">
      <span>
        <span className="block text-sm font-semibold text-crema">{label}</span>
        <span className="text-xs text-crema/45">{hint}</span>
      </span>
      <span className={cn("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition", on ? "bg-caramel" : "bg-crema/15")}>
        <motion.span
          className="absolute top-1 size-5 rounded-full bg-crema shadow"
          animate={{ left: on ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

function Seg({ label, hint, value, options, onChange }: { label: string; hint?: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div>
      <p className="text-sm font-semibold text-crema">{label}</p>
      {hint ? <p className="text-xs text-crema/45">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1 rounded-xl bg-ink/30 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn("flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition", value === o.id ? "bg-caramel text-ink" : "text-crema/60 hover:text-crema")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QueueRow({
  item,
  index,
  last,
  isHost,
  busy,
  onMove,
  onRemove,
  onPlay,
}: {
  item: MusicQuizPartyQueueItem;
  index: number;
  last: boolean;
  isHost: boolean;
  busy: boolean;
  onMove: (dir: number) => void;
  onRemove: () => void;
  onPlay: () => void;
}) {
  const next = index === 0;
  return (
    <motion.li layout className={cn("flex items-center gap-3 rounded-2xl p-2.5 ring-1", next ? "bg-caramel/[0.08] ring-caramel/35" : "bg-espresso/55 ring-sand/10")}>
      <span className="w-5 text-center text-sm font-bold tabular-nums text-crema/40">{index + 1}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.cover || "/images/logo-disco.png"} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-crema">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Tag>{diffLabel(item.difficulty)}</Tag>
          {next ? <span className="inline-flex h-6 items-center rounded-full bg-caramel/25 px-2.5 text-[10px] font-bold uppercase leading-none tracking-wide text-caramel ring-1 ring-caramel/40">Prossimo</span> : null}
        </div>
      </div>
      {isHost ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn label="Sposta su" disabled={busy || index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconBtn>
          <IconBtn label="Sposta giù" disabled={busy || last} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconBtn>
          <IconBtn label="Togli dalla coda" disabled={busy} onClick={onRemove} danger>
            <Trash2 className="size-4" />
          </IconBtn>
          <button
            type="button"
            disabled={busy}
            onClick={onPlay}
            className="ml-1 hidden items-center gap-1.5 rounded-xl bg-crema/[0.08] px-3 py-2 text-xs font-bold uppercase text-crema ring-1 ring-sand/15 transition hover:bg-caramel hover:text-ink sm:inline-flex"
          >
            <Play className="size-3.5 fill-current" aria-hidden /> Gioca
          </button>
        </div>
      ) : null}
    </motion.li>
  );
}

function IconBtn({ label, disabled, onClick, danger, children }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("grid size-9 place-items-center rounded-full text-crema/55 transition disabled:opacity-25", danger ? "hover:bg-ember/20 hover:text-ember" : "hover:bg-crema/10 hover:text-crema")}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-[80] grid place-items-end bg-ink/70 p-3 backdrop-blur-sm sm:place-items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        data-lenis-prevent
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn("max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-3xl bg-roast p-5 ring-1 ring-sand/20", wide ? "max-w-2xl" : "max-w-md")}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl font-semibold text-crema">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-crema/50 hover:bg-crema/10" aria-label="Chiudi">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function HelpStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-caramel/20 text-xs font-bold text-caramel">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function AddGame({ onPick }: { onPick: (slug: string, difficulty: MusicQuizDifficulty) => void }) {
  const [difficulty, setDifficulty] = useState<MusicQuizDifficulty>("5s");
  return (
    <>
      <Seg
        label="Quanto si ascolta"
        value={difficulty}
        options={[
          { id: "5s", label: "5 secondi" },
          { id: "3s", label: "3 secondi" },
          { id: "1s", label: "1 secondo" },
        ]}
        onChange={(v) => setDifficulty(v as MusicQuizDifficulty)}
      />
      <div className="mt-4">
        <MusicQuizSearch onPickSlug={(slug) => onPick(slug, difficulty)} />
      </div>
    </>
  );
}
