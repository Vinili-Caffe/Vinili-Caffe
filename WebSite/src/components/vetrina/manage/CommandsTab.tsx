"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileJson, KeyRound, Plus, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { BOT_STATS_API_URL, loadBotApi, regenBotApiKey, saveBotCommands, type BoardListing, type BotApiInfo, type BotCommand } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { confirmDialog, showToast } from "@/components/ui";
import { Notice, RowsSkeleton, TrackUnsaved } from "@/components/dashboard/guild/bits";

const TYPES: { id: BotCommand["type"]; label: string }[] = [
  { id: "slash", label: "Slash" },
  { id: "prefix", label: "Prefisso" },
  { id: "user", label: "Utente" },
  { id: "message", label: "Messaggio" },
];
const INPUT = "h-10 w-full min-w-0 rounded-xl bg-espresso/60 px-3 text-sm text-crema ring-1 ring-sand/15 outline-none placeholder:text-crema/30 focus:ring-caramel/50";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "mai");

/** Comandi del bot (a mano, da file JSON o mandati dal bot) e chiave API per server e comandi. */
export function CommandsTab({ listing, token }: { listing: BoardListing; token: string }) {
  const [api, setApi] = useState<BotApiInfo | null>(null);
  const [cmds, setCmds] = useState<BotCommand[] | null>(null);
  const [saved, setSaved] = useState("[]");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadBotApi(token, listing.id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      setApi(r.data.api);
      setCmds(r.data.commands || []);
      setSaved(JSON.stringify(r.data.commands || []));
    });
    return () => {
      alive = false;
    };
  }, [token, listing.id]);

  if (err) return <Notice error>{err}</Notice>;
  if (!api || !cmds) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(cmds) !== saved;
  const setRow = (i: number, p: Partial<BotCommand>) => setCmds(cmds.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? "" : c)), 1800);
      },
      () => showToast("Copia non riuscita", true),
    );
  };

  const newKey = async () => {
    if (api.hasKey && !(await confirmDialog({ message: "Creare una nuova chiave? Quella attuale smette subito di funzionare.", danger: true }))) return;
    setBusy("key");
    const r = await regenBotApiKey(token, listing.id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setKey(r.data.key);
    setApi(r.data.api);
    showToast(r.data.message || "Nuova chiave creata");
  };

  const save = async () => {
    setBusy("save");
    const r = await saveBotCommands(token, listing.id, cmds.filter((c) => c.name.trim()));
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setCmds(r.data.commands);
    setSaved(JSON.stringify(r.data.commands));
    showToast(r.data.message || "Comandi salvati");
  };

  /* file JSON: l'elenco che si manda a Discord (o un array di { name, description }) */
  const importFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const arr: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.commands) ? data.commands : [];
      const list = arr
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object" && (c as { name?: unknown }).name))
        .map((c) => {
          const t = Number(c.type);
          const opts = Array.isArray(c.options) ? (c.options as { name: string; type: number; required?: boolean }[]) : [];
          const usage = opts
            .filter((o) => o && o.name && ![1, 2].includes(Number(o.type)))
            .map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`))
            .join(" ");
          return {
            name: String(c.name).slice(0, 64),
            description: String(c.description || "").slice(0, 200),
            type: (t === 2 ? "user" : t === 3 ? "message" : c.type === "prefix" ? "prefix" : "slash") as BotCommand["type"],
            usage: String(c.usage || usage).slice(0, 200),
            category: String(c.category || "").slice(0, 40),
          };
        });
      if (!list.length) return showToast("Nel file non ho trovato comandi.", true);
      setCmds(list.slice(0, 150));
      showToast(`Importati ${list.length} comandi: ricordati di salvare.`);
    } catch {
      showToast("Il file non è un JSON valido.", true);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const curl = `curl -X POST "${BOT_STATS_API_URL}" \\\n  -H "Authorization: ${key || "LA_TUA_CHIAVE"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"serverCount": 1234, "commands": [ … ]}'`;
  const js = `// ogni ora, dal tuo bot (discord.js)
await fetch("${BOT_STATS_API_URL}", {
  method: "POST",
  headers: { Authorization: process.env.VINILI_VETRINA_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    serverCount: client.guilds.cache.size,
    commands: [...(await client.application.commands.fetch()).values()],
  }),
});`;

  return (
    <div className="space-y-6">
      <div className="border-b border-sand/10 pb-6">
        <h2 className="font-display text-4xl font-semibold">Comandi e API</h2>
        <p className="mt-1 max-w-2xl text-crema/55">I comandi compaiono nella scheda del bot. Puoi scriverli qui, importarli da un file o farli mandare dal bot insieme al numero di server.</p>
      </div>

      {api.own ? (
        <Notice>Questo è il bot di Vinili &amp; Caffè: numero di server e comandi slash li leggiamo direttamente da Discord.</Notice>
      ) : null}

      {/* chiave API */}
      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <h3 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <KeyRound className="size-5 text-caramel" /> Chiave API
        </h3>
        <p className="mt-1 text-sm text-crema/60">Con questa chiave il bot manda numero di server e comandi. Al massimo una richiesta al minuto: una ogni ora basta.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Server" value={api.serverCount ? api.serverCount.toLocaleString("it-IT") : "—"} hint={api.serverCountAt ? `aggiornato ${when(api.serverCountAt)}` : "ancora nessun dato"} />
          <Stat label="Comandi" value={String(api.commandsCount)} />
          <Stat label="Ultima richiesta" value={when(api.lastPostAt)} />
        </div>

        {key ? (
          <div className="mt-4 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/35">
            <p className="text-sm font-semibold text-crema">La tua chiave: copiala ora, non si vedrà più.</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-ink/40 p-1.5 pl-3 ring-1 ring-sand/10">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-crema/85">{key}</code>
              <CopyBtn on={copied === "key"} onClick={() => copy("key", key)} />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-crema/55">{api.hasKey ? `Chiave attiva, finisce con …${api.keyHint}.` : "Nessuna chiave: creane una per collegare il bot."}</p>
        )}
        <button
          type="button"
          disabled={busy === "key"}
          onClick={() => void newKey()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", busy === "key" && "animate-spin")} /> {api.hasKey ? "Crea una nuova chiave" : "Crea la chiave"}
        </button>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CodeBox title="Dal bot (discord.js)" code={js} copied={copied === "js"} onCopy={() => copy("js", js)} />
          <CodeBox title="Prova da terminale" code={curl} copied={copied === "curl"} onCopy={() => copy("curl", curl)} />
        </div>
      </section>

      {/* comandi */}
      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Terminal className="size-5 text-caramel" /> Comandi ({cmds.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15">
              <FileJson className="size-4" /> Importa JSON
            </button>
            <button
              type="button"
              disabled={cmds.length >= 150}
              onClick={() => setCmds([...cmds, { name: "", description: "", type: "slash", usage: "", category: "" }])}
              className="inline-flex items-center gap-1.5 rounded-full bg-caramel px-3.5 py-2 text-sm font-bold text-ink disabled:opacity-50"
            >
              <Plus className="size-4" /> Aggiungi
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
        </div>
        <p className="mt-1 text-sm text-crema/55">Il JSON può essere l&apos;elenco dei comandi che registri su Discord: nome, descrizione e opzioni li leggiamo da lì.</p>

        {cmds.length ? (
          <ul className="mt-5 space-y-2">
            {cmds.map((c, i) => (
              <li key={i} className="grid grid-cols-1 gap-2 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10 md:grid-cols-[8rem_minmax(0,12rem)_minmax(0,1fr)_auto]">
                <select value={c.type} onChange={(e) => setRow(i, { type: e.target.value as BotCommand["type"] })} className={INPUT} aria-label="Tipo">
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input value={c.name} onChange={(e) => setRow(i, { name: e.target.value.slice(0, 64) })} placeholder="nome" aria-label="Nome" className={cn(INPUT, "font-mono")} />
                <input value={c.description} onChange={(e) => setRow(i, { description: e.target.value.slice(0, 200) })} placeholder="Cosa fa" aria-label="Descrizione" className={INPUT} />
                <button type="button" aria-label="Togli" onClick={() => setCmds(cmds.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-xl text-crema/45 hover:bg-[#a83a2c]/20 hover:text-[#f0a493]">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl bg-espresso/45 px-3 py-8 text-center text-sm text-crema/55 ring-1 ring-sand/10">Ancora nessun comando.</p>
        )}
      </section>

      <TrackUnsaved dirty={dirty} onSave={save} onReset={() => setCmds(JSON.parse(saved) as BotCommand[])} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10">
      <p className="text-xs font-semibold text-crema/45">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-crema/45">{hint}</p> : null}
    </div>
  );
}

function CopyBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors", on ? "bg-emerald-500/15 text-emerald-300" : "bg-crema/[0.06] text-crema/80 hover:bg-crema/10")}
    >
      {on ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {on ? "Copiato" : "Copia"}
    </button>
  );
}

function CodeBox({ title, code, copied, onCopy }: { title: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="min-w-0 rounded-2xl bg-ink/40 ring-1 ring-sand/10">
      <div className="flex items-center justify-between gap-2 border-b border-sand/10 px-3 py-2">
        <span className="text-xs font-semibold text-crema/60">{title}</span>
        <CopyBtn on={copied} onClick={onCopy} />
      </div>
      <pre data-lenis-prevent className="overflow-x-auto p-3 text-xs leading-relaxed text-crema/80">
        <code>{code}</code>
      </pre>
    </div>
  );
}
