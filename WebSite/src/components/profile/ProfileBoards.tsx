"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, MessageSquareQuote, Mic2, Repeat2, Trash2 } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/cn";
import { deleteUserBoardItem, loadUserBoards, type BoardItem, type BoardKind, type BoardPage } from "@/lib/user-boards";

const TABS: { kind: BoardKind; label: string; icon: React.ReactNode }[] = [
  { kind: "quote", label: "Quote", icon: <MessageSquareQuote className="size-3.5" /> },
  { kind: "repost", label: "Repost", icon: <Repeat2 className="size-3.5" /> },
  { kind: "clip", label: "Clip", icon: <Mic2 className="size-3.5" /> },
];

function formatWhen(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function Card({
  item,
  owns,
  busyId,
  onDelete,
}: {
  item: BoardItem;
  owns: boolean;
  busyId: string | null;
  onDelete: (item: BoardItem) => void;
}) {
  const title =
    item.kind === "quote"
      ? item.quotedUsername || (item.quotedUserId ? `Utente ${item.quotedUserId.slice(-4)}` : "Citazione")
      : item.authorUsername || (item.sourceAuthorId ? `Utente ${item.sourceAuthorId.slice(-4)}` : item.kind === "clip" ? "Clip" : "Repost");

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-crema/[0.04] ring-1 ring-sand/12">
      {item.previewImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.previewImageUrl} alt="" className="aspect-video w-full object-cover bg-crema/[0.03]" loading="lazy" />
      ) : item.previewAudioUrl ? (
        <div className="flex aspect-video w-full items-center justify-center bg-crema/[0.03] px-4">
          <audio controls preload="none" src={item.previewAudioUrl} className="w-full" />
        </div>
      ) : (
        <div className="flex aspect-[2.2/1] w-full items-center justify-center bg-crema/[0.03] px-4 text-center text-sm text-crema/45">
          {item.content ? <p className="line-clamp-4 text-crema/70">{item.content}</p> : "Anteprima non disponibile"}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-crema">{item.kind === "quote" ? `Citazione di ${title}` : title}</p>
            <p className="mt-0.5 text-xs text-crema/45 lining-nums">{formatWhen(item.createdAt)}</p>
          </div>
          {owns && (
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => onDelete(item)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-crema/50 ring-1 ring-sand/20 transition-colors hover:bg-crema/10 hover:text-ember disabled:opacity-40"
              aria-label="Elimina"
              title="Elimina"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        {item.content && item.previewImageUrl ? <p className="line-clamp-2 text-sm text-crema/60">{item.content}</p> : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {item.boardUrl ? (
            <a
              href={item.boardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12"
            >
              <ExternalLink className="size-3" /> Bacheca
            </a>
          ) : null}
          {item.originUrl && item.kind !== "clip" ? (
            <a
              href={item.originUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 hover:bg-crema/12"
            >
              <ExternalLink className="size-3" /> Originale
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ProfileBoards({ userId, owns, token }: { userId: string; owns: boolean; token: string | null }) {
  const [kind, setKind] = useState<BoardKind>("quote");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BoardPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const reload = useCallback(
    async (k: BoardKind, p: number) => {
      setLoading(true);
      setErr("");
      const out = await loadUserBoards(k, userId, p);
      setData(out);
      setLoading(false);
      if (!out) setErr("Non riesco a caricare questa bacheca.");
    },
    [userId],
  );

  useEffect(() => {
    void reload(kind, page);
  }, [kind, page, reload]);

  const onTab = (k: BoardKind) => {
    setKind(k);
    setPage(1);
  };

  const onDelete = async (item: BoardItem) => {
    if (!token || !owns) return;
    if (!window.confirm("Eliminare questa voce dalla bacheca Discord?")) return;
    setBusyId(item.id);
    const res = await deleteUserBoardItem(item.kind, item.id, token);
    setBusyId(null);
    if (!res.ok) {
      setErr(res.message || "Eliminazione non riuscita.");
      return;
    }
    await reload(kind, page);
  };

  return (
    <Reveal>
      <div className="mb-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
          <MessageSquareQuote className="size-4" /> Bacheca
        </p>
        <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">Quote, repost e clip</h2>
        <p className="mt-2 max-w-2xl text-sm text-crema/55">Le stesse voci di <code className="text-crema/70">+myquote</code>, <code className="text-crema/70">+myrepost</code> e <code className="text-crema/70">+myclip</code>.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => onTab(t.kind)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-colors",
              kind === t.kind ? "bg-caramel/20 text-crema ring-caramel/40" : "bg-crema/6 text-crema/65 ring-sand/20 hover:bg-crema/10 hover:text-crema",
            )}
          >
            {t.icon} {t.label}
            {data && data.kind === t.kind ? <span className="lining-nums text-crema/45">· {data.total}</span> : null}
          </button>
        ))}
      </div>

      {err ? <p className="mb-4 text-sm text-ember">{err}</p> : null}

      {loading ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/5] rounded-2xl bg-crema/[0.05]" />
          ))}
        </div>
      ) : !data || data.total === 0 ? (
        <p className="rounded-2xl bg-crema/[0.04] px-5 py-8 text-center text-sm text-crema/50 ring-1 ring-sand/12">
          Nessuna voce in questa sezione.
        </p>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <Card key={item.id} item={item} owns={owns} busyId={busyId} onDelete={onDelete} />
            ))}
          </ul>
          {data.totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex size-9 items-center justify-center rounded-full bg-crema/8 ring-1 ring-sand/20 disabled:opacity-35"
                aria-label="Pagina precedente"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold lining-nums text-crema/70">
                {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="inline-flex size-9 items-center justify-center rounded-full bg-crema/8 ring-1 ring-sand/20 disabled:opacity-35"
                aria-label="Pagina successiva"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </Reveal>
  );
}
