"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { cleanRoleName, loadRequestStates, loadRoles, type CustomRole, type RequestState, type RolesData } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Pagination, pageSlice } from "@/components/ui/Pagination";
import { Highlight, norm } from "../Highlight";
import { Avatar } from "../Avatar";
import { RoleDisc } from "./RoleDisc";
import { RoleSheet } from "./RoleSheet";

const PAGE_SIZE = 12;

type Sort = "members" | "recent" | "az";
const SORTS: { id: Sort; label: string }[] = [
  { id: "members", label: "Più membri" },
  { id: "recent", label: "Più recenti" },
  { id: "az", label: "A–Z" },
];

function RoleCard({ role, query, tag, onOpen, i }: { role: CustomRole; query: string; tag: "creatore" | "membro" | null; onOpen: () => void; i: number }) {
  const shown = role.members.slice(0, 5);
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onOpen}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover="hover"
      className={cn("group relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-mocha/70 to-roast p-4 text-left ring-1 transition-colors sm:p-5", tag ? "ring-caramel/40" : "ring-sand/12 hover:ring-sand/30")}
    >
      {/* bagliore nel colore del ruolo */}
      <span className="pointer-events-none absolute -left-10 top-1/2 size-32 -translate-y-1/2 rounded-full opacity-25 blur-2xl" style={{ background: role.roleColor }} />
      <motion.span variants={{ hover: { rotate: 120 } }} transition={{ duration: 1.2, ease: "easeInOut" }} className="relative shrink-0">
        <RoleDisc role={role} className="size-20 text-xl" />
      </motion.span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate font-display text-xl font-semibold" style={{ color: `color-mix(in oklab, ${role.roleColor} 40%, #f4e9d8)` }}>
          <Highlight text={cleanRoleName(role.roleName)} query={query} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-crema/50">
          di <Highlight text={role.ownerDisplayName} query={query} />
        </span>
        <span className="mt-2.5 flex items-center gap-2">
          <span className="flex items-center -space-x-2">
            {shown.map((m) => (
              <Avatar
                key={m.userId}
                userId={m.userId}
                src={m.avatarUrl}
                name={m.displayName}
                className="relative z-0 size-6 bg-transparent text-[0.6rem] ring-2 ring-roast hover:z-10"
              />
            ))}
          </span>
          <span className="text-xs text-crema/45">
            {role.memberCount} {role.memberCount === 1 ? "membro" : "membri"}
          </span>
          {tag && (
            <span
              className={cn(
                "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider ring-1",
                tag === "creatore" ? "bg-ember/20 text-ember ring-ember/35" : "bg-crema/10 text-crema/80 ring-sand/25",
              )}
            >
              {tag}
            </span>
          )}
        </span>
      </span>
    </motion.button>
  );
}

export function RolesBrowser({ initial }: { initial: RolesData | null }) {
  const { user, token, login, ready } = useAuth();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("members");
  const [pageNum, setPageNum] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, RequestState>>({});
  const [round, setRound] = useState(0);

  const refresh = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    loadRoles().then((d) => alive && d && setData(d));
    return () => {
      alive = false;
    };
  }, [round]);

  useEffect(() => {
    if (!ready || !token) return;
    let alive = true;
    loadRequestStates(token).then((s) => alive && setStates(s));
    return () => {
      alive = false;
    };
  }, [ready, token, round]);

  // /ruoli/#<roleId> apre direttamente il ruolo
  useEffect(() => {
    const id = location.hash.slice(1);
    if (/^\d{17,22}$/.test(id)) setOpenId(id);
  }, []);

  const rows = data?.rows ?? [];
  const list = useMemo(() => {
    const q = norm(query.trim());
    const out = q
      ? rows.filter((r) => norm(`${r.roleName} ${r.ownerDisplayName} ${r.members.map((m) => m.displayName).join(" ")}`).includes(q))
      : [...rows];
    if (sort === "members") out.sort((a, b) => b.memberCount - a.memberCount);
    else if (sort === "recent") out.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    else out.sort((a, b) => cleanRoleName(a.roleName).localeCompare(cleanRoleName(b.roleName), "it"));
    return out;
  }, [rows, query, sort]);

  const { page: pageSafe, totalPages, slice } = pageSlice(list, pageNum, PAGE_SIZE);
  const open = rows.find((r) => r.roleId === openId) ?? null;
  const s = data?.summary;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16">
      {/* numeri */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { n: s?.totalRoles ?? rows.length, l: "ruoli creati" },
          { n: s?.totalAssignments ?? 0, l: "assegnazioni" },
        ].map((x) => (
          <div key={x.l} className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-4 text-center ring-1 ring-sand/12 sm:p-5">
            <p className="font-display text-3xl font-semibold lining-nums sm:text-4xl">{x.n}</p>
            <p className="mt-1 text-xs text-crema/50 sm:text-sm">{x.l}</p>
          </div>
        ))}
      </div>

      {/* ricerca + ordine */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-crema/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPageNum(1);
            }}
            placeholder="Cerca un ruolo o un utente…"
            aria-label="Cerca un ruolo o un utente"
            className="w-full rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast py-3.5 pl-14 pr-12 text-crema ring-1 ring-sand/15 placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/60 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPageNum(1);
              }}
              aria-label="Cancella ricerca"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/50 hover:bg-crema/10 hover:text-crema"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {SORTS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setSort(x.id);
                setPageNum(1);
              }}
              className={cn("rounded-full px-3.5 py-2 text-sm ring-1 transition-colors", sort === x.id ? "bg-crema/12 text-crema ring-sand/30" : "text-crema/55 ring-sand/12 hover:text-crema")}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* i dischi */}
      <div id="roles-list" className="mt-6 grid scroll-mt-28 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((r, i) => {
          const tag = !user ? null : r.ownerId === user.id ? "creatore" : r.members.some((m) => m.userId === user.id) ? "membro" : null;
          return <RoleCard key={r.roleId} role={r} i={i} query={query} tag={tag} onOpen={() => setOpenId(r.roleId)} />;
        })}
      </div>
      {list.length === 0 && (
        <p className="mt-6 rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast px-6 py-12 text-center text-crema/55 ring-1 ring-sand/12">
          {rows.length ? `Nessun ruolo trovato per “${query}”.` : "Ancora nessun ruolo personalizzato."}
        </p>
      )}
      <Pagination page={pageSafe} totalPages={totalPages} onChange={setPageNum} scrollToId="roles-list" />

      <p className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-crema/50">
        <span>Vuoi crearne uno?</span>
        <a href={page("/personalizza/")} className="rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition-colors hover:bg-crema/12">
          Personalizza
        </a>
        <span>o leggi i</span>
        <a href={page("/perks/")} className="rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition-colors hover:bg-crema/12">
          Perks
        </a>
      </p>

      <AnimatePresence>
        {open && (
          <RoleSheet
            key={open.roleId}
            role={open}
            userId={user?.id}
            token={token}
            reqState={states[open.roleId]}
            onClose={() => setOpenId(null)}
            onLogin={login}
            onChanged={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
