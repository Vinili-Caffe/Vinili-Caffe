"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BellRing, Plus, Trash2 } from "lucide-react";
import { communityApi, emptyDraft, type ChatReminder, type CommunityData } from "@/lib/dashboard-community";
import { EditorHeader, Field, FormGroup, Notice, RowsSkeleton, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { DiscordMessagePreview, DraftEditor, EditorWithPreview, sampleVars } from "./shared";

/**
 * Promemoria a rotazione che il bot manda in chat sul server principale (vota, recensioni, ticket…).
 * Alla prima apertura il bot importa quelli che usa adesso; da lì valgono quelli salvati qui.
 */
export function ChatRemindersSection({
  guildId,
  token,
  data,
  onToast,
  onEditingChange,
}: {
  guildId: string;
  token: string;
  data: CommunityData;
  onToast: (msg: string, err?: boolean) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [items, setItems] = useState<ChatReminder[] | null>(null);
  const [max, setMax] = useState(40);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draftItem, setDraftItem] = useState<ChatReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const vars = useMemo(() => sampleVars(data), [data]);

  useEffect(() => {
    let alive = true;
    void communityApi.listChatReminders(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setItems(r.data.items);
        setMax(r.data.max || 40);
        setImported(r.data.imported === true);
      } else setLoadError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  useEffect(() => {
    onEditingChange?.(draftItem != null);
  }, [draftItem, onEditingChange]);

  const persist = async (next: ChatReminder[], okMsg: string) => {
    setBusy(true);
    const r = await communityApi.saveChatReminders(token, guildId, next);
    setBusy(false);
    if (!r.ok) {
      onToast(r.message, true);
      return false;
    }
    setItems(r.data.items);
    onToast(okMsg);
    return true;
  };

  if (loadError && !items) return <Notice error>{loadError}</Notice>;
  if (!items) return <RowsSkeleton rows={3} />;

  if (draftItem) {
    const isNew = editIdx == null;
    return (
      <div className="space-y-4">
        <EditorHeader
          backLabel="Promemoria in chat"
          onBack={() => {
            setDraftItem(null);
            setEditIdx(null);
          }}
          title={draftItem.name || "Promemoria"}
          subtitle={isNew ? "Non ancora salvato" : draftItem.enabled ? "Attivo" : "Spento"}
          actions={
            <button
              type="button"
              className={primaryMini}
              disabled={busy}
              onClick={async () => {
                const next = isNew ? [...items, draftItem] : items.map((x, i) => (i === editIdx ? draftItem : x));
                if (await persist(next, "Promemoria salvato.")) {
                  setDraftItem(null);
                  setEditIdx(null);
                }
              }}
            >
              Salva
            </button>
          }
        />
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Promemoria">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome (solo per te)">
                    <input value={draftItem.name} maxLength={80} onChange={(e) => setDraftItem({ ...draftItem, name: e.target.value })} className={fieldClass} />
                  </Field>
                  <div className="flex items-end">
                    <label className="flex h-11 w-full items-center justify-between gap-3 rounded-lg bg-espresso/45 px-3 ring-1 ring-sand/10">
                      <span className="text-sm font-semibold text-crema">Attivo</span>
                      <Toggle size="sm" checked={draftItem.enabled} onChange={(enabled) => setDraftItem({ ...draftItem, enabled })} label="Attivo" />
                    </label>
                  </div>
                </div>
              </FormGroup>
              <FormGroup title="Contenuto">
                <DraftEditor value={draftItem.draft} onChange={(draft) => setDraftItem({ ...draftItem, draft })} emojis={data.pickers.emojis} maxButtons={data.limits.buttons} />
              </FormGroup>
              {!isNew ? (
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={busy}
                  onClick={async () => {
                    if (await persist(items.filter((_, i) => i !== editIdx), "Promemoria eliminato.")) {
                      setDraftItem(null);
                      setEditIdx(null);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Elimina
                </button>
              ) : null}
            </div>
          }
          preview={<DiscordMessagePreview bot={data.bot} draft={draftItem.draft} vars={vars} roles={data.pickers.roles} channels={data.pickers.textChannels} />}
        />
      </div>
    );
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    void persist(next, "Ordine salvato.");
  };

  return (
    <FormGroup
      title="Promemoria in chat"
      description="Il bot li manda a rotazione in chat quando c'è movimento (ogni 45 minuti circa, dalle 9 alle 21). Qui li modifichi, li spegni o ne aggiungi di nuovi."
    >
      {imported ? <Notice>Ho importato i promemoria che il bot usava finora: da adesso usa questi.</Notice> : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-crema/55">
          {items.filter((x) => x.enabled).length} attivi su {items.length}
        </p>
        <button
          type="button"
          className={primaryMini}
          disabled={busy || items.length >= max}
          onClick={() => {
            setEditIdx(null);
            setDraftItem({ id: "", name: "", enabled: true, draft: emptyDraft({ embed: { ...emptyDraft().embed, enabled: true, color: "#6f4e37" } }) });
          }}
        >
          <Plus className="size-3.5" /> Nuovo promemoria
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((r, i) => (
          <li key={r.id || i} className="flex items-center gap-2 rounded-xl bg-espresso/45 p-2 ring-1 ring-sand/10">
            <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: r.draft.embed.enabled ? r.draft.embed.color : "#4e5058" }} aria-hidden />
            <button
              type="button"
              onClick={() => {
                setEditIdx(i);
                setDraftItem(r);
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <BellRing className="size-4 shrink-0 text-ember" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema" translate="no">
                {r.name}
              </span>
              {r.enabled ? <StatusBadge tone="ok">Attivo</StatusBadge> : <StatusBadge>Spento</StatusBadge>}
            </button>
            <Toggle size="sm" checked={r.enabled} disabled={busy} onChange={(enabled) => void persist(items.map((x, j) => (j === i ? { ...x, enabled } : x)), enabled ? "Promemoria attivato." : "Promemoria spento.")} label={`Attiva ${r.name}`} />
            <button type="button" aria-label="Sposta su" className={miniBtn} disabled={busy || i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" aria-label="Sposta giù" className={miniBtn} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </FormGroup>
  );
}
