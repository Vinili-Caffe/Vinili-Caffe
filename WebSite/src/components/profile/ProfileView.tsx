"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Disc3, LogIn, RotateCcw, Trophy } from "lucide-react";
import { StaffCardView } from "@/components/staffcard/StaffCardView";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { useAuth } from "@/lib/auth";
import { isUserId, loadProfile, type ProfileResult } from "@/lib/profile";
import { page } from "@/lib/site";
import { AlbumCover } from "./AlbumCover";
import { CandyCollection, CustomStuff, RankCard, RolesList } from "./ProfileSections";
import { ProfileBoards } from "./ProfileBoards";
import { Tracklist } from "./Tracklist";

// ruoli che rendono un profilo "staff": Founder, Manager, Director, High Staff, Staff, Partner Manager
const STAFF_ROLE_IDS = new Set(["1442568886988963923", "1521562607339704442", "1502322782602530977", "1544831228690046976", "1442568910070349985", "1544831242510270464"]);
function Message({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 pt-28 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-8">{icon}</span>
      <h1 className="mt-6 font-display text-4xl font-semibold">{title}</h1>
      <p className="mt-3 leading-relaxed text-crema/60">{text}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  );
}

const ghost = "inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25 transition-colors hover:bg-crema/12";
const primary =
  "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]";

function Skeleton() {
  return (
    <div className="mx-auto grid max-w-5xl animate-pulse items-center gap-10 px-6 pb-14 pt-20 sm:pt-24 md:grid-cols-[auto_1fr]">
      <div className="mx-auto aspect-square w-56 rounded-md bg-crema/[0.06] sm:w-72 md:mr-16" />
      <div className="space-y-4">
        <div className="h-3 w-24 rounded bg-crema/10" />
        <div className="h-12 w-3/4 rounded bg-crema/10" />
        <div className="h-4 w-1/2 rounded bg-crema/[0.07]" />
        <div className="mt-8 h-1.5 w-full rounded bg-crema/[0.07]" />
      </div>
    </div>
  );
}

/** /user/?id=… — profilo di chiunque; senza id e da loggato, il tuo. */
export function ProfileView() {
  const params = useSearchParams();
  const { ready, user, token, login } = useAuth();
  const router = useRouter();
  const tab = params.get("tab") === "staff" ? "staff" : "community";
  const [staffAccess, setStaffAccess] = useState<StaffAccess | null>(null);
  const raw = params.get("id") || params.get("userId") || params.get("uid");
  const id = isUserId(raw) ? raw : ready && user ? user.id : null;
  const [res, setRes] = useState<{ id: string; r: ProfileResult } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadProfile(id, "", token || "").then((r) => alive && setRes({ id, r }));
    return () => {
      alive = false;
    };
  }, [id, retry, token]);

  // profilo condivisibile: ?id= in URL anche quando apri /user/ da loggato
  useEffect(() => {
    if (!ready || !user || !isUserId(user.id)) return;
    if (params.get("id") || params.get("userId") || params.get("uid")) return;
    router.replace(tab === "staff" ? page(`/user/?id=${user.id}&tab=staff`) : page(`/user/?id=${user.id}`), { scroll: false });
  }, [ready, user, params, tab, router]);

  // la scheda Staff compare solo a chi è staff (il bot decide cosa mostrare)
  useEffect(() => {
    if (!token) return setStaffAccess(null);
    loadStaffAccess(token).then((r) => setStaffAccess(r.ok ? r.data : null));
  }, [token]);

  useEffect(() => {
    if (res?.r.status === "ok") document.title = `${res.r.data.displayName} · Vinili & Caffè`;
  }, [res]);

  if (!id) {
    if (!ready) return <Skeleton />;
    return (
      <Message icon={<Disc3 />} title="Di chi è questo profilo?" text="Accedi con Discord per vedere il tuo profilo, oppure cerca un membro nelle classifiche.">
        <button type="button" onClick={login} className={primary}>
          <LogIn className="size-4" /> Accedi con Discord
        </button>
        <a href={page("/classifiche/")} className={ghost}>
          <Trophy className="size-4" /> Classifiche
        </a>
      </Message>
    );
  }

  if (!res || res.id !== id) return <Skeleton />;
  const r = res.r;

  if (r.status === "notfound")
    return (
      <Message icon={<Disc3 />} title="Utente non trovato" text="Questo ID non corrisponde a nessun membro registrato nel server.">
        <a href={page("/classifiche/")} className={ghost}>
          <Trophy className="size-4" /> Vai alle classifiche
        </a>
      </Message>
    );

  if (r.status === "error")
    return (
      <Message icon={<Disc3 />} title="Profilo non disponibile" text="Non sono riuscito a caricare il profilo in questo momento.">
        <button type="button" onClick={() => setRetry((n) => n + 1)} className={primary}>
          <RotateCcw className="size-4" /> Riprova
        </button>
        <a href={page("/classifiche/")} className={ghost}>
          <Trophy className="size-4" /> Classifiche
        </a>
      </Message>
    );

  const p = r.data;
  const owns = !!user && user.id === p.userId;
  /* mai stato nel server principale: niente statistiche, rank card o ruoli (sono di quel server) */
  const outsider = !p.inGuild && !p.level?.exp && !p.messages?.messagesTotal && !p.roles.length;
  const targetIsStaff = p.roles.some((x) => STAFF_ROLE_IDS.has(x.id));
  const showStaffTab = Boolean(staffAccess && token && targetIsStaff);
  const goTab = (t: "community" | "staff", uid = p.userId) => router.push(`/user/?id=${uid}${t === "staff" ? "&tab=staff" : ""}`, { scroll: false });

  return (
    <>
      <AlbumCover p={p} tab={tab} showStaffTab={showStaffTab} onTab={goTab} />
      {showStaffTab && tab === "staff" ? (
        <StaffCardView token={token!} userId={p.userId} access={staffAccess!} onNavigate={(uid) => goTab("staff", uid)} />
      ) : (
        <div className="space-y-20 pb-20 pt-2 sm:pt-4">
          {outsider ? null : <Tracklist p={p} />}
          <div className="mx-auto max-w-5xl space-y-20 px-6">
            {outsider ? null : <RankCard p={p} owns={owns} />}
            {outsider ? null : <CustomStuff p={p} owns={owns} />}
            {outsider ? null : <CandyCollection p={p} />}
            <ProfileBoards userId={p.userId} owns={owns} token={token} />
            {outsider ? null : <RolesList p={p} />}
          </div>
        </div>
      )}
    </>
  );
}
