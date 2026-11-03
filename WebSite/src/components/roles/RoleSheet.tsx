"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { Clock, Crown, Hourglass, Loader2, LogIn, LogOut, Send, X } from "lucide-react";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { cleanRoleName, leaveRole, requestRole, REASON_MAX, REASON_MIN, type CustomRole, type RequestState } from "@/lib/roles";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Avatar } from "../Avatar";
import { RoleDisc } from "./RoleDisc";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

/** Scheda del ruolo (pannello a comparsa): membri + richiedi/lascia. */
export function RoleSheet({
  role,
  userId,
  token,
  reqState,
  onClose,
  onLogin,
  onChanged,
}: {
  role: CustomRole;
  userId?: string;
  token: string | null;
  reqState?: RequestState;
  onClose: () => void;
  onLogin: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isOwner = !!userId && role.ownerId === userId;
  const isMember = !!userId && role.members.some((m) => m.userId === userId);
  const pending = reqState?.status === "pending";
  const cooldown = reqState?.status === "cooldown" && reqState.cooldownUntil && new Date(reqState.cooldownUntil).getTime() > Date.now();

  const chromeId = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    setChromeOpen(`role-sheet-${chromeId}`, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      setChromeOpen(`role-sheet-${chromeId}`, false);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, chromeId]);

  const send = async () => {
    if (!token || reason.trim().length < REASON_MIN) return;
    setBusy(true);
    const res = await requestRole(token, role.roleId, reason.trim());
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Richiesta inviata! Il creatore del ruolo riceverà la tua domanda." : res.message });
    if (res.ok) {
      setReason("");
      onChanged();
    }
  };

  const leave = async () => {
    if (!token) return;
    setBusy(true);
    const res = await leaveRole(token, role.roleId);
    setBusy(false);
    setConfirmLeave(false);
    setMsg({ ok: res.ok, text: res.ok ? "Hai lasciato il ruolo." : res.message });
    if (res.ok) onChanged();
  };

  const members = [...role.members].sort((a, b) => Number(!!b.isOwner) - Number(!!a.isOwner));

  return (
    <motion.div className="fixed inset-0 z-[80] flex justify-end overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-espresso/80" />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={cleanRoleName(role.roleName)}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-roast shadow-[-30px_0_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-sand/15"
      >
        <div className="sticky top-0 z-10 flex justify-end bg-gradient-to-b from-roast to-transparent p-4">
          <button type="button" onClick={onClose} aria-label="Chiudi" className="rounded-full bg-crema/8 p-2 ring-1 ring-sand/15 hover:bg-crema/15">
            <X className="size-5" />
          </button>
        </div>
        <div className="-mt-6 px-6 pb-8">
          <motion.div initial={{ rotate: -40, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}>
            <RoleDisc role={role} className="mx-auto size-44 text-3xl" eager />
          </motion.div>
          <h2 className="mt-5 text-center font-display text-3xl font-semibold" style={{ color: `color-mix(in oklab, ${role.roleColor} 45%, #f4e9d8)` }}>
            {cleanRoleName(role.roleName)}
          </h2>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-crema/55">
            <span className="inline-flex items-center gap-1.5">
              <Crown className="size-4 text-caramel" /> di {role.ownerDisplayName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {role.isPermanent ? <Clock className="size-4" /> : <Hourglass className="size-4" />}
              {role.isPermanent ? `dal ${fmtDate(role.createdAt)}` : role.expiresAt ? `scade il ${fmtDate(role.expiresAt)}` : "temporaneo"}
            </span>
          </p>

          {/* azioni */}
          <div className="mt-6 rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/12">
            {!token ? (
              <button type="button" onClick={onLogin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865f2] py-3 text-sm font-semibold text-white">
                <LogIn className="size-4" /> Accedi per richiedere il ruolo
              </button>
            ) : isOwner ? (
              <p className="text-center text-sm text-crema/65">È un ruolo creato da te: lo gestisci da Personalizza.</p>
            ) : isMember ? (
              confirmLeave ? (
                <div className="flex items-center justify-center gap-3 text-sm">
                  <span className="text-crema/70">Lasciare davvero il ruolo?</span>
                  <button type="button" onClick={leave} disabled={busy} className="font-semibold text-red-300 hover:underline">
                    Sì, lascia
                  </button>
                  <button type="button" onClick={() => setConfirmLeave(false)} className="text-crema/60">
                    No
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmLeave(true)} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-crema/75 ring-1 ring-sand/20 hover:text-red-300">
                  <LogOut className="size-4" /> Hai questo ruolo · lascialo
                </button>
              )
            ) : pending ? (
              <p className="text-center text-sm text-amber-200">La tua richiesta è in attesa di risposta.</p>
            ) : cooldown ? (
              <p className="text-center text-sm text-crema/65">Potrai richiederlo di nuovo dal {fmtDate(reqState!.cooldownUntil!)}.</p>
            ) : (
              <>
                <p className="text-sm font-semibold">Richiedi il ruolo</p>
                <p className="mt-1 text-xs text-crema/50">Spiega al creatore perché lo vorresti: decide lui se dartelo.</p>
                <textarea name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
                  rows={3}
                  placeholder="Perché vorresti questo ruolo?"
                  className="mt-3 w-full resize-none rounded-xl bg-espresso px-3 py-2.5 text-sm text-crema ring-1 ring-sand/15 placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/50"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className={cn("text-xs tabular-nums", reason.trim().length && reason.trim().length < REASON_MIN ? "text-amber-300" : "text-crema/40")}>
                    {reason.trim().length < REASON_MIN ? `almeno ${REASON_MIN} caratteri` : `${reason.length}/${REASON_MAX}`}
                  </span>
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || reason.trim().length < REASON_MIN}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-caramel to-[#b9773f] px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Invia
                  </button>
                </div>
              </>
            )}
            {msg && <p className={cn("mt-3 text-center text-sm", msg.ok ? "text-emerald-300" : "text-red-300")}>{msg.text}</p>}
          </div>

          {/* membri */}
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.25em] text-crema/45">
            {role.memberCount} {role.memberCount === 1 ? "membro" : "membri"}
          </p>
          <ul className="mt-3 space-y-1">
            {members.map((m) => (
              <li key={m.userId}>
                <a href={page(`/user/?id=${m.userId}`)} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-crema/[0.05]">
                  <Avatar userId={m.userId} src={m.avatarUrl} name={m.displayName} className="size-9" />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  {m.isOwner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-caramel/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ember">
                      <Crown className="size-3" /> creatore
                    </span>
                  )}
                  {m.userId === userId && !m.isOwner && <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ember">tu</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </motion.aside>
    </motion.div>
  );
}
