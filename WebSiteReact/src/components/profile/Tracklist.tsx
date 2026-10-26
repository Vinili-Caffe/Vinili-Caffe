import { Reveal } from "@/components/Reveal";
import { fmt, hours, type ProfileData } from "@/lib/profile";
import { page } from "@/lib/site";

import { NumberTicker } from "@/components/ui/number-ticker";

/** Valore finale con la sua unità: il numero sale contando (Number Ticker). */
type Track = { no: string; title: string; detail: string; n: number; fmt: (n: number) => string; rank?: number; board: string };

// formattatori stabili (fuori dal componente): il ticker li usa a ogni frame
const asInt = (n: number) => fmt(n);
const asExp = (n: number) => `${fmt(n)} EXP`;
const asHours = (n: number) => `${fmt(n)} h`;

/** Statistiche profilo: crescita (EXP) e attività (messaggi / vocale). */
export function Tracklist({ p }: { p: ProfileData }) {
  const sideA: Track[] = [
    { no: "01", title: "Livello", detail: `${fmt(p.level?.exp)} EXP in totale`, n: p.level?.level ?? 0, fmt: asInt, rank: p.level?.rank, board: "level" },
    { no: "02", title: "Questa settimana", detail: `moltiplicatore EXP ×${p.multiplier.toFixed(1).replace(".", ",")}`, n: p.weekly?.weeklyExp ?? 0, fmt: asExp, rank: p.weekly?.rank, board: "weekly" },
    { no: "03", title: "Minigames", detail: `serie migliore ${p.minigames?.bestStreak ?? 0} · attuale ${p.minigames?.currentStreak ?? 0}`, n: p.minigames?.minigameTotalExp ?? 0, fmt: asExp, rank: p.minigames?.rank, board: "minigames" },
  ];
  const sideB: Track[] = [
    { no: "01", title: "Messaggi", detail: `${fmt(p.messages?.messagesWeekly)} questa settimana · ${fmt(p.messages?.messagesDaily)} oggi`, n: p.messages?.messagesTotal ?? 0, fmt: asInt, rank: p.messages?.rank, board: "messages" },
    { no: "02", title: "In vocale", detail: `${hours(p.voice?.voiceWeeklySeconds)} h questa settimana · ${hours(p.voice?.voiceDailySeconds)} h oggi`, n: (p.voice?.voiceTotalSeconds ?? 0) / 3600, fmt: asHours, rank: p.voice?.rank, board: "voice" },
  ];

  const side = (label: string, tracks: Track[], delay: number) => (
    <Reveal delay={delay} className="h-full">
      <div className="h-full rounded-3xl bg-paper p-6 text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] sm:p-7">
        <p className="flex items-center justify-between border-b-2 border-ink/15 pb-3 font-display text-xl font-bold">
          {label} <span className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/45">server</span>
        </p>
        <ol className="mt-2 divide-y divide-ink/10">
          {tracks.map((t) => (
            <li key={`${label}-${t.no}`} className="flex items-center gap-4 py-3.5">
              <span className="w-7 shrink-0 font-mono text-xs font-bold text-ink/40">{t.no}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-ink/55 lining-nums">{t.detail}</span>
              </span>
              <span className="shrink-0 text-right">
                <NumberTicker value={t.n} format={t.fmt} className="block font-display text-2xl font-bold leading-none lining-nums tabular-nums" />
                {t.rank ? (
                  <a href={page("/classifiche/")} className="mt-1 inline-block text-xs font-semibold text-[#9a5a24] lining-nums hover:underline" title={`Classifica ${t.board}`}>
                    #{fmt(t.rank)} in classifica
                  </a>
                ) : (
                  <span className="mt-1 block text-xs text-ink/40">fuori classifica</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Reveal>
  );

  return (
    <section className="mx-auto max-w-5xl px-6">
      <Reveal className="mb-6">
        <p className="font-script text-4xl text-caramel">Statistiche</p>
        <h2 className="font-display text-4xl font-semibold sm:text-5xl">I tuoi numeri</h2>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2">
        {side("Crescita", sideA, 0)}
        {side("Attività", sideB, 0.08)}
      </div>
    </section>
  );
}
