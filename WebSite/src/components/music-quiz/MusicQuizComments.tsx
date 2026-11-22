"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { loadMusicQuizComments, postMusicQuizComment } from "@/lib/musicQuiz";

export function MusicQuizComments({ slug }: { slug: string }) {
  const { token } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Array<{ id: string; authorName: string; content: string }>>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !slug) return;
    let alive = true;
    void loadMusicQuizComments(token, slug).then((r) => {
      if (!alive || !r.ok) return;
      setRows(r.data.comments || []);
    });
    return () => {
      alive = false;
    };
  }, [token, slug]);

  async function send() {
    if (!token || text.trim().length < 2) return;
    setBusy(true);
    const r = await postMusicQuizComment(token, slug, text.trim());
    setBusy(false);
    if (!r.ok) return;
    setText("");
    setRows(r.data.comments || []);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-crema/45">
        {t("musicQuiz.comments")}
      </h2>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("musicQuiz.commentPh")}
          className="min-w-0 flex-1 rounded-xl bg-roast/80 px-3 py-2 text-sm text-crema outline-none ring-1 ring-sand/15"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="rounded-xl bg-caramel px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          {t("musicQuiz.commentSend")}
        </button>
      </div>
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id || c.content} className="rounded-xl bg-ink/25 px-3 py-2 text-sm ring-1 ring-sand/10">
            <span className="font-medium text-crema/70">{c.authorName}</span>
            <p className="mt-0.5 text-crema/85">{c.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
