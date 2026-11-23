"use client";

import { useEffect, useState } from "react";
import { LogIn, Disc3, Globe, Users } from "lucide-react";
import { useAuth, avatarUrl, displayName } from "@/lib/auth";
import { formatPartyCode, joinMusicQuizParty, loadPublicMusicQuizParties, type MusicQuizPublicParty } from "@/lib/musicQuiz";
import { cn } from "@/lib/cn";

/** Gate stile Quizei: codice stanza + avatar Discord + Continua. */
export function MusicQuizPartyJoin({
  roomId,
  onJoined,
}: {
  roomId?: string;
  onJoined: (roomId: string) => void;
}) {
  const { token, user } = useAuth();
  const [code, setCode] = useState(() => String(roomId || "").replace(/\D/g, "").slice(0, 6));
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<MusicQuizPublicParty[]>([]);

  /* stanze pubbliche: si entra senza codice */
  useEffect(() => {
    if (!token || roomId) return;
    let alive = true;
    const load = () =>
      void loadPublicMusicQuizParties(token).then((r) => {
        if (alive && r.ok) setOpen(r.data.rooms || []);
      });
    load();
    const id = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [token, roomId]);

  useEffect(() => {
    if (user) setNick(displayName(user));
  }, [user]);

  useEffect(() => {
    if (roomId) setCode(String(roomId).replace(/\D/g, "").slice(0, 6));
  }, [roomId]);

  const digits = code.replace(/\D/g, "").slice(0, 6);
  const readyCode = digits.length === 6;

  async function submit(target = digits) {
    if (!token || target.length !== 6 || busy) return;
    setBusy(true);
    setErr("");
    const r = await joinMusicQuizParty(token, target, { displayName: nick.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    onJoined(target);
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 py-10">
      <div className="w-full rounded-[1.75rem] bg-roast/90 p-6 ring-1 ring-sand/15 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.95)] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-caramel/15 text-caramel ring-1 ring-caramel/30">
            <Disc3 className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-display text-2xl font-semibold text-caramel">Entra nella stanza</p>
          {readyCode ? (
            <>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-crema/45">Stanza</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-crema">{formatPartyCode(digits)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-crema/55">Inserisci il codice a 6 cifre dell&apos;invito.</p>
          )}
        </div>

        <div className="mt-6 border-t border-dashed border-sand/15 pt-6">
          {!roomId || digits.length < 6 ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-crema/45">Codice stanza</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
                placeholder="000 000"
                className="mt-2 w-full rounded-2xl bg-espresso px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-crema outline-none ring-1 ring-sand/20 focus:ring-caramel/50"
              />
            </label>
          ) : null}

          <div className="mt-5 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user ? avatarUrl(user) : "/images/logo-disco.png"}
              alt=""
              className="size-16 rounded-full object-cover ring-2 ring-caramel/40"
            />
            <label className="w-full">
              <span className="text-xs text-crema/50">Scegli un nome visualizzato</span>
              <input
                value={nick}
                onChange={(e) => setNick(e.target.value.slice(0, 32))}
                placeholder="Il tuo nome…"
                className="mt-1.5 w-full rounded-2xl bg-espresso px-4 py-2.5 text-sm text-crema outline-none ring-1 ring-sand/20 focus:ring-caramel/50"
              />
            </label>
          </div>

          {err ? <p className="mt-3 text-center text-sm text-ember">{err}</p> : null}

          <button
            type="button"
            disabled={!readyCode || busy || !token}
            onClick={() => void submit()}
            className={cn(
              "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition",
              readyCode && !busy
                ? "bg-gradient-to-r from-caramel to-ember text-ink hover:-translate-y-0.5"
                : "bg-crema/10 text-crema/40",
            )}
          >
            <LogIn className="size-4" aria-hidden /> Continua
          </button>
        </div>
      </div>

      {!roomId && open.length ? (
        <div className="mt-6 w-full">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-crema/50">
            <Globe className="size-3.5" aria-hidden /> Stanze aperte
          </p>
          <ul className="space-y-2">
            {open.map((r) => (
              <li key={r.roomId}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(r.roomId)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-roast/80 p-2.5 text-left ring-1 ring-sand/12 transition hover:ring-caramel/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.packCover || "/images/logo-disco.png"} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{r.roomName}</span>
                    <span className="block truncate text-xs text-crema/50">
                      {r.packTitle}
                      {r.hostName ? ` · host ${r.hostName}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-crema/[0.07] px-2.5 text-[11px] font-bold tabular-nums leading-none text-crema/75">
                    <Users className="size-3" aria-hidden /> {r.players}/{r.maxPlayers}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
