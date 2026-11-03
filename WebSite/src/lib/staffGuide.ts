// Guida staff: GET /webhooks/site-staff-guide[?section=]
// Handler: Vinili/Utils/Web/siteStaffGuideApi.js — UI: staff-guide-page.js

import { staffFetch, type ApiRes } from "./staff";

export type GuideMentionNames = {
  users?: Record<string, string>;
  roles?: Record<string, string>;
  channels?: Record<string, string>;
};

export type GuideSectionMeta = {
  id: string;
  label: string;
  description?: string;
  parent?: string | null;
  /** Emoji Discord custom `<:name:id>` / `<a:name:id>` per l’indice. */
  emoji?: string;
};

export type GuideSection = GuideSectionMeta & {
  markdown: string;
  /** Mention Discord grezze (`<@&id>` / `<#id>`); preferire con `names` per le pill. */
  markdownRaw?: string;
  html?: string;
  names?: GuideMentionNames;
  children?: GuideSectionMeta[];
};

export type GuideIndex = {
  ok: true;
  sections: GuideSectionMeta[];
  intro: {
    title: string;
    markdown: string;
    markdownRaw?: string;
    html?: string;
    names?: GuideMentionNames;
  };
};

export type GuideSectionPayload = { ok: true; section: GuideSection };

const BASE = "/webhooks/site-staff-guide";

export function loadGuideIndex(token: string): Promise<ApiRes<GuideIndex>> {
  return staffFetch<GuideIndex>(BASE, token);
}

export function loadGuideSection(token: string, sectionId: string): Promise<ApiRes<GuideSectionPayload>> {
  return staffFetch<GuideSectionPayload>(`${BASE}?section=${encodeURIComponent(sectionId)}`, token);
}

export function topLevelSections(sections: GuideSectionMeta[]): GuideSectionMeta[] {
  return (sections || []).filter((s) => !s.parent);
}

export function childrenOf(sections: GuideSectionMeta[], parentId: string): GuideSectionMeta[] {
  return (sections || []).filter((s) => String(s.parent || "") === parentId);
}
