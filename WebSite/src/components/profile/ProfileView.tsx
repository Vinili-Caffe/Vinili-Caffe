"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Disc3, LogIn, RotateCcw, Trophy } from "lucide-react";
import { StaffCardView } from "@/components/staffcard/StaffCardView";
import { loadStaffAccess, type StaffAccess } from "@/lib/staff";
import { useAuth } from "@/lib/auth";
import { guildProfileAsData, isUserId, loadGuildProfile, loadProfile, loadProfileGuilds, type GuildProfile, type ProfileGuild, type ProfileResult } from "@/lib/profile";
import { ServerSwitcher } from "./ServerSwitcher";
import { GuildStaffView } from "./GuildStaffView";
import { page } from "@/lib/site";
import { AlbumCover } from "./AlbumCover";
import { CandyCollection, CustomStuff, RankCard, RolesList } from "./ProfileSections";
import { ProfileBoards } from "./ProfileBoards";
import { BotPrefsCard } from "./BotPrefsCard";
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
  /* profilo per server: server in comune (con il login) e quello scelto (?g=) */
  const [guilds, setGuilds] = useState<ProfileGuild[]>([]);
  const [gp, setGp] = useState<{ key: string; r: { ok: true; data: GuildProfile } | { ok: false; message: string } } | null>(null);
  const [staffSince, setStaffSince] = useState<string | null>(null);
  /* badge partnership scelti (server principale): stanno nella testata del profilo staff */
  const [pmBadges, setPmBadges] = useState<{ uid: string; node: React.ReactNode } | null>(null);
  const mainId = guilds.find((x) => x.isMain)?.id || null;
  const rawG = params.get("g");
  const guildSel = rawG && guilds.some((x) => x.id === rawG && !x.isMain) ? rawG : null;

  useEffect(() => {
    if (!id || !token) return;
    let alive = true;
    void loadProfileGuilds(token, id).then((list) => alive && setGuilds(list));
    return () => {
      alive = false;
    };
  }, [id, token]);

  useEffect(() => {
    if (!id || !token || !guildSel) return;
    let alive = true;
    const key = `${guildSel}:${id}`;
    void loadGuildProfile(token, guildSel, id).then((r) => alive && setGp({ key, r }));
    return () => {
      alive = false;
    };
  }, [id, token, guildSel]);

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

  const goGuild = (gid: string) => {
    const g = gid && gid !== mainId ? `&g=${gid}` : "";
    setStaffSince(null);
    router.push(`/user/?id=${id}${g}${tab === "staff" ? "&tab=staff" : ""}`, { scroll: false });
  };
  const switcher =
    guilds.length > 1 || (guilds.length === 1 && !guilds[0].isMain) ? (
      <ServerSwitcher guilds={guilds} current={guildSel || mainId || guilds[0].id} onGo={goGuild} />
    ) : null;

  /* un altro server: testata con i dati di quel server (le statistiche sono del principale) */
  if (guildSel) {
    if (!gp || gp.key !== `${guildSel}:${id}`) return <Skeleton />;
    if (!gp.r.ok)
      return (
        <>
          <div className="mx-auto flex max-w-5xl justify-center px-4 pt-24">{switcher}</div>
          <Message icon={<Disc3 />} title="Profilo non disponibile" text={gp.r.message} />
        </>
      );
    const gd = gp.r.data;
    /* Partner Manager di quel server: tab Staff con le statistiche di +profile */
    const pmTab = gd.isPartnerManager && Boolean(token);
    const goGuildTab = (t: "community" | "staff", uid = id) => router.push(`/user/?id=${uid}&g=${guildSel}${t === "staff" ? "&tab=staff" : ""}`, { scroll: false });
    return (
      <>
        <AlbumCover
          p={guildProfileAsData(gd)}
          tab={pmTab ? tab : "community"}
          showStaffTab={pmTab}
          onTab={goGuildTab}
          topSlot={switcher}
          calendarGuildId={guildSel}
          serverName={gd.guild.name || undefined}
        />
        {pmTab && tab === "staff" ? (
          <GuildStaffView
            token={token!}
            guildId={guildSel}
            userId={gd.userId}
            owns={Boolean(user && user.id === gd.userId)}
            serverName={gd.guild.name || undefined}
            onNavigate={(uid) => goGuildTab("staff", uid)}
          />
        ) : (
          <div className="mx-auto max-w-5xl px-6 pb-20 pt-2 sm:pt-4">
            <ProfileBoards key={guildSel} userId={gd.userId} owns={Boolean(user && user.id === gd.userId)} token={token} guildId={guildSel} />
          </div>
        )}
      </>
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
      <AlbumCover p={p} tab={tab} showStaffTab={showStaffTab} onTab={goTab} topSlot={switcher} staffSince={showStaffTab && tab === "staff" ? staffSince : null} />
      {showStaffTab && tab === "staff" ? (
        <>
          <StaffCardView
            token={token!}
            userId={p.userId}
            access={staffAccess!}
            onNavigate={(uid) => goTab("staff", uid)}
            onTenure={setStaffSince}
            extraFlags={pmBadges?.uid === p.userId ? pmBadges.node : null}
          />
          {/* Partner Manager anche sul principale: statistiche partnership, badge e obiettivi (preferenze se è il tuo) */}
          {mainId ? (
            <GuildStaffView
              token={token!}
              guildId={mainId}
              userId={p.userId}
              owns={owns}
              hideNavigator
              serverName="Vinili & Caffè"
              onNavigate={(uid) => goTab("staff", uid)}
              onBadges={(node) => setPmBadges({ uid: p.userId, node })}
            />
          ) : null}
        </>
      ) : (
        <div className="space-y-20 pb-20 pt-2 sm:pt-4">
          {outsider ? null : <Tracklist p={p} />}
          <div className="mx-auto max-w-5xl space-y-20 px-6">
            {outsider ? null : <RankCard p={p} owns={owns} />}
            {outsider ? null : <CustomStuff p={p} owns={owns} />}
            {outsider ? null : <CandyCollection p={p} />}
            <ProfileBoards userId={p.userId} owns={owns} token={token} />
            {owns && token ? <BotPrefsCard token={token} /> : null}
            {outsider ? null : <RolesList p={p} />}
          </div>
        </div>
      )}
    </>
  );
}
