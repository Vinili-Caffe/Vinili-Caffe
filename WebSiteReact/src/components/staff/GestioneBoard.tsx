"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Handshake,
  Loader2,
  Search,
  UserMinus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SmartLink } from "@/components/SmartLink";
import { confirmDialog, showToast } from "@/components/ui";
import { useStaff } from "@/components/staff/StaffShell";
import { cn } from "@/lib/cn";
import {
  ACTION_LABELS,
  loadManage,
  MANAGE_REASON_MAX,
  MANAGE_REASON_MIN,
  postManage,
  type ManageAction,
  type ManageMemberDetail,
  type ManagePayload,
  type ManageProspectChoice,
} from "@/lib/staffManage";

type CareerOpt = {
  action: string;
  label: string;
  hint: string;
  tone: "up" | "down" | "pm" | "out";
};

function cleanRole(label: string | null | undefined) {
  return String(label || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\s\-_/]/gu, "")
    .trim();
}

function buildCareerOpts(member: ManageMemberDetail, actions: string[]): CareerOpt[] {
  const has = (a: string) => actions.includes(a);
  const opts: CareerOpt[] = [];
  if (member.canPex && has("pex") && member.pexTargetLabel) {
    opts.push({
      action: "pex",
      label: `Pex a ${cleanRole(member.pexTargetLabel)}`,
      hint: `Da ${cleanRole(member.ladderRoleLabel) || "Member"}`,
      tone: "up",
    });
  }
  for (const c of member.prospectPexChoices ?? []) {
    if (has(c.id)) {
      opts.push({
        action: c.id,
        label: `Pex a ${cleanRole(c.label)}`,
        hint: "Ingresso in staff",
        tone: "up",
      });
    }
  }
  if (member.canPexPm && has("pex_pm") && !member.isPm) {
    opts.push({
      action: "pex_pm",
      label: ACTION_LABELS.pex_pm || "Pex → Partner Manager",
      hint: "Aggiunge Partner Manager",
      tone: "pm",
    });
  }
  if (member.canDepexLadder && has("depex") && member.depexTargetLabel) {
    opts.push({
      action: "depex",
      label: `Depex a ${cleanRole(member.depexTargetLabel)}`,
      hint: `Da ${cleanRole(member.ladderRoleLabel)}`,
      tone: "down",
    });
  }
  if (member.canDepexPm && has("depex_pm")) {
    opts.push({
      action: "depex_pm",
      label: ACTION_LABELS.depex_pm || "Depex Partner Manager",
      hint: "Rimuove Partner Manager",
      tone: "down",
    });
  }
  if (member.canDepexFull && has("depex_full")) {
    opts.push({
      action: "depex_full",
      label: ACTION_LABELS.depex_full || "Depex completo",
      hint: "Esce dallo staff → Member",
      tone: "out",
    });
  }
  return opts;
}

function toneIcon(tone: CareerOpt["tone"]) {
  if (tone === "up") return <ArrowUpCircle className="size-5" />;
  if (tone === "pm") return <Handshake className="size-5" />;
  if (tone === "out") return <UserMinus className="size-5" />;
  return <ArrowDownCircle className="size-5" />;
}

/** Pagina Gestione staff: roster + pex/depex (come /staff/gestione/ sul sito vecchio). */
export function GestioneBoard() {
  const { token } = useStaff();
  const [data, setData] = useState<ManagePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [pick, setPick] = useState<CareerOpt | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (userId?: string | null) => {
      setLoading(true);
      const r = await loadManage(token, { userId: userId || undefined, fresh: true });
      setLoading(false);
      if (!r.ok) {
        setError(r.message);
        setData(null);
        return;
      }
      setError("");
      setData(r.data);
      if (userId && r.data.member?.userId) setSelectedId(r.data.member.userId);
    },
    [token],
  );

  useEffect(() => {
    void reload(null);
  }, [reload]);

  const flatMembers = useMemo(() => {
    if (!data?.sections) return [];
    return data.sections.flatMap((s) =>
      s.members.map((m) => ({
        ...m,
        sectionLabel: s.roleLabel,
        sectionColor: s.color,
      })),
    );
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return flatMembers;
    return flatMembers.filter((m) => {
      const hay = `${m.displayName} ${m.username || ""} ${m.userId} ${m.sectionLabel || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [flatMembers, q]);

  const member = data?.member && selectedId && data.member.userId === selectedId ? data.member : null;
  const careerOpts = member && data ? buildCareerOpts(member, data.actions || []) : [];
  const canWrite = Boolean(data?.canManage && !data?.readOnly);

  async function selectMember(userId: string) {
    setPick(null);
    setReason("");
    setSelectedId(userId);
    setLoading(true);
    const r = await loadManage(token, { userId, roster: 0 });
    setLoading(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            member: r.data.member,
            actions: r.data.actions,
            canManage: r.data.canManage,
            readOnly: r.data.readOnly,
            pmManageOnly: r.data.pmManageOnly,
          }
        : r.data,
    );
  }

  async function lookupProspect() {
    const id = lookupId.replace(/\D/g, "").trim();
    if (!/^\d{5,32}$/.test(id)) {
      showToast("Inserisci un ID Discord valido.", true);
      return;
    }
    setLookupId(id);
    await selectMember(id);
  }

  async function submitCareer() {
    if (!pick || !selectedId) return;
    if (reason.trim().length < MANAGE_REASON_MIN) {
      showToast(`Serve un motivo di almeno ${MANAGE_REASON_MIN} caratteri.`, true);
      return;
    }
    if (
      !(await confirmDialog({
        title: `${pick.label}?`,
        message: reason.trim(),
        danger: pick.tone !== "up" && pick.tone !== "pm",
        confirmLabel: "Conferma",
      }))
    ) {
      return;
    }
    setBusy(true);
    const r = await postManage(token, {
      action: pick.action as ManageAction,
      userId: selectedId,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      showToast(r.message, true);
      return;
    }
    showToast(r.data.message || "Operazione completata.");
    setPick(null);
    setReason("");
    await reload(selectedId);
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl bg-roast/70 p-6 text-sm text-crema/70 ring-1 ring-sand/15">{error}</div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="rounded-2xl bg-roast/70 p-4 ring-1 ring-sand/15 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">Organico</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">
              {data?.counts?.total != null ? `${data.counts.total} membri` : "Staff"}
            </h3>
            {data?.counts?.onPause ? (
              <p className="text-xs text-crema/50">{data.counts.onPause} in pausa</p>
            ) : null}
          </div>
          <label className="relative block min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-crema/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca nome o ID…"
              className="w-full rounded-full bg-espresso/80 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-caramel/50"
            />
          </label>
        </div>

        {loading && !data ? (
          <div className="h-48 animate-pulse rounded-xl bg-crema/8" aria-busy="true" />
        ) : (
          <div className="max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto pr-1">
            {(data?.sections || []).map((sec) => {
              const members = sec.members.filter((m) => filtered.some((f) => f.userId === m.userId));
              if (!members.length && q.trim()) return null;
              const list = q.trim() ? members : sec.members;
              if (!list.length) return null;
              return (
                <div key={`${sec.roleId || sec.roleLabel}`}>
                  <p
                    className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: sec.color || "var(--color-caramel)" }}
                  >
                    {sec.roleLabel}
                    <span className="ml-2 text-crema/35">{list.length}</span>
                  </p>
                  <ul className="space-y-1.5">
                    {list.map((m) => {
                      const active = selectedId === m.userId;
                      return (
                        <li key={m.userId}>
                          <button
                            type="button"
                            onClick={() => void selectMember(m.userId)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition",
                              active
                                ? "bg-caramel/15 ring-caramel/45"
                                : "bg-crema/[0.03] ring-sand/10 hover:ring-sand/25",
                            )}
                          >
                            <Avatar
                              src={m.avatarUrl}
                              name={m.displayName}
                              userId={m.userId}
                              noPresence
                              className="size-9 shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-crema">{m.displayName}</span>
                              <span className="block truncate text-xs text-crema/45">
                                {m.username ? `@${m.username}` : m.userId}
                                {m.onPause ? " · pausa" : ""}
                                {m.isNew ? " · new" : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {!filtered.length ? (
              <p className="py-8 text-center text-sm text-crema/50">Nessun membro trovato.</p>
            ) : null}
          </div>
        )}

        <div className="mt-4 border-t border-sand/10 pt-4">
          <p className="mb-2 text-xs font-semibold text-crema/55">Pex da Member (ID Discord)</p>
          <div className="flex gap-2">
            <input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="ID utente Discord…"
              className="min-w-0 flex-1 rounded-full bg-espresso/80 px-4 py-2 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-caramel/50"
            />
            <button
              type="button"
              onClick={() => void lookupProspect()}
              className="shrink-0 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink"
            >
              Apri
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-roast/70 p-4 ring-1 ring-sand/15 sm:p-5">
        {!selectedId || !member ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-4 text-center">
            <Users className="size-10 text-crema/25" aria-hidden />
            <p className="mt-3 font-display text-xl text-crema/70">Seleziona un membro</p>
            <p className="mt-1 max-w-sm text-sm text-crema/45">
              Scegli dall&apos;organico oppure inserisci l&apos;ID Discord di un Member da portare in staff.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Avatar
                src={member.avatarUrl}
                name={member.displayName}
                userId={member.userId}
                noPresence
                className="size-12 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="truncate font-display text-2xl font-semibold">{member.displayName}</h3>
                <p className="text-sm text-crema/55">
                  {cleanRole(member.displayRoleLabel) || cleanRole(member.ladderRoleLabel) || "Member"}
                  {member.isPm ? " · PM" : ""}
                  {member.isProspect ? " · prospect" : ""}
                </p>
                <SmartLink
                  href={`/user/?id=${encodeURIComponent(member.userId)}&tab=staff`}
                  className="mt-1 inline-block text-xs text-caramel underline-offset-2 hover:underline"
                >
                  Apri scheda staff
                </SmartLink>
              </div>
            </div>

            {!canWrite ? (
              <p className="rounded-xl bg-crema/[0.04] p-3 text-sm text-crema/60 ring-1 ring-sand/10">
                Solo High Staff (o gestore PM sui Partner Manager) può pexare/depexare da qui.
              </p>
            ) : member.careerRankBlocked ? (
              <p className="rounded-xl bg-crema/[0.04] p-3 text-sm text-crema/60 ring-1 ring-sand/10">
                {member.careerRankBlockMessage ||
                  "Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo."}
              </p>
            ) : !careerOpts.length ? (
              <p className="text-sm text-crema/55">Nessuna opzione di pex/depex disponibile per questo utente.</p>
            ) : (
              <>
                <div className="grid gap-2">
                  {careerOpts.map((o) => (
                    <button
                      key={o.action}
                      type="button"
                      aria-pressed={pick?.action === o.action}
                      onClick={() => setPick(o)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                        pick?.action === o.action
                          ? "bg-caramel/15 ring-caramel/50"
                          : "bg-crema/[0.04] ring-sand/12 hover:ring-sand/30",
                      )}
                    >
                      <span
                        className={cn(
                          o.tone === "up" || o.tone === "pm"
                            ? "text-[#9fd3ac] light:text-[#2f6b3f]"
                            : "text-[#f0a493] light:text-[#a83a2c]",
                        )}
                      >
                        {toneIcon(o.tone)}
                      </span>
                      <span>
                        <span className="block font-semibold">{o.label}</span>
                        <span className="block text-xs text-crema/50">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {pick ? (
                  <div>
                    <label className="block">
                      <span className="text-sm font-semibold text-crema/70">Motivo</span>
                      <textarea
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, MANAGE_REASON_MAX))}
                        rows={3}
                        placeholder={`Min. ${MANAGE_REASON_MIN} caratteri…`}
                        className="mt-2 w-full resize-y rounded-xl bg-espresso/70 p-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-caramel/60"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void submitCareer()}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {pick.label}
                    </button>
                  </div>
                ) : null}
              </>
            )}

            {(member.prospectPexChoices?.length ?? 0) > 0 && canWrite ? (
              <p className="text-[0.7rem] text-crema/40">
                Scelte prospect:{" "}
                {(member.prospectPexChoices as ManageProspectChoice[]).map((c) => c.label).join(" · ")}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
