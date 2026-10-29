"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, UserMinus, UserPlus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { cn } from "@/lib/cn";
import {
  CHAT_CONTENT_MAX,
  loadWorkflowChat,
  postWorkflowChat,
  postWorkflowChatSubject,
  type WorkflowChatMessage,
  type WorkflowChatPayload,
} from "@/lib/staffWorkflowChat";

/** Chat pratica collegata a un dedupeKey workflow (staff + richiedente invitato). */
export function WorkflowChatPanel({ token, dedupeKey }: { token: string; dedupeKey: string }) {
  const [data, setData] = useState<WorkflowChatPayload | null>(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [subjectBusy, setSubjectBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dedupeKey) return;
    let alive = true;
    loadWorkflowChat(token, dedupeKey).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setData(null);
        return;
      }
      setData(r.data);
      setErr("");
    });
    return () => {
      alive = false;
    };
  }, [token, dedupeKey, tick]);

  useEffect(() => {
    if (!dedupeKey) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 12_000);
    return () => window.clearInterval(t);
  }, [dedupeKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim().slice(0, CHAT_CONTENT_MAX);
    if (!content || busy || !data?.canSend) return;
    setBusy(true);
    setErr("");
    const r = await postWorkflowChat(token, { dedupeKey, content });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setText("");
    setTick((n) => n + 1);
  }

  async function subjectAction(action: "invite" | "remove") {
    if (!dedupeKey || subjectBusy) return;
    setSubjectBusy(true);
    setErr("");
    setInfo("");
    const r = await postWorkflowChatSubject(token, { dedupeKey, action });
    setSubjectBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setInfo(String(r.data.message || (action === "invite" ? "Richiedente aggiunto." : "Richiedente rimosso.")).trim());
    if (r.data.subjectChat && data) {
      setData({ ...data, subjectChat: r.data.subjectChat, canSend: data.isStaffReviewer ? data.canSend : Boolean(r.data.subjectChat.active) });
    }
    setTick((n) => n + 1);
  }

  if (!dedupeKey) return null;
  if (err && !data) return <p className="text-sm text-ember">{err}</p>;
  if (!data) return <div className="h-32 animate-pulse rounded-2xl bg-crema/6" />;

  const messages: WorkflowChatMessage[] = data.messages || [];
  const sc = data.subjectChat;
  const showInviteBar = Boolean(data.isStaffReviewer && sc?.inviteOnly && (sc.canInvite || sc.canRemove || sc.active || sc.invited));

  return (
    <div className="flex max-h-[28rem] flex-col rounded-2xl bg-espresso/40 ring-1 ring-sand/12">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand/10 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-crema/45">
          Chat pratica {data.status ? `· ${data.status}` : ""}
          {sc?.active ? <span className="ml-1.5 text-emerald-300/90">· richiedente in chat</span> : null}
        </p>
        {showInviteBar ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {sc?.canInvite ? (
              <button
                type="button"
                disabled={subjectBusy}
                onClick={() => void subjectAction("invite")}
                className="inline-flex items-center gap-1 rounded-full bg-caramel/20 px-2.5 py-1 text-[0.7rem] font-semibold text-ember ring-1 ring-caramel/35 hover:bg-caramel/30 disabled:opacity-50"
              >
                {subjectBusy ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
                Aggiungi richiedente
              </button>
            ) : null}
            {sc?.canRemove ? (
              <button
                type="button"
                disabled={subjectBusy}
                onClick={() => void subjectAction("remove")}
                className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-2.5 py-1 text-[0.7rem] font-semibold text-crema/70 ring-1 ring-sand/20 hover:bg-crema/12 disabled:opacity-50"
              >
                {subjectBusy ? <Loader2 className="size-3 animate-spin" /> : <UserMinus className="size-3" />}
                Rimuovi richiedente
              </button>
            ) : null}
            {!sc?.canInvite && !sc?.canRemove && sc?.active ? (
              <span className="text-[0.65rem] text-crema/40">Richiedente in discussione</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.map((m) => {
          const mine = m.authorId && m.authorId === data.viewerId;
          const system = m.authorKind === "system";
          return (
            <div
              key={m.id}
              className={cn("flex min-w-0 gap-2", mine ? "flex-row-reverse" : "", system ? "justify-center" : "")}
            >
              {!system ? (
                <Avatar userId={m.authorId} src={m.authorAvatarUrl} name={m.authorName || "?"} className="size-7 shrink-0 text-[0.55rem]" />
              ) : null}
              <div
                className={cn(
                  "min-w-0 max-w-[min(85%,100%)] rounded-2xl px-3 py-2 text-sm",
                  system
                    ? "bg-crema/5 text-center text-crema/45"
                    : mine
                      ? "bg-caramel/20 text-crema ring-1 ring-caramel/25"
                      : "bg-roast/80 text-crema ring-1 ring-sand/12",
                )}
              >
                {!system ? (
                  <p className="min-w-0 break-words text-[0.65rem] font-semibold text-crema/50">
                    {m.authorName}
                    {m.authorRoleLabel ? ` · ${m.authorRoleLabel}` : ""}
                  </p>
                ) : null}
                <DiscordContent text={m.content || ""} className="min-w-0" />
                {(m.imageUrls || []).length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5" data-vc-lightbox-gallery>
                    {(m.imageUrls || []).map((url) => (
                      <a key={url} href={url} data-vc-lightbox className="block overflow-hidden rounded-lg">
                        <img src={url} alt="" className="max-h-40 object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {!messages.length ? <p className="text-center text-sm text-crema/40">Nessun messaggio ancora.</p> : null}
        <div ref={bottomRef} />
      </div>

      {info ? <p className="px-3 text-xs text-emerald-300/90">{info}</p> : null}
      {err ? <p className="px-3 text-xs text-ember">{err}</p> : null}

      {data.canSend ? (
        <form onSubmit={send} className="flex gap-2 border-t border-sand/10 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CHAT_CONTENT_MAX}
            placeholder="Scrivi un messaggio…"
            className="min-w-0 flex-1 rounded-xl bg-roast/60 px-3 py-2 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/40"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-r from-caramel to-ember text-ink disabled:opacity-40"
            aria-label="Invia"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      ) : data.isSubject && sc?.inviteOnly && !sc.active ? (
        <p className="border-t border-sand/10 px-3 py-2 text-xs text-crema/40">
          Sei stato rimosso dalla discussione oppure non sei ancora in chat.
        </p>
      ) : (
        <p className="border-t border-sand/10 px-3 py-2 text-xs text-crema/40">Pratica chiusa: sola lettura.</p>
      )}
    </div>
  );
}
