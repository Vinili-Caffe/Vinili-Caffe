"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, FolderInput, Hand, Loader2, Lock, LogOut, MoreVertical, PenLine, Search, UserMinus, UserPlus, X, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  addMember,
  claim,
  closeTicket,
  removeMember,
  rename,
  requestClose,
  searchUsers,
  setCategory,
  transfer,
  unclaim,
  type Category,
  type Ticket,
  type UserHit,
} from "@/lib/tickets";
import { cn } from "@/lib/cn";
import { EmojiText } from "@/components/discord/EmojiText";

type Dialog = "close" | "close-request" | "transfer" | "add-user" | "remove-user" | "rename" | "category";

const TITLES: Record<Dialog, { title: string; text: string }> = {
  close: { title: "Chiudi ticket", text: "Vuoi chiudere questo ticket?" },
  "close-request": { title: "Richiedi chiusura", text: "L’utente potrà accettare o rifiutare. Il motivo è opzionale." },
  transfer: { title: "Trasferisci claim", text: "Scegli uno staffer che può gestire questa categoria." },
  "add-user": { title: "Aggiungi utente", text: "Cerca e scegli chi aggiungere a questo ticket." },
  "remove-user": { title: "Rimuovi utente", text: "Scegli chi togliere dal ticket." },
  rename: { title: "Rinomina ticket", text: "Come su Discord: resta la categoria, cambia solo lo username." },
  category: { title: "Cambia categoria", text: "Scegli la nuova categoria del ticket." },
};

function UserPicker({ token, ticket, mode, onPick }: { token: string; ticket: Ticket; mode: "transfer" | "add-user"; onPick: (u: UserHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      searchUsers(token, ticket.id, q, mode === "transfer" ? { claimEligible: true } : { guildSearch: true }).then(setHits);
    }, 250);
    return () => clearTimeout(id);
  }, [q, token, ticket.id, mode]);
  return (
    <div>
      <label htmlFor="ticket-member-search" className="flex items-center gap-2 rounded-xl bg-espresso/70 px-3 ring-1 ring-sand/15 focus-within:ring-caramel/60">
        <Search className="size-4 text-crema/40" />
        <input id="ticket-member-search" name="ticket-member-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome…" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-crema/35" />
      </label>
      <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        {hits === null && <li className="py-3 text-center text-sm text-crema/45">Cerco…</li>}
        {hits?.length === 0 && <li className="py-3 text-center text-sm text-crema/45">Nessun risultato.</li>}
        {hits?.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => onPick(u)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-crema/[0.06]">
              <Avatar userId={u.id} src={u.avatarUrl} name={u.name} className="size-8 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{u.name}</span>
                {u.username && <span className="block truncate text-xs text-crema/45">@{u.username}</span>}
              </span>
              {u.roleName && <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wider text-caramel">{u.roleName}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Menu ⋮ con le azioni che i permessi del bot concedono per questo ticket. */
export function TicketActions({ token, ticket, categories = [], onDone, onError }: { token: string; ticket: Ticket; categories?: Category[]; onDone: () => void; onError: (m: string) => void }) {
  const p = ticket.permissions!;
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [menu]);

  const run = async (pr: Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setErr("");
    const r = await pr;
    setBusy(false);
    if (!r.ok) {
      setErr((r as { message: string }).message);
      onError((r as { message: string }).message);
      return;
    }
    setDialog(null);
    setMenu(false);
    setText("");
    onDone();
  };

  const items: { key: string; label: string; icon: LucideIcon; show: boolean; danger?: boolean; onClick: () => void }[] = [
    { key: "claim", label: "Claim", icon: Hand, show: p.canClaim, onClick: () => run(claim(token, ticket.id)) },
    { key: "unclaim", label: "Rilascia il claim", icon: LogOut, show: p.canUnclaim, onClick: () => run(unclaim(token, ticket.id)) },
    { key: "transfer", label: "Trasferisci claim", icon: ArrowRightLeft, show: p.canTransfer, onClick: () => setDialog("transfer") },
    { key: "add", label: "Aggiungi utente", icon: UserPlus, show: p.canAddUsers, onClick: () => setDialog("add-user") },
    { key: "remove", label: "Rimuovi utente", icon: UserMinus, show: p.canRemoveUsers && ticket.addedUsers.length > 0, onClick: () => setDialog("remove-user") },
    { key: "rename", label: "Rinomina", icon: PenLine, show: p.canRename, onClick: () => (setText(ticket.renameTail ?? ""), setDialog("rename")) },
    { key: "category", label: "Cambia categoria", icon: FolderInput, show: p.canSwitchCategory && categories.length > 1, onClick: () => setDialog("category") },
    { key: "close-request", label: "Richiedi chiusura", icon: Lock, show: p.canCloseRequest && !ticket.closeRequestedAt, onClick: () => setDialog("close-request") },
    { key: "close", label: "Chiudi ticket", icon: Lock, show: p.canClose, danger: true, onClick: () => setDialog("close") },
  ];
  const visible = items.filter((i) => i.show);
  if (!visible.length) return null;

  // un solo pulsante principale visibile: il claim, se disponibile
  const primary = p.canClaim ? visible.find((i) => i.key === "claim") : null;

  return (
    <div ref={box} className="relative flex shrink-0 items-center gap-1">
      {primary && (
        <button type="button" disabled={busy} onClick={primary.onClick} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-3.5 py-1.5 text-sm font-semibold text-ink disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />} Claim
        </button>
      )}
      <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Azioni del ticket" aria-expanded={menu} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema">
        <MoreVertical className="size-5" />
      </button>
      <AnimatePresence>
        {menu && (
          <motion.ul
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="absolute right-0 top-full z-30 mt-2 w-60 origin-top-right rounded-2xl bg-roast/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            {visible.map((i) => (
              <li key={i.key}>
                <button type="button" onClick={() => (i.onClick(), setMenu(false))} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-crema/8", i.danger ? "text-[#f0a493] light:text-[#a83a2c]" : "text-crema/85")}>
                  <i.icon className="size-4" /> {i.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialog && (
          <motion.div className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Chiudi" onClick={() => !busy && setDialog(null)} className="absolute inset-0 bg-black/75" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={TITLES[dialog].title}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="relative w-full max-w-md rounded-t-3xl bg-roast p-6 shadow-2xl ring-1 ring-sand/15 sm:rounded-3xl"
            >
              <button type="button" onClick={() => setDialog(null)} aria-label="Chiudi" className="absolute right-4 top-4 rounded-full p-1.5 text-crema/50 hover:bg-crema/8 hover:text-crema">
                <X className="size-5" />
              </button>
              <p className="font-display text-2xl font-semibold">{TITLES[dialog].title}</p>
              <p className="mt-1 text-sm text-crema/60">{TITLES[dialog].text}</p>
              <div className="mt-5">
                {(dialog === "close" || dialog === "close-request") && (
                  <>
                    <textarea name="close-reason"
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, dialog === "close" ? 500 : 1800))}
                      rows={3}
                      placeholder={dialog === "close" ? "Motivo chiusura (opzionale)" : "Motivo (opzionale)"}
                      className="w-full resize-none rounded-xl bg-espresso/70 p-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/60"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(dialog === "close" ? closeTicket(token, ticket.id, text.trim()) : requestClose(token, ticket.id, text.trim()))}
                      className={cn("mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold disabled:opacity-60", dialog === "close" ? "bg-[#a83a2c] text-crema" : "bg-crema text-espresso")}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} {dialog === "close" ? "Chiudi" : "Richiedi chiusura"}
                    </button>
                  </>
                )}
                {(dialog === "transfer" || dialog === "add-user") && (
                  <UserPicker token={token} ticket={ticket} mode={dialog} onPick={(u) => run(dialog === "transfer" ? transfer(token, ticket.id, u.id) : addMember(token, ticket.id, u.id))} />
                )}
                {dialog === "remove-user" && (
                  <ul className="space-y-1">
                    {ticket.addedUsers.map((u) => (
                      <li key={u.id}>
                        <button type="button" disabled={busy} onClick={() => run(removeMember(token, ticket.id, u.id))} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#a83a2c]/15">
                          <Avatar userId={u.id} src={u.avatarUrl} name={u.name ?? u.id} className="size-8 text-xs" />
                          <span className="flex-1 truncate text-sm font-semibold">{u.name ?? u.id}</span>
                          <UserMinus className="size-4 text-[#f0a493] light:text-[#a83a2c]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {dialog === "rename" && (
                  <>
                    <input name="ticket-name" value={text} onChange={(e) => setText(e.target.value.slice(0, 120))} className="w-full rounded-xl bg-espresso/70 px-3 py-2.5 outline-none ring-1 ring-sand/15 focus:ring-caramel/60" />
                    <button type="button" disabled={busy || !text.trim()} onClick={() => run(rename(token, ticket.id, text.trim()))} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-crema px-5 py-3 font-semibold text-espresso disabled:opacity-50">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />} Rinomina
                    </button>
                  </>
                )}
                {dialog === "category" && (
                  <ul className="space-y-1.5">
                    {categories.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={busy || c.id === ticket.category}
                          onClick={() => run(setCategory(token, ticket.id, c.id))}
                          className="w-full rounded-xl px-3 py-2.5 text-left ring-1 ring-sand/12 hover:ring-caramel/40 disabled:opacity-45"
                        >
                          <span className="block font-semibold"><EmojiText text={c.label} /></span>
                          <span className="block text-xs text-crema/50"><EmojiText text={c.description} /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {err && <p className="mt-4 rounded-xl bg-[#a83a2c]/15 px-3 py-2 text-sm text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
