"use client";

import { useEffect, useState } from "react";
import { LogIn, Disc3 } from "lucide-react";
import { useAuth, avatarUrl, displayName } from "@/lib/auth";
import { formatPartyCode, joinMusicQuizParty } from "@/lib/musicQuiz";
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
              <p className="mt-4 text-xs font-semibold text-crema/45">Stanza</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-crema">{formatPartyCode(digits)}</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-crema/55">Inserisci il codice a 6 cifre dell&apos;invito.</p>
          )}
        </div>

        <div className="mt-6 border-t border-dashed border-sand/15 pt-6">
          {!roomId || digits.length < 6 ? (
            <label className="block">
              <span className="text-xs font-semibold text-crema/45">Codice stanza</span>
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
                ? "bg-caramel text-ink "
                : "bg-crema/10 text-crema/40",
            )}
          >
            <LogIn className="size-4" aria-hidden /> Continua
          </button>
        </div>
      </div>

    </div>
  );
}
