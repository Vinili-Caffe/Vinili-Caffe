"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Frown, Handshake, Loader2, RotateCcw, Swords, Trophy, Users } from "lucide-react";
import { activityInstanceId, activityShare, isDiscordActivity } from "@/lib/discordActivity";
import {
  createDuel,
  DUEL_LABEL,
  duelPath,
  getDuel,
  guessDuel,
  joinDuel,
  sendDuelToCall,
  type DuelGame,
  type DuelState,
} from "@/lib/duel";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";

/**
 * Una partita di allenamento o di sfida: crea o entra nella stanza, la tiene aggiornata
 * (in sfida ogni secondo e mezzo, per vedere come va l'avversario) e manda i tentativi.
 */
export function useDuel(game: DuelGame, mode: "duel" | "practice", lang: string, joinId?: string | null) {
  const [state, setState] = useState<DuelState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /* false finché non si è provato a riprendere la partita lasciata a metà */
  const [ready, setReady] = useState(false);
  const id = state?.id || "";

  /* la partita in corso di questo gioco: cambiando scheda o gioco si riprende da lì */
  const curKey = `vc-duel-cur:${game}:${mode}`;
  const remember = useCallback(
    (next: DuelState) => {
      setState(next);
      try {
        localStorage.setItem(curKey, next.id);
      } catch {
        /* ignore */
      }
    },
    [curKey],
  );
  const forget = useCallback(() => {
    try {
      localStorage.removeItem(curKey);
    } catch {
      /* ignore */
    }
  }, [curKey]);

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    const r = await createDuel(game, mode, lang);
    setBusy(false);
    if (r.ok) remember(r);
    else setError("Non riesco a creare la partita. Riprova tra poco.");
  }, [game, mode, lang, remember]);

  /* entrare con il link di una sfida, o riprendere quella lasciata a metà */
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(curKey) || "";
    } catch {
      /* ignore */
    }
    const target = joinId || saved;
    if (!target) {
      setReady(true);
      return;
    }
    let alive = true;
    setBusy(true);
    void joinDuel(target).then((r) => {
      if (!alive) return;
      setBusy(false);
      setReady(true);
      if (r.ok) remember(r);
      else if (joinId) {
        setError(r.error === "full" ? "Questa sfida è già cominciata tra altri due giocatori." : r.error === "not_found" ? "Questa sfida non c'è più." : r.error === "self" ? "Non puoi accettare una sfida creata da te: mandala a qualcun altro." : "Non riesco a entrare nella sfida.");
      } else forget();
    });
    return () => {
      alive = false;
    };
  }, [joinId, curKey, remember, forget]);

  /* in sfida: si guarda come va l'altro finché la partita non è finita */
  const live = state?.mode === "duel" && state.status !== "finished";
  useEffect(() => {
    if (!id || !live) return;
    const t = window.setInterval(() => {
      void getDuel(id).then((r) => {
        if (r.ok) setState(r);
      });
    }, 1500);
    return () => window.clearInterval(t);
  }, [id, live]);

  const guess = useCallback(
    async (value: string | number) => {
      if (!id) return { ok: false as const, message: "" };
      const r = await guessDuel(id, value);
      if (r.ok) setState(r);
      return r.ok ? { ok: true as const } : { ok: false as const, message: r.message || "Tentativo non valido." };
    },
    [id],
  );

  /* «Nuova sfida» o «Un'altra»: la partita finita non si riprende più */
  const reset = useCallback(() => {
    forget();
    setState(null);
    setError("");
  }, [forget]);

  return { state, error, busy, ready, start, guess, reset };
}

/** Prima di cominciare una sfida: cosa succede, e il tasto per crearla */
export function DuelIntro({ game, busy, onStart }: { game: DuelGame; busy: boolean; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-roast/80 p-6 text-center ring-1 ring-sand/12">
      <Swords className="mx-auto size-8 text-caramel" />
      <p className="mt-3 font-display text-2xl text-crema">Sfida un amico</p>
      <p className="mt-2 text-sm text-crema/65">
        {game === "angle" ? "Lo stesso angolo per tutti e due" : game === "quad" ? "Le stesse quattro parole per tutti e due" : "La stessa parola per tutti e due"}: vince chi
        indovina per primo. Quando qualcuno accetta vedi chi è, e non si prende EXP.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onStart}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-caramel text-sm font-semibold text-ink disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />} Crea la sfida
      </button>
    </div>
  );
}

/** In attesa dell'avversario: il link da mandare (nell'Attività: alla chiamata e con la finestra di Discord) */
export function DuelWaiting({ state }: { state: DuelState }) {
  const [copied, setCopied] = useState(false);
  const [sentCall, setSentCall] = useState(false);
  const inActivity = typeof window !== "undefined" && isDiscordActivity();
  const sentOnce = useRef(false);
  const label = DUEL_LABEL[state.game];
  const text = `Ti sfido a ${label}: vince chi indovina per primo!`;

  /* nell'Attività la sfida arriva subito a chi è già nella chiamata */
  useEffect(() => {
    if (!inActivity || sentOnce.current) return;
    sentOnce.current = true;
    const instance = activityInstanceId();
    if (instance) void sendDuelToCall(instance, state.id).then(setSentCall);
  }, [inActivity, state.id]);

  async function share() {
    if (inActivity) {
      await activityShare(text, `duel-${state.game}-${state.id}`);
      return;
    }
    const link = `${window.location.origin}${page(duelPath(state.game, state.id))}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text, url: link });
        return;
      }
    } catch {
      /* annullato: si copia */
    }
    void navigator.clipboard?.writeText(`${text} ${link}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl bg-roast/80 p-6 text-center ring-1 ring-sand/12">
      <Loader2 className="mx-auto size-7 animate-spin text-caramel" />
      <p className="mt-3 font-display text-2xl text-crema">Aspetto l&apos;avversario</p>
      <p className="mt-2 text-sm text-crema/65">
        {inActivity
          ? sentCall
            ? "La sfida è arrivata a chi è in chiamata. Puoi mandarla anche fuori."
            : "Manda la sfida: si comincia appena entra qualcuno."
          : "Manda il link: si comincia appena qualcuno lo apre."}
      </p>
      <button
        type="button"
        onClick={() => void share()}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-caramel text-sm font-semibold text-ink"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Link copiato" : inActivity ? "Manda su Discord" : "Manda la sfida"}
      </button>
    </div>
  );
}

/** Chi è l'avversario e come sta andando */
export function OpponentBar({ state }: { state: DuelState }) {
  const o = state.opponent;
  if (!o || state.status === "waiting") return null;
  return (
    <div className="mx-auto mb-4 flex max-w-md items-center gap-3 rounded-full bg-crema/[0.06] py-1.5 pl-1.5 pr-4 text-sm text-crema/75 ring-1 ring-sand/12">
      {o.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-crema/10">
          <Users className="size-4 text-caramel" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        Contro <b className="text-crema">{o.name || "Ospite"}</b>
      </span>
      <b className={cn("shrink-0 text-xs", o.solved ? "text-emerald-400" : "text-crema")}>
        {o.solved ? "ha indovinato" : o.done ? "tentativi finiti" : `${o.attempts} di ${state.maxAttempts}`}
      </b>
    </div>
  );
}

/** Fine: vinto, perso o pari, e cosa fare dopo */
export function DuelResult({ state, onAgain }: { state: DuelState; onAgain: () => void }) {
  if (state.status !== "finished") return null;
  const practice = state.mode === "practice";
  const title = practice
    ? state.result === "win"
      ? "Indovinato!"
      : "Non questa volta"
    : state.result === "win"
      ? "Hai vinto!"
      : state.result === "lose"
        ? "Hai perso"
        : "Pari";
  const win = state.result === "win";
  const subtitle = practice
    ? win
      ? `In ${state.me.attempts} su ${state.maxAttempts}`
      : "Tentativi finiti"
    : win
      ? `Hai indovinato prima di ${state.opponent?.name || "Ospite"}`
      : state.result === "lose"
        ? `${state.opponent?.name || "Ospite"} ha indovinato prima di te`
        : `Né tu né ${state.opponent?.name || "Ospite"} avete indovinato`;
  const Icon = win ? Trophy : state.result === "lose" ? Frown : Handshake;
  return (
    /* una scheda a sé, sotto il gioco: titolo, cosa è successo, la soluzione e il tasto */
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mx-auto mt-6 flex w-full max-w-sm flex-col items-center rounded-3xl p-6 text-center ring-1",
        win ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-roast/80 ring-sand/12",
      )}
    >
      <span className={cn("grid size-14 place-items-center rounded-full", win ? "bg-emerald-500/20 text-emerald-300" : "bg-crema/[0.07] text-crema/70")}>
        <Icon className="size-7" />
      </span>
      <p className={cn("mt-3 font-display text-3xl leading-tight", win ? "text-emerald-300" : "text-crema")}>{title}</p>
      <p className="mt-1 text-sm text-crema/60">{subtitle}</p>
      {state.answers?.length ? (
        <p className="mt-3 text-sm text-crema/60">
          {state.answers.length > 1 ? "Le parole erano" : "La parola era"}{" "}
          <b className="font-mono uppercase tracking-wide text-crema">{state.answers.join(" · ")}</b>
        </p>
      ) : state.game === "angle" && state.angle != null ? (
        <p className="mt-3 text-sm text-crema/60">
          Risposta giusta: <b className="font-mono text-crema">{state.angle}°</b>
        </p>
      ) : null}
      <button
        type="button"
        onClick={onAgain}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-caramel text-sm font-semibold text-ink"
      >
        {practice ? <RotateCcw className="size-4" /> : <Swords className="size-4" />}
        {practice ? "Un'altra" : "Nuova sfida"}
      </button>
    </motion.div>
  );
}
