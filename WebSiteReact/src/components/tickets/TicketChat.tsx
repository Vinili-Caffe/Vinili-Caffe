"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Copy, CornerUpLeft, ImagePlus, Link2, Loader2, Lock, Pencil, Send, SmilePlus, Star, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { confirmDialog } from "@/components/ui";
import { showToast } from "@/components/ui/toast";
import { enqueue, isOfflineApiFailure, OFFLINE_TOAST_REACT } from "@/lib/offline-queue";
import { useI18n } from "@/lib/i18n";
import { imageToDataUrl } from "@/lib/feedback";
import {
  MAX_CONTENT,
  MAX_IMAGES,
  QUICK_REACTIONS,
  acceptClose,
  deleteMessage,
  editMessage,
  rate,
  react,
  rejectClose,
  resolveMentions,
  clearTicketComposerDraft,
  loadTicketComposerDraft,
  saveTicketComposerDraft,
  sendMessage,
  sendTyping,
  ticketShareUrl,
  ticketTime,
  type Category,
  type Detail,
  type Message,
} from "@/lib/tickets";
import { cn } from "@/lib/cn";
import { onComposerEnterSend } from "@/lib/composer-keys";
import { TicketActions } from "./TicketActions";
import { EmojiText } from "@/components/discord/EmojiText";
import { ComposerSuggest } from "./ComposerSuggest";

/** Spunte stile chat: 1 = inviato, 2 = letto. */
function ReceiptTicks({ status }: { status: "sent" | "delivered" | "read" }) {
  const read = status === "read";
  return (
    <span
      className={cn("inline-flex items-center", read ? "text-[#53bdeb]" : "text-current opacity-70")}
      title={read ? "Letto" : "Inviato"}
      aria-label={read ? "Letto" : "Inviato"}
    >
      <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden className="fill-current">
        {read ? (
          <>
            <path d="M11.1 1.1 5.6 7.2 3.1 4.8l-1.2 1.2 3.7 3.7 6.7-7.4z" />
            <path d="M14.4 1.1 8.9 7.2 7.6 5.9l-1.1 1.2 2.4 2.4 6.7-7.4z" />
          </>
        ) : (
          <path d="M13.2 1.1 6.5 8.5 2.8 4.9 1.6 6.1 6.5 11l8-8.7z" />
        )}
      </svg>
    </span>
  );
}

function Stars({ value, set, label }: { value: number; set: (n: number) => void; label: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-crema/70">{label}</p>
      <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} stelle`} onClick={() => set(n)} className="p-0.5">
            <Star className={cn("size-7 transition-colors", n <= value ? "fill-ember text-ember" : "text-crema/25 hover:text-crema/50")} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  m,
  mine,
  canReact,
  canEdit,
  canDelete,
  names,
  roleNames,
  channelNames,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onCopy,
}: {
  m: Message;
  mine: boolean;
  canReact: boolean;
  canEdit: boolean;
  canDelete: boolean;
  names: Record<string, string>;
  roleNames: Record<string, string>;
  channelNames: Record<string, string>;
  onReply: () => void;
  onReact: (e: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const canCopy = Boolean(String(m.content || "").trim());
  if (m.authorKind === "system")
    return (
      <li className="my-3 flex min-w-0 justify-center px-1">
        <span className="min-w-0 max-w-[85%] break-words rounded-full bg-crema/[0.05] px-4 py-1.5 text-center text-xs text-crema/55 ring-1 ring-sand/10 [overflow-wrap:anywhere]">
          <DiscordContent text={m.content} names={{ users: names }} className="inline" /> · {ticketTime(m.createdAt)}
        </span>
      </li>
    );
  const staff = m.authorKind === "staff";
  const showTools = !m.pending && (canReact || canEdit || canDelete || canCopy);
  return (
    <li className={cn("group flex min-w-0 gap-2.5", mine && "flex-row-reverse")}>
      <Avatar userId={m.authorId} src={m.authorAvatarUrl} name={m.authorName} className="mt-5 size-8 shrink-0 text-xs" />
      <div className={cn("flex min-w-0 max-w-[min(85%,100%)] flex-col sm:max-w-[75%]", mine && "items-end")}>
        <p className={cn("mb-1 flex min-w-0 flex-wrap items-center gap-x-2 px-1 text-xs", mine && "justify-end")}>
          <span className="min-w-0 break-words font-semibold text-crema/85">{m.authorName}</span>
          {m.authorRoleName && <span className={cn("rounded px-1.5 py-px text-[0.65rem] font-bold uppercase tracking-wider", staff ? "bg-caramel/20 text-ember" : "bg-crema/8 text-crema/55")}>{m.authorRoleName}</span>}
          {m.authorAvgRating != null && (
            <span className="inline-flex items-center gap-0.5 text-crema/45">
              <Star className="size-3 fill-current" /> {m.authorAvgRating.toString().replace(".", ",")}
            </span>
          )}
          <span className="text-crema/35">{ticketTime(m.createdAt)}</span>
        </p>
        <div
          className={cn(
            "relative min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-[0.95rem] leading-relaxed shadow-sm",
            mine ? "rounded-tr-md bg-crema text-espresso" : staff ? "rounded-tl-md bg-gradient-to-br from-[#4a2e1c] to-mocha text-crema ring-1 ring-caramel/25" : "rounded-tl-md bg-roast text-crema ring-1 ring-sand/12",
            m.pending && "opacity-60",
          )}
        >
          {m.replyTo && (
            <p className={cn("mb-1.5 line-clamp-2 break-words border-l-2 pl-2 text-xs [overflow-wrap:anywhere]", mine ? "border-espresso/30 text-espresso/60" : "border-crema/25 text-crema/55")}>
              {m.replyTo.deleted ? "Messaggio eliminato" : `${m.replyTo.authorName ?? ""}: ${m.replyTo.content ?? ""}`}
            </p>
          )}
          {m.content && (
            <DiscordContent
              text={m.content}
              names={{ users: names, roles: roleNames, channels: channelNames, light: mine }}
              className="whitespace-pre-wrap"
            />
          )}
          {m.imageUrls.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5" data-vc-lightbox-gallery>
              {m.imageUrls.map((u) => (
                <a key={u} href={u} data-vc-lightbox className="overflow-hidden rounded-lg">
                  <img src={u} alt="Allegato" loading="lazy" className="max-h-60 w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {(m.editedAt || (mine && m.authorKind !== "system" && m.authorKind !== "bot")) && (
            <span className={cn("mt-1 flex items-center justify-end gap-1 text-[0.65rem]", mine ? "text-espresso/45" : "text-crema/40")}>
              {m.editedAt && "modificato"}
              {mine && m.authorKind !== "system" && m.authorKind !== "bot" && (
                <ReceiptTicks status={m.pending ? "sent" : m.receiptStatus === "read" ? "read" : "sent"} />
              )}
            </span>
          )}
        </div>

        {m.reactions.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {m.reactions.map((r) => (
              <button key={r.key} type="button" disabled={!canReact} onClick={() => onReact(r.emoji)} className="inline-flex items-center gap-1 rounded-full bg-crema/[0.06] px-2 py-0.5 text-xs ring-1 ring-sand/15 hover:ring-caramel/40 disabled:pointer-events-none">
                {r.url ? <img src={r.url} alt={r.name ?? ""} className="size-4" /> : <span><EmojiText text={r.emoji} /></span>}
                <span className="font-semibold lining-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* azioni sul messaggio */}
        {showTools && (
          <div className={cn("relative mt-1 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100", mine && "justify-end")}>
            {canReact && (
              <>
                <button type="button" onClick={onReply} aria-label="Rispondi" className="rounded-full p-1.5 text-crema/45 hover:bg-crema/8 hover:text-crema">
                  <CornerUpLeft className="size-3.5" />
                </button>
                <button type="button" onClick={() => setPicker((p) => !p)} aria-label="Reazione" aria-expanded={picker} className="rounded-full p-1.5 text-crema/45 hover:bg-crema/8 hover:text-crema">
                  <SmilePlus className="size-3.5" />
                </button>
              </>
            )}
            {canCopy && (
              <button type="button" onClick={onCopy} aria-label="Copia testo" className="rounded-full p-1.5 text-crema/45 hover:bg-crema/8 hover:text-crema">
                <Copy className="size-3.5" />
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={onEdit} aria-label="Modifica" className="rounded-full p-1.5 text-crema/45 hover:bg-crema/8 hover:text-crema">
                <Pencil className="size-3.5" />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete} aria-label="Elimina" className="rounded-full p-1.5 text-crema/45 hover:bg-[#a83a2c]/20 hover:text-[#f0a493]">
                <Trash2 className="size-3.5" />
              </button>
            )}
            <AnimatePresence>
              {picker && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("absolute top-full z-10 mt-1 flex gap-1 rounded-full bg-roast p-1 shadow-xl ring-1 ring-sand/20", mine ? "right-0" : "left-0")}>
                  {QUICK_REACTIONS.map((e) => (
                    <button key={e} type="button" onClick={() => (onReact(e), setPicker(false))} className="rounded-full p-1.5 text-lg leading-none hover:bg-crema/10">
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </li>
  );
}

/** La conversazione del ticket. Dopo ogni azione si ricarica il dettaglio dal bot (`reload`). */
export function TicketChat({
  token,
  detail,
  categories,
  typing,
  staffView,
  onBack,
  reload,
}: {
  token: string;
  detail: Detail;
  categories: Category[];
  typing: string[];
  staffView: boolean;
  onBack: () => void;
  reload: () => void;
}) {
  const { t: tr } = useI18n();
  const t = detail.ticket;
  const p = t.permissions;
  const me = detail.viewerId;
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<Message[]>([]);
  const [rt, setRt] = useState(0);
  const [rs, setRs] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingAt = useRef(0);
  const [caret, setCaret] = useState(0);
  const [extraNames, setExtraNames] = useState<{ users: Record<string, string>; roles: Record<string, string>; channels: Record<string, string> }>({
    users: {},
    roles: {},
    channels: {},
  });

  useEffect(() => {
    setReply(null);
    setEditing(null);
    setImages([]);
    setText(loadTicketComposerDraft(t.id));
  }, [t.id]);

  useEffect(() => {
    if (editing) return;
    const id = window.setTimeout(() => {
      saveTicketComposerDraft(t.id, text);
      if (typeof navigator !== "undefined" && !navigator.onLine && String(text || "").trim()) {
        enqueue("draft", { ticketId: t.id, text });
      }
    }, 220);
    return () => window.clearTimeout(id);
  }, [text, t.id, editing]);

  const names = useMemo(() => {
    const n: Record<string, string> = { [t.userId]: t.authorName, ...extraNames.users };
    for (const m of detail.messages) n[m.authorId] = m.authorName;
    for (const u of t.addedUsers) if (u.name) n[u.id] = u.name;
    // nomi da markup già presenti nei messaggi
    for (const m of detail.messages) {
      const content = m.content || "";
      for (const hit of content.matchAll(/<@!?(\d+)>/g)) {
        if (!n[hit[1]]) n[hit[1]] = n[hit[1]] || "";
      }
    }
    return n;
  }, [detail, t, extraNames.users]);
  const roleNames = extraNames.roles;
  const channelNames = extraNames.channels;

  const messages = [...detail.messages, ...pending.filter((x) => !detail.messages.some((m) => m.content === x.content && m.authorId === me && !m.pending))];

  // resta in fondo quando arrivano messaggi
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => setPending([]), [detail]);

  // risolvi nomi di menzioni/canali/ruoli già nei messaggi (altrimenti DiscordContent mostra "utente"/"canale")
  useEffect(() => {
    const userIds = new Set<string>();
    const channelIds = new Set<string>();
    const roleIds = new Set<string>();
    for (const m of detail.messages) {
      const c = m.content || "";
      for (const x of c.matchAll(/<@!?(\d+)>/g)) userIds.add(x[1]);
      for (const x of c.matchAll(/<#(\d+)>/g)) channelIds.add(x[1]);
      for (const x of c.matchAll(/<@&(\d+)>/g)) roleIds.add(x[1]);
    }
    if (!userIds.size && !channelIds.size && !roleIds.size) return;
    let alive = true;
    void resolveMentions(token, {
      userIds: [...userIds],
      channelIds: [...channelIds],
      roleIds: [...roleIds],
    }).then((r) => {
      if (!alive) return;
      setExtraNames((prev) => ({
        users: { ...prev.users, ...r.users },
        roles: { ...prev.roles, ...r.roles },
        channels: { ...prev.channels, ...r.channels },
      }));
    });
    return () => {
      alive = false;
    };
  }, [detail.messages, token]);

  const onType = (v: string, el?: HTMLTextAreaElement | null) => {
    setText(v.slice(0, MAX_CONTENT));
    if (el) setCaret(el.selectionStart ?? v.length);
    const now = Date.now();
    if (now - typingAt.current > 4000) {
      typingAt.current = now;
      void sendTyping(token, t.id);
    }
  };

  const rememberName = (type: "user" | "role" | "channel", id: string, name: string) => {
    setExtraNames((prev) => {
      const key = type === "user" ? "users" : type === "role" ? "roles" : "channels";
      if (prev[key][id] === name) return prev;
      return { ...prev, [key]: { ...prev[key], [id]: name } };
    });
  };

  const applySuggest = (pick: { kind: string; markup?: string; text?: string }, from: number, to: number) => {
    const insert = pick.kind === "mention" ? `${pick.markup} ` : String(pick.text || "");
    const next = `${text.slice(0, from)}${insert}${text.slice(to)}`.slice(0, MAX_CONTENT);
    setText(next);
    const pos = from + insert.length;
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_IMAGES - images.length)) if (/^image\//.test(f.type)) out.push(await imageToDataUrl(f).catch(() => ""));
    setImages((x) => [...x, ...out.filter(Boolean)].slice(0, MAX_IMAGES));
  };

  const send = async () => {
    const content = text.trim();
    if (!content && !images.length) return;
    setErr("");
    if (editing) {
      setBusy(true);
      const r = await editMessage(token, t.id, editing.id, content);
      setBusy(false);
      if (!r.ok) return setErr(r.message);
      setEditing(null);
      setText("");
      return reload();
    }
    // messaggio "in volo" mostrato subito (spunta inviato subito)
    const temp: Message = {
      id: `tmp-${Date.now()}`,
      ticketId: t.id,
      authorId: me,
      authorName: "Tu",
      authorKind: "user",
      content,
      imageUrls: images,
      reactions: [],
      editedAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
      receiptStatus: "sent",
    };
    setPending((x) => [...x, temp]);
    const imgs = images;
    const rep = reply?.id;
    setText("");
    clearTicketComposerDraft(t.id);
    setImages([]);
    setReply(null);
    typingAt.current = 0;
    void sendTyping(token, t.id, true);
    const r = await sendMessage(token, t.id, content, imgs, rep);
    if (!r.ok) {
      setPending((x) => x.filter((m) => m.id !== temp.id));
      setText(content);
      setImages(imgs);
      return setErr(r.message);
    }
    reload();
  };

  const run = async (pr: Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setErr("");
    const r = await pr;
    setBusy(false);
    if (!r.ok) setErr((r as { message: string }).message);
    reload();
  };

  const reactTo = async (messageId: string, emoji: string) => {
    if (!token) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue("react", { scope: "ticket", ticketId: t.id, messageId, emoji });
      showToast(OFFLINE_TOAST_REACT);
      return;
    }
    setBusy(true);
    setErr("");
    const r = await react(token, t.id, messageId, emoji);
    setBusy(false);
    if (!r.ok && isOfflineApiFailure(undefined, r.message)) {
      enqueue("react", { scope: "ticket", ticketId: t.id, messageId, emoji });
      showToast(OFFLINE_TOAST_REACT);
      return;
    }
    if (!r.ok) setErr(r.message || "Reazione non riuscita.");
    reload();
  };

  const closed = t.status === "closed";

  const copyText = async (value: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      return true;
    } catch {
      return false;
    }
  };

  const copyTicketLink = async () => {
    const url = ticketShareUrl(t.id, staffView);
    if (!url) return;
    if (await copyText(url)) showToast(tr("tickets.linkCopied"), false, { ms: 1600 });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* testata: lo scontrino del ticket */}
      <div className="shrink-0 border-b border-dashed border-sand/20 bg-roast/60 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Torna alla lista" className="-ml-1 rounded-full p-1.5 text-crema/60 hover:bg-crema/8 hover:text-crema lg:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{t.displayName}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-crema/50">
              <span className="font-mono lining-nums">#{String(t.ticketNumber ?? "").padStart(4, "0")}</span>
              <span>· {t.categoryLabel}</span>
              <span>· {closed ? "Chiuso" : t.claimedByName ? `preso in carico da ${t.claimedByName}` : "in attesa dello staff"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyTicketLink()}
            aria-label={tr("tickets.copyLink")}
            title={tr("tickets.copyLink")}
            className="shrink-0 rounded-full p-2 text-crema/55 hover:bg-crema/8 hover:text-crema"
          >
            <Link2 className="size-5" />
          </button>
          {p && <TicketActions token={token} ticket={t} categories={categories} onDone={reload} onError={setErr} />}
        </div>
      </div>

      {/* messaggi */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6">
        <ul className="space-y-4">
          {messages.map((m) => {
            const mine = m.authorId === me;
            const canDelete = !closed && m.authorKind !== "system" && (mine || !!p?.isHighStaff);
            return (
              <Bubble
                key={m.id}
                m={m}
                mine={mine}
                names={names}
                roleNames={roleNames}
                channelNames={channelNames}
                canReact={!closed && !!p?.canReply}
                canEdit={!closed && mine && !!p?.canReply}
                canDelete={canDelete}
                onReply={() => setReply(m)}
                onReact={(e) => void reactTo(m.id, e)}
                onEdit={() => (setEditing(m), setText(m.content))}
                onDelete={async () => {
                  if (!(await confirmDialog({ message: "Eliminare questo messaggio?", danger: true }))) return;
                  run(deleteMessage(token, t.id, m.id));
                }}
                onCopy={() => void copyText(m.content)}
              />
            );
          })}
        </ul>
        {typing.length > 0 && (
          <p className="mt-3 flex items-center gap-2 px-11 text-xs text-crema/50">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-crema/50" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </span>
            {typing[0]} sta scrivendo…
          </p>
        )}
      </div>

      {/* avvisi */}
      {t.closeRequestedAt && !closed && (
        <div className="mx-3 mb-3 rounded-2xl bg-caramel/12 p-4 ring-1 ring-caramel/30 sm:mx-6">
          <p className="text-sm text-crema/85">
            <strong className="text-crema">{t.closeRequestedByName ?? "Lo staff"}</strong> ha chiesto di chiudere il ticket{t.closeRequestReason ? `: ${t.closeRequestReason}` : "."}
          </p>
          {p?.canRespondCloseRequest && (
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={() => run(acceptClose(token, t.id))} className="rounded-full bg-crema px-4 py-1.5 text-sm font-semibold text-espresso">
                Accetta la chiusura
              </button>
              <button type="button" disabled={busy} onClick={() => run(rejectClose(token, t.id))} className="rounded-full px-4 py-1.5 text-sm font-semibold text-crema/70 hover:bg-crema/8">
                Rifiuta
              </button>
            </div>
          )}
        </div>
      )}

      {closed ? (
        <div className="border-t border-sand/10 bg-roast/60 p-4 sm:p-6">
          <p className="flex items-center gap-2 text-sm text-crema/60">
            <Lock className="size-4" /> Ticket chiuso{t.closedByName ? ` da ${t.closedByName}` : ""}
            {t.closeReason ? ` · ${t.closeReason}` : ""}
          </p>
          {p?.canRate ? (
            <div className="mt-4 rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-caramel/25">
              <p className="font-display text-xl font-semibold">Com’è andata?</p>
              <div className="mt-3 flex flex-wrap gap-6">
                <Stars label="Il ticket" value={rt} set={setRt} />
                <Stars label={t.rateableStafferName ?? "Lo staffer"} value={rs} set={setRs} />
              </div>
              <button type="button" disabled={busy || !rt || !rs} onClick={() => run(rate(token, t.id, rt, rs))} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2 text-sm font-semibold text-ink disabled:opacity-40">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />} Invia la valutazione
              </button>
            </div>
          ) : t.ratingTicketScore ? (
            <p className="mt-2 text-sm text-crema/50 lining-nums">
              Valutazione: ticket {t.ratingTicketScore}/5 · staff {t.ratingStafferScore}/5
            </p>
          ) : null}
        </div>
      ) : p?.canReply ? (
        <div className="border-t border-sand/10 bg-roast/60 p-3 sm:p-4">
          {(reply || editing) && (
            <p className="mb-2 flex items-center gap-2 rounded-lg bg-crema/[0.05] px-3 py-1.5 text-xs text-crema/65">
              {editing ? <Pencil className="size-3.5" /> : <CornerUpLeft className="size-3.5" />}
              <span className="min-w-0 flex-1 truncate">{editing ? "Modifica del messaggio" : `Rispondi a ${reply!.authorName}: ${reply!.content}`}</span>
              <button type="button" aria-label="Annulla" onClick={() => (setReply(null), editing && setText(""), setEditing(null))}>
                <X className="size-3.5" />
              </button>
            </p>
          )}
          {images.length > 0 && (
            <div className="mb-2 flex gap-2">
              {images.map((src, i) => (
                <span key={i} className="relative">
                  <img src={src} alt="" className="size-14 rounded-lg object-cover" />
                  <button type="button" aria-label="Rimuovi" onClick={() => setImages((x) => x.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-crema p-0.5 text-espresso">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2">
            {!editing && (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Allega immagini" className="rounded-full p-2.5 text-crema/55 hover:bg-crema/8 hover:text-crema">
                <ImagePlus className="size-5" />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            <div className="relative min-w-0 flex-1">
              {!editing && (
                <ComposerSuggest
                  token={token}
                  ticketId={t.id}
                  text={text}
                  caret={caret}
                  canUseCommands={!!p?.canUseCommands}
                  textarea={taRef.current}
                  onRememberName={rememberName}
                  onPick={(pick, from, to) => applySuggest(pick, from, to)}
                />
              )}
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => onType(e.target.value, e.target)}
                onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                onKeyDown={(e) => {
                  // ComposerSuggest fa preventDefault su Enter/Tab quando sceglie dal menu
                  onComposerEnterSend(e, () => void send());
                }}
                rows={1}
                placeholder={p?.canUseCommands ? "Messaggio… @ menzioni, # canali, + o / comandi" : "Scrivi un messaggio… (@ e # per menzioni)"}
                className="max-h-40 min-h-11 w-full resize-none rounded-2xl bg-espresso/70 px-4 py-2.5 leading-relaxed outline-none ring-1 ring-sand/15 [field-sizing:content] placeholder:text-crema/30 focus:ring-caramel/60"
              />
            </div>
            <button type="button" onClick={send} disabled={busy || (!text.trim() && !images.length)} aria-label="Invia" className="rounded-full bg-gradient-to-r from-caramel to-ember p-3 text-ink disabled:opacity-40">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
        </div>
      ) : (
        <div className="border-t border-sand/10 bg-roast/60 p-4 text-sm text-crema/50">
          {p?.canClaim ? "Devi claimare il ticket prima di scrivere." : p?.isStaffViewer && t.claimedBy ? "Ticket in carico a un altro staff. Non puoi scrivere." : "Non puoi scrivere in questo ticket."}
          {err && <p className="mt-2 text-xs text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
        </div>
      )}
    </div>
  );
}
