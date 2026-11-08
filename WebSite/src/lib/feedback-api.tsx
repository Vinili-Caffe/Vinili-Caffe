"use client";

import { createContext, useContext } from "react";
import {
  addComment,
  createFeedback,
  decideFeedback,
  deleteComment,
  deleteOwnFeedback,
  editComment,
  editFeedback,
  loadFeedback,
  staffDeleteFeedback,
  voteComment,
  voteFeedback,
  type Board,
  type Comment,
  type Kind,
  type Status,
  type Suggestion,
  type Topic,
  type Viewer,
} from "@/lib/feedback";
import {
  commentBotFeedback,
  decideBotFeedback,
  deleteOwnBotFeedback,
  loadBotFeedback,
  staffDeleteBotFeedback,
  voteBotFeedback,
  type BotFeedbackItem,
  type BotFeedbackViewer,
} from "@/lib/bot-feedback";

/**
 * La stessa lavagna dei feedback per due archivi diversi:
 * - sito (/feedback): suggerimenti della community, con argomenti, schede staff e azioni sui commenti;
 * - dashboard del bot: feedback su Vinili (/webhooks/site-bot-feedback), senza argomenti né azioni sui commenti.
 * I componenti chiedono le funzioni qui e nascondono quello che l'archivio non supporta.
 */

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

export type FeedbackApi = {
  id: "site" | "bot";
  /** argomenti (Server, Staff, Sito…) nel composer, nei filtri e sui biglietti */
  topics: boolean;
  /** schede Community / Staff */
  boards: boolean;
  /** modifica, elimina e voto sui commenti */
  commentActions: boolean;
  /** foto nei commenti */
  commentImages: boolean;
  draftKey: string;
  liveTopics: string[];
  load: (board: Board, token: string | null) => Promise<Res<{ suggestions: Suggestion[]; viewer: Viewer }>>;
  create: (token: string, b: { board: Board; kind: Kind; tag: Topic; content: string; images: string[] }) => Promise<Res<Suggestion>>;
  edit: (token: string, id: string, b: { kind: Kind; tag: Topic; content: string }) => Promise<Res<Suggestion>>;
  deleteOwn: (token: string, id: string) => Promise<Res<unknown>>;
  vote: (token: string, id: string, d: "up" | "down") => Promise<Res<Suggestion>>;
  addComment: (token: string, id: string, content: string, parent?: string, images?: string[]) => Promise<Res<Suggestion>>;
  editComment: (token: string, id: string, cid: string, content: string) => Promise<Res<Suggestion>>;
  deleteComment: (token: string, id: string, cid: string) => Promise<Res<Suggestion>>;
  voteComment: (token: string, id: string, cid: string, d: "up" | "down") => Promise<Res<Suggestion>>;
  decide: (token: string, id: string, status: Status, reason: string) => Promise<Res<Suggestion>>;
  staffDelete: (token: string, id: string) => Promise<Res<unknown>>;
};

export const SITE_FEEDBACK_API: FeedbackApi = {
  id: "site",
  topics: true,
  boards: true,
  commentActions: true,
  commentImages: true,
  draftKey: "suggestions:new",
  liveTopics: ["suggestions"],
  load: loadFeedback,
  create: createFeedback,
  edit: editFeedback,
  deleteOwn: deleteOwnFeedback,
  vote: voteFeedback,
  addComment,
  editComment,
  deleteComment,
  voteComment,
  decide: decideFeedback,
  staffDelete: staffDeleteFeedback,
};

/* ── adattatore feedback del bot → stessa forma dei suggerimenti del sito ── */

function botComment(c: BotFeedbackItem["comments"][number]): Comment {
  const x = c as BotFeedbackItem["comments"][number] & Partial<Comment>;
  return {
    id: x.id,
    userId: x.userId,
    authorName: x.authorName,
    authorAvatarUrl: x.authorAvatarUrl,
    content: x.content,
    imageUrls: [],
    parentCommentId: x.parentCommentId,
    createdAt: x.createdAt || new Date(0).toISOString(),
    updatedAt: x.updatedAt || undefined,
    upvoteCount: x.upvoteCount ?? 0,
    downvoteCount: x.downvoteCount ?? 0,
    upvotedByViewer: x.upvotedByViewer ?? false,
    downvotedByViewer: x.downvotedByViewer ?? false,
  };
}

function botItem(i: BotFeedbackItem): Suggestion {
  const created = i.createdAt || new Date(0).toISOString();
  return {
    id: i.id,
    userId: i.userId,
    authorName: i.authorName,
    authorAvatarUrl: i.authorAvatarUrl,
    content: i.content,
    kind: i.kind,
    tag: "bots",
    imageUrls: i.imageUrls || [],
    status: i.status,
    staffReason: i.staffReason || "",
    decidedAt: i.decidedAt,
    createdAt: created,
    updatedAt: i.updatedAt || created,
    comments: (i.comments || []).map(botComment),
    commentCount: i.commentCount ?? (i.comments || []).length,
    upvoteCount: i.upvoteCount,
    downvoteCount: i.downvoteCount,
    upvotedByViewer: i.upvotedByViewer,
    downvotedByViewer: i.downvotedByViewer,
  };
}

function botViewer(v: BotFeedbackViewer): Viewer {
  return v ? { id: v.id, name: v.name, canModerateSuggestions: v.canModerate, canAccessStaffBoard: false } : null;
}

function itemOrFail(r: Res<{ item?: BotFeedbackItem; message?: string }>): Res<Suggestion> {
  if (!r.ok) return r;
  return r.data.item ? { ok: true, data: botItem(r.data.item) } : { ok: false, message: r.data.message || "Risposta non valida." };
}

const notForBot = async (): Promise<Res<Suggestion>> => ({ ok: false, message: "Non disponibile per i feedback del bot." });

async function botEdit(token: string, id: string, content: string, kind: Kind): Promise<Res<Suggestion>> {
  try {
    const r = await fetch(`/webhooks/site-bot-feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, kind }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) return { ok: false, message: j?.message || "Operazione non riuscita." };
    return itemOrFail({ ok: true, data: j });
  } catch {
    return { ok: false, message: "Connessione instabile: riprova." };
  }
}

export const BOT_FEEDBACK_API: FeedbackApi = {
  id: "bot",
  topics: false,
  boards: false,
  commentActions: false,
  commentImages: false,
  draftKey: "bot_feedback:new",
  liveTopics: ["bot_feedback"],
  load: async (_board, token) => {
    const r = await loadBotFeedback(token);
    if (!r.ok) return r;
    return { ok: true, data: { suggestions: (r.data.items || []).map(botItem), viewer: botViewer(r.data.viewer) } };
  },
  create: async (token, b) => {
    const r = await fetch("/webhooks/site-bot-feedback", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: b.content, kind: b.kind, images: b.images }),
    })
      .then((x) => x.json())
      .catch(() => null);
    if (!r?.ok) return { ok: false, message: r?.message || "Operazione non riuscita." };
    return itemOrFail({ ok: true, data: r });
  },
  edit: (token, id, b) => botEdit(token, id, b.content, b.kind),
  deleteOwn: deleteOwnBotFeedback,
  vote: async (token, id, d) => itemOrFail(await voteBotFeedback(token, id, d)),
  addComment: async (token, id, content, parent) => itemOrFail(await commentBotFeedback(token, id, content, parent ?? null)),
  editComment: notForBot,
  deleteComment: notForBot,
  voteComment: notForBot,
  decide: async (token, id, status, reason) => itemOrFail(await decideBotFeedback(token, id, status, reason)),
  staffDelete: staffDeleteBotFeedback,
};

const FeedbackApiContext = createContext<FeedbackApi>(SITE_FEEDBACK_API);

export function FeedbackApiProvider({ api, children }: { api: FeedbackApi; children: React.ReactNode }) {
  return <FeedbackApiContext.Provider value={api}>{children}</FeedbackApiContext.Provider>;
}

export function useFeedbackApi() {
  return useContext(FeedbackApiContext);
}
