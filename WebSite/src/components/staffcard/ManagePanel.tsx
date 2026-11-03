"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Handshake, Loader2, UserMinus } from "lucide-react";
import { confirmDialog, showToast } from "@/components/ui";
import { cleanRole, manage, type ManageData } from "@/lib/staffCard";
import { cn } from "@/lib/cn";

type Opt = { action: string; label: string; hint: string; tone: "up" | "down" | "pm" | "out" };

/** Gestione carriera (pex/depex): mostra solo ciò che il bot permette per questo membro. */
export function ManagePanel({ token, userId, data, onDone }: { token: string; userId: string; data: ManageData; onDone: () => void }) {
  const m = data.member;
  const [pick, setPick] = useState<Opt | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!m) return <p className="text-sm text-crema/55">Nessuna azione disponibile.</p>;
  if (m.careerRankBlocked) return <p className="rounded-xl bg-crema/[0.04] p-4 text-sm text-crema/70 ring-1 ring-sand/10">{m.careerRankBlockMessage || "Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo."}</p>;

  const has = (a: string) => data.actions.includes(a);
  const opts: Opt[] = [];
  if (m.canPex && has("pex") && m.pexTargetLabel) opts.push({ action: "pex", label: `Pex a ${cleanRole(m.pexTargetLabel)}`, hint: `Da ${cleanRole(m.ladderRoleLabel) || "Member"}`, tone: "up" });
  for (const c of m.prospectPexChoices ?? []) if (has(c.id)) opts.push({ action: c.id, label: `Pex a ${cleanRole(c.label)}`, hint: "Nuovo in staff", tone: "up" });
  if (m.canPexPm && has("pex_pm") && !m.isPm) opts.push({ action: "pex_pm", label: "Pex a Partner Manager", hint: "Aggiunge il ruolo Partner Manager", tone: "pm" });
  if (m.canDepexLadder && has("depex") && m.depexTargetLabel) opts.push({ action: "depex", label: `Depex a ${cleanRole(m.depexTargetLabel)}`, hint: `Da ${cleanRole(m.ladderRoleLabel)}`, tone: "down" });
  if (m.canDepexPm && has("depex_pm")) opts.push({ action: "depex_pm", label: "Togli Partner Manager", hint: "Rimuove il ruolo Partner Manager", tone: "down" });
  if (m.canDepexFull && has("depex_full")) opts.push({ action: "depex_full", label: `Depex a ${cleanRole(m.memberRoleLabel) || "Member"}`, hint: "Esce dallo staff", tone: "out" });

  if (!opts.length) return <p className="text-sm text-crema/55">Nessuna opzione di pex disponibile.</p>;

  const submit = async () => {
    if (!pick) return;
    if (reason.trim().length < 3) return showToast("Serve un motivo di almeno 3 caratteri.", true);
    if (!(await confirmDialog({ title: `${pick.label}?`, message: reason.trim(), danger: pick.tone !== "up" && pick.tone !== "pm", confirmLabel: "Conferma" }))) return;
    setBusy(true);
    const r = await manage(token, { action: pick.action, userId, reason: reason.trim() });
    setBusy(false);
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Operazione completata.");
    setPick(null);
    setReason("");
    onDone();
  };

  const icon = (t: Opt["tone"]) => (t === "up" ? <ArrowUpCircle className="size-5" /> : t === "pm" ? <Handshake className="size-5" /> : t === "out" ? <UserMinus className="size-5" /> : <ArrowDownCircle className="size-5" />);

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        {opts.map((o) => (
          <button
            key={o.action}
            type="button"
            aria-pressed={pick?.action === o.action}
            onClick={() => setPick(o)}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
              pick?.action === o.action ? "bg-caramel/15 ring-caramel/50" : "bg-crema/[0.04] ring-sand/12 hover:ring-sand/30",
            )}
          >
            <span className={cn(o.tone === "up" || o.tone === "pm" ? "text-[#9fd3ac] light:text-[#2f6b3f]" : "text-[#f0a493] light:text-[#a83a2c]")}>{icon(o.tone)}</span>
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-xs text-crema/50">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {pick && (
        <div>
          <label htmlFor="reason" className="block">
            <span className="text-sm font-semibold text-crema/70">Motivo</span>
            <textarea id="reason" name="reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Min. 3 caratteri…"
              className="mt-2 w-full resize-y rounded-xl bg-espresso/70 p-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-caramel/60"
            />
          </label>
          <button type="button" onClick={submit} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} {pick.label}
          </button>
        </div>
      )}
    </div>
  );
}
